import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";

const TEST_RECIPIENT = "mohnish@group2001.in";
const STAFF_ROLES = ["admin", "management", "bd_manager", "pipeline_manager", "team_member", "finance", "hr"];

type Ctx = { supabase: { rpc: (fn: "has_role", a: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }> }; userId: string };

async function assertAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Only an admin can do this");
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function audit(actor: string, action: string, target: string, outcome: string, details: Record<string, unknown>) {
  const a = await admin();
  await a.rpc("log_admin_action", {
    _actor: actor, _action: action, _target_type: "login_email", _target_id: target, _outcome: outcome, _details: details as never,
  });
}

/** Status for the admin Email panel: switch, SMTP configured, queues. Never returns secrets. */
export const getEmailStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const a = await admin();
    const [{ data: setting }, { data: logins }, { data: outbox }] = await Promise.all([
      a.from("app_settings").select("value").eq("key", "email_sending_enabled").maybeSingle(),
      a.from("login_emails").select("id, to_address, source, created_at, sent_at, attempts, error, failed_at").order("created_at", { ascending: false }).limit(200),
      a.from("client_message_outbox").select("id, to_address, kind, subject, created_at, sent_at, attempts, error, failed_at, held").eq("channel", "email").order("created_at", { ascending: false }).limit(200),
    ]);
    return {
      sendingEnabled: setting?.value === true,
      smtpConfigured: Boolean(process.env["SMTP_USER"] && process.env["SMTP_PASSWORD"]),
      logins: logins ?? [],
      outbox: outbox ?? [],
    };
  });

/** How many staff have never had a login email queued or sent. */
export const previewStaffLoginEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    return { count: (await staffWithoutEmail()).length };
  });

async function staffWithoutEmail() {
  const a = await admin();
  const [{ data: roles }, { data: sentRows }, { data: profs }] = await Promise.all([
    a.from("user_roles").select("user_id, role"),
    a.from("login_emails").select("user_id").neq("source", "test").is("failed_at", null),
    a.from("profiles").select("id, email, status"),
  ]);
  const had = new Set((sentRows ?? []).map((r) => r.user_id));
  const staff = new Set((roles ?? []).filter((r) => STAFF_ROLES.includes(r.role)).map((r) => r.user_id));
  return (profs ?? []).filter((p) => staff.has(p.id) && !had.has(p.id) && p.email && p.status !== "inactive");
}

async function sendNow(ids: string[]) {
  const a = await admin();
  const { emailSendingEnabled } = await import("@/lib/login-email.server");
  const { loginEmailAction } = await import("@/lib/security-rules");
  // Main switch off: rows stay queued (held) for the outbox worker; nothing is sent now.
  if (loginEmailAction(await emailSendingEnabled(a)) === "hold") return { held: ids.length } as Record<string, number>;
  const { sendLoginEmailRow } = await import("@/lib/login-email.server");
  const { data: rows } = await a.from("login_emails").select("id, user_id, to_address, attempts").in("id", ids);
  const results: Record<string, number> = {};
  for (const r of rows ?? []) {
    const out = await sendLoginEmailRow(a, r);
    results[out] = (results[out] ?? 0) + 1;
    if (out === "pending") break;
  }
  return results;
}

/** Admin: send the login email to ONE user now. */
export const sendLoginEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const a = await admin();
    const { data: p } = await a.from("profiles").select("email").eq("id", data.userId).maybeSingle();
    if (!p?.email) throw new Error("That user has no email address");
    const { data: row, error } = await a.from("login_emails")
      .insert({ user_id: data.userId, to_address: p.email, source: "manual", requested_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    const results = await sendNow([row.id]);
    await audit(context.userId, "login_email_send", data.userId, results["sent"] ? "ok" : "not_sent", { results });
    return results;
  });

/** Admin: send login emails to every staff member who hasn't had one. */
export const sendStaffLoginEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((d: unknown) => z.object({ expectedCount: z.number().int().min(0).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const targets = await staffWithoutEmail();
    if (targets.length !== data.expectedCount) throw new Error(`The recipient count changed to ${targets.length} — please confirm again`);
    if (!targets.length) return {};
    const a = await admin();
    const { data: rows, error } = await a.from("login_emails")
      .insert(targets.map((t) => ({ user_id: t.id, to_address: t.email!, source: "bulk_staff", requested_by: context.userId })))
      .select("id, user_id");
    if (error) throw new Error(error.message);
    const results = await sendNow((rows ?? []).map((r) => r.id));
    for (const r of rows ?? []) await audit(context.userId, "login_email_send_bulk_staff", r.user_id, "queued", {});
    await audit(context.userId, "login_email_bulk_staff", "staff", "ok", { count: targets.length, results });
    return results;
  });

/** Admin: one fixed test email to the owner's own address — no password, no link. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { sendEmail } = await import("@/lib/email.server");
    try {
      await sendEmail({
        to: TEST_RECIPIENT,
        subject: "Alcor North Star — test email",
        body: `This is a test email from Alcor North Star, sent ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.\nIf you can read this, email sending through Hostinger works.`,
      });
      await audit(context.userId, "email_test_send", TEST_RECIPIENT, "ok", {});
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : "Send failed";
      await audit(context.userId, "email_test_send", TEST_RECIPIENT, "failed", { error: msg });
      return { ok: false as const, error: msg };
    }
  });
