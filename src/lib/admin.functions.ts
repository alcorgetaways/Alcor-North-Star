import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";
import { targetChangeError } from "@/lib/security-rules";

const inviteSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(72),
    full_name: z.string().min(1).max(200),
    mobile: z.string().max(30).optional().nullable(),
    department: z.string().max(100).optional().nullable(),
    role: z.enum(["admin", "management", "bd_manager", "pipeline_manager", "team_member", "client"]),
    client_id: z.string().uuid().optional().nullable(),
  })
  .strict();

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

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isBD }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "bd_manager" }),
    ]);
    if (data.role === "admin") {
      const { data: isSuperAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isSuperAdmin) throw new Error("Only an admin can grant the admin role");
    }
    if (!isAdmin) {
      if (!isBD) throw new Error("You do not have permission to create logins");
      if (data.role !== "client")
        throw new Error("Business development can only create client portal logins");
      if (!data.client_id) throw new Error("Select the hotel this client login belongs to");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        mobile: data.mobile ?? "",
        department: data.department ?? "",
        role: data.role,
        client_id: data.client_id ?? "",
      },
    });
    if (error) throw new Error(error.message);

    const userId = created.user?.id;
    if (userId) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
      await supabaseAdmin
        .from("profiles")
        .update({
          full_name: data.full_name,
          mobile: data.mobile ?? null,
          department: data.department ?? null,
          client_id: data.client_id ?? null,
          email: data.email,
          must_change_password: true,
        })
        .eq("id", userId);
    }
    await audit(context.userId, "invite_user", "user", userId ?? "", { role: data.role });
    return { id: userId };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum([
          "admin",
          "management",
          "bd_manager",
          "pipeline_manager",
          "team_member",
          "client",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
      context.supabase.rpc("is_manager", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id);
    const denied = targetChangeError({
      callerIsManager: Boolean(isAdmin), callerIsAdmin: Boolean(isSuperAdmin),
      targetIsAdmin: (targetRoles ?? []).some((r) => r.role === "admin"), newRole: data.role,
    });
    if (denied) throw new Error(denied);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    await audit(context.userId, "set_role", "user", data.user_id, { role: data.role });
    return { ok: true };
  });

export const setTemporaryPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only an admin can set temporary passwords");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "set_temporary_password", "user", data.user_id);
    const { error: flagError } = await supabaseAdmin.from("profiles")
      .update({ must_change_password: true }).eq("id", data.user_id);
    if (flagError) throw new Error("Password reset succeeded, but the first-login change could not be required");
    return { ok: true };
  });
