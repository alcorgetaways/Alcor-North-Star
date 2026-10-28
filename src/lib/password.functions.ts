import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Blocks every protected server function while the caller must change their
 * password. Chain AFTER requireSupabaseAuth so context.userId exists.
 * completeForcedPasswordChange itself must NOT use this gate.
 */
export const requirePasswordChanged = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const userId = (context as unknown as { userId?: string }).userId;
    if (userId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("must_change_password")
        .eq("id", userId)
        .maybeSingle();
      if (data?.must_change_password) {
        throw new Error("You must change your password before continuing");
      }
    }
    return next();
  },
);

const changeSchema = z
  .object({
    current_password: z.string().min(1).max(72),
    new_password: z.string().min(10, "At least 10 characters").max(72),
  })
  .strict();

export const completeForcedPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => changeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password, email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.must_change_password) throw new Error("No password change is required");

    if (data.new_password === data.current_password) {
      throw new Error("The new password must be different from the one you were given");
    }

    const email = (profile.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("Your account has no email address");

    // Verify the current password against the auth server before changing it.
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email,
      password: data.current_password,
    });
    if (signInError) throw new Error("The current password you entered is incorrect");

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.new_password,
    });
    if (updateError) throw new Error(updateError.message);

    // Clear the flag only after the password update succeeded (service role passes the trigger).
    const { error: flagError } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (flagError) throw new Error(flagError.message);

    await supabaseAdmin.rpc("log_admin_action", {
      _actor: context.userId,
      _action: "forced_password_change_completed",
      _target_type: "user",
      _target_id: context.userId,
      _details: {},
    });
    return { ok: true };
  });

/**
 * After a successful reset from an emailed one-time link, clear the first-login flag.
 * Only sessions that came from such a link (recovery / invite / one-time code) qualify,
 * so a normal password session cannot use this to skip the forced change.
 */
export const clearPasswordFlagAfterRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = (context as unknown as { claims?: { amr?: Array<{ method?: string } | string> } }).claims;
    const methods = (claims?.amr ?? []).map((m) => (typeof m === "string" ? m : m.method ?? ""));
    if (!methods.some((m) => ["recovery", "invite", "otp", "magiclink", "email/signup"].includes(m))) {
      throw new Error("Open the set-password link from your email to continue");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ must_change_password: false }).eq("id", context.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_admin_action", {
      _actor: context.userId, _action: "password_reset_link_completed", _target_type: "user", _target_id: context.userId, _details: {},
    });
    return { ok: true };
  });
