import { sendEmail, EmailNotConfiguredError } from "@/lib/email.server";

import { LOGIN_URL } from "@/lib/login-url";
export { LOGIN_URL };
export const MAX_ATTEMPTS = 3;
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", management: "Management", bd_manager: "Business Development", pipeline_manager: "Pipeline Manager",
  team_member: "Team Member", finance: "Finance", hr: "HR", client: "Hotel owner",
};

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Pure text builder — contains only a personal one-time set-password link, never a password. */
export function welcomeEmail(p: { name: string | null; email: string; role: string; link: string; expiresIst: string }) {
  const lines = [
    `Hello ${p.name ?? ""}`.trim() + ",",
    "",
    "Your Alcor North Star account is ready.",
    "",
    `Sign in at: ${LOGIN_URL}`,
    `Login email: ${p.email}`,
    `Your role: ${p.role}`,
    "",
    `Set your own password with this personal one-time link (valid until ${p.expiresIst}):`,
    p.link,
    "",
    "If you did not expect this email, please ignore it.",
    "— Alcor Getaways",
  ];
  return { subject: "Welcome to Alcor North Star", body: lines.join("\n") };
}

/** Sends one login_emails row. Returns 'sent' | 'pending' (SMTP not set) | 'failed' | 'retry'. */
export async function sendLoginEmailRow(admin: Admin, row: { id: string; user_id: string; to_address: string; attempts: number }) {
  const [{ data: prof }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", row.user_id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", row.user_id),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as string);
  const fail = async (msg: string, final = false) => {
    const attempts = row.attempts + 1;
    await admin.from("login_emails").update({
      attempts, error: msg, failed_at: final || attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
    }).eq("id", row.id);
    return final || attempts >= MAX_ATTEMPTS ? "failed" : "retry";
  };
  if (!roleList.length) return fail("User has no role yet", true);
  const email = prof?.email ?? row.to_address;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: `${LOGIN_URL}/reset-password` },
  });
  if (linkErr || !link?.properties?.action_link) return fail("Could not create the set-password link");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }) + " IST";
  const msg = welcomeEmail({
    name: prof?.full_name ?? null, email, role: roleList.map((r) => ROLE_LABEL[r] ?? r).join(", "),
    link: link.properties.action_link, expiresIst: expires,
  });
  try {
    await sendEmail({ to: email, subject: msg.subject, body: msg.body });
  } catch (e) {
    if (e instanceof EmailNotConfiguredError) return "pending";
    return fail(e instanceof Error ? e.message.slice(0, 300) : "Send failed");
  }
  await admin.from("login_emails").update({ sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
  return "sent";
}

export async function emailSendingEnabled(admin: Admin) {
  const { data } = await admin.from("app_settings").select("value").eq("key", "email_sending_enabled").maybeSingle();
  return data?.value === true;
}
