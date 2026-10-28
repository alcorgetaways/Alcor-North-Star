import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";

/** Audit via supabaseAdmin: log_admin_action is service-role only and takes the actor explicitly. */
async function audit(
  actorId: string,
  action: string,
  targetId: string,
  details?: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("log_admin_action", {
    _actor: actorId,
    _action: action,
    _target_type: "client_credential",
    _target_id: targetId,
    ...(details ? { _details: details as import("@/integrations/supabase/types").Json } : {}),
  });
}

export const saveCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        client_id: z.string().uuid(),
        platform: z.string().min(1).max(100),
        username: z.string().max(200).optional().nullable(),
        password: z.string().max(500).optional().nullable(),
        access_status: z.string().max(30).default("pending"),
        notes: z.string().max(2000).optional().nullable(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { encryptSecret } = await import("./crypto.server");
    const payload = {
      client_id: data.client_id,
      platform: data.platform,
      username: data.username ?? null,
      access_status: data.access_status,
      notes: data.notes ?? null,
      ...(data.password ? { password_cipher: await encryptSecret(data.password) } : {}),
    };


    // RLS restricts writes to admin / management / BD.
    if (data.id) {
      const { error } = await context.supabase
        .from("client_credentials")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "credential_save", data.id, {
        client_id: data.client_id,
        platform: data.platform,
      });
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("client_credentials")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "credential_save", row.id, {
      client_id: data.client_id,
      platform: data.platform,
    });
    return { id: row.id };
  });

export const revealCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isManager } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isManager) throw new Error("Only admins and management can reveal a password");

    // check_rate_limit is service-role only — call through supabaseAdmin.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: withinLimit } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: `cred-reveal:${context.userId}`,
      _max: 20,
      _window_seconds: 3600,
    });
    if (!withinLimit) throw new Error("Too many reveals — please try again later");

    const { data: row, error } = await context.supabase
      .from("client_credentials")
      .select("id, password_cipher")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (!row.password_cipher) return { password: null };

    await context.supabase
      .from("credential_access_log")
      .insert({ credential_id: row.id, user_id: context.userId });

    await audit(context.userId, "credential_reveal", row.id);

    const { decryptSecret } = await import("./crypto.server");
    return { password: await decryptSecret(row.password_cipher) };
  });
