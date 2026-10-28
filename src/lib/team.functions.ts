import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";
import { targetChangeError } from "@/lib/security-rules";
import { LOGIN_URL } from "@/lib/login-url";

const clientSchema = z
  .object({
    client_id: z.string().uuid(),
    origin: z.string().url().max(200).optional(),
  })
  .strict();

/** DB-backed rate limit; throws when the caller exceeds max calls in windowSeconds.
 *  check_rate_limit is service-role only, so this goes through supabaseAdmin. */
async function rateLimit(key: string, max: number, windowSeconds: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ok } = await supabaseAdmin.rpc("check_rate_limit", {
    _key: key,
    _max: max,
    _window_seconds: windowSeconds,
  });
  if (!ok) throw new Error("Too many attempts — please try again later");
}

/** Audit via supabaseAdmin: log_admin_action is service-role only and takes the actor explicitly. */
async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("log_admin_action", {
    _actor: actorId,
    _action: action,
    _target_type: targetType,
    _target_id: targetId,
    _details: details as import("@/integrations/supabase/types").Json,
  });
}

/** List users via the Auth Admin API (service role, loaded inside the handler). */
async function findUserByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === email) ?? null;
  return { supabaseAdmin, user };
}


export const ensureClientLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => clientSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isMgr }, { data: isBD }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "bd_manager" }),
    ]);
    if (!isMgr && !isBD) throw new Error("Only BD and management can send owner logins");
    await rateLimit(`owner-invite:${context.userId}`, 10, 3600);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client, error: cErr } = await supabaseAdmin
      .from("clients")
      .select("id, hotel_name, email, owner_name")
      .eq("id", data.client_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Hotel not found");
    const email = (client.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("This hotel has no owner email. Add it in the Basics step first.");

    const { user: existing } = await findUserByEmail(email);
    if (existing) {
      const [{ data: roles }, { data: prof }] = await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", existing.id),
        supabaseAdmin.from("profiles").select("client_id").eq("id", existing.id).maybeSingle(),
      ]);
      const isClientRole = (roles ?? []).some((r) => r.role === "client");
      const linkedHotel = (prof as { client_id: string | null } | null)?.client_id ?? null;
      if (isClientRole && (linkedHotel === null || linkedHotel === data.client_id)) {
        if (linkedHotel === null) {
          await supabaseAdmin.from("profiles").update({ client_id: data.client_id }).eq("id", existing.id);
        }
        return { status: "exists" as const, email };
      }
      throw new Error(
        `${email} already has a staff login or belongs to another hotel. Use the owner's own email address.`,
      );
    }

    const inviteOptions: Parameters<typeof supabaseAdmin.auth.admin.inviteUserByEmail>[1] = {
      data: { full_name: client.owner_name ?? "", role: "client", client_id: data.client_id },
    };
    inviteOptions.redirectTo = `${LOGIN_URL}/reset-password`; // fixed URL; caller-supplied origin is ignored
    const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, inviteOptions);
    if (invErr) throw new Error(invErr.message);
    const userId = invited.user?.id;
    if (userId) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "client" });
      await supabaseAdmin.from("profiles").update({ client_id: data.client_id }).eq("id", userId);
    }
    return { status: "invited" as const, email };
  });

export const resendClientInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => clientSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isMgr }, { data: isBD }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "bd_manager" }),
    ]);
    if (!isMgr && !isBD) throw new Error("Only BD and management can resend owner logins");
    await rateLimit(`owner-invite:${context.userId}`, 10, 3600);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client, error: cErr } = await supabaseAdmin
      .from("clients")
      .select("id, email")
      .eq("id", data.client_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    const email = (client?.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("This hotel has no owner email. Add it in the Basics step first.");

    const { user } = await findUserByEmail(email);
    if (!user) {
      const inviteOptions: Parameters<typeof supabaseAdmin.auth.admin.inviteUserByEmail>[1] = {
        data: { role: "client", client_id: data.client_id },
      };
      inviteOptions.redirectTo = `${LOGIN_URL}/reset-password`; // fixed URL; caller-supplied origin is ignored
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, inviteOptions);
      if (error) throw new Error(error.message);
      return { sent: "invite" as const, email };
    }
    // Already invited — send a fresh set-password (recovery) link.
    const resetOptions: Parameters<typeof supabaseAdmin.auth.resetPasswordForEmail>[1] = {
      redirectTo: `${LOGIN_URL}/reset-password`,
    };
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, resetOptions);
    if (error) throw new Error(error.message);
    return { sent: "reset" as const, email };
  });

export const transferTeamMemberWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z
      .object({
        from_user: z.string().uuid(),
        default_to: z.string().uuid(),
        module_overrides: z.record(z.string(), z.string().uuid()).default({}),
        deactivate: z.boolean(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Only admins and management can move a teammate's work");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("transfer_team_member_work", {
      _from: data.from_user,
      _default_to: data.default_to,
      _module_overrides: data.module_overrides,
      _deactivate: data.deactivate,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "transfer_work", "user", data.from_user, {
      default_to: data.default_to,
      deactivate: data.deactivate,
    });
    return res as { tasks: number; pipelines: number; actions: number };
  });

export const getClientLoginStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => z.object({ client_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isMgr }, { data: isBD }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "bd_manager" }),
    ]);
    if (!isMgr && !isBD) throw new Error("Not allowed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("email")
      .eq("id", data.client_id)
      .maybeSingle();
    const email = (client?.email ?? "").trim().toLowerCase() || null;
    if (!email) return { status: "none" as const, email: null };

    const { user } = await findUserByEmail(email);
    if (!user) return { status: "none" as const, email };
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
    const isClient = (roles ?? []).some((r) => r.role === "client");
    if (!isClient) return { status: "staff" as const, email };
    return { status: user.last_sign_in_at ? ("active" as const) : ("invited" as const), email };
  });

export const banUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isMgr }, { data: isAdm }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id);
    const denied = targetChangeError({
      callerIsManager: Boolean(isMgr), callerIsAdmin: Boolean(isAdm),
      targetIsAdmin: (targetRoles ?? []).some((r) => r.role === "admin"),
    });
    if (denied) throw new Error(denied);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "ban_user", "user", data.user_id);
    return { ok: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isMgr }, { data: isAdm }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id);
    const denied = targetChangeError({
      callerIsManager: Boolean(isMgr), callerIsAdmin: Boolean(isAdm),
      targetIsAdmin: (targetRoles ?? []).some((r) => r.role === "admin"),
    });
    if (denied) throw new Error(denied);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "none",
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "unban_user", "user", data.user_id);
    return { ok: true };
  });

/**
 * Writes a launch_events row (launch_events has no client INSERT policy, so
 * this goes through the service role after verifying the caller is the launch's
 * Account Manager, or BD/management for the client).
 */
export const logLaunchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z
      .object({
        launch_id: z.string().uuid(),
        kind: z.string().min(1).max(60),
        note: z.string().max(2000).optional(),
        details: z.record(z.string(), z.unknown()).default({}),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: launch } = await supabaseAdmin
      .from("client_launches")
      .select("client_id")
      .eq("id", data.launch_id)
      .maybeSingle();
    if (!launch) throw new Error("Launch not found");
    const [{ data: canEdit }, { data: isAM }] = await Promise.all([
      context.supabase.rpc("can_edit_client", { _client_id: launch.client_id }),
      context.supabase.rpc("is_launch_am", { _launch_id: data.launch_id }),
    ]);
    if (!canEdit && !isAM) throw new Error("Only the Account Manager, BD or management can do this");
    await rateLimit(`launch-event:${context.userId}`, 60, 3600);
    const details = data.note ? { ...data.details, note: data.note } : data.details;
    const { error } = await supabaseAdmin
      .from("launch_events")
      .insert({ launch_id: data.launch_id, user_id: context.userId, kind: data.kind, details: details as never });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
