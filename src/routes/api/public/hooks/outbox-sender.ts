import { createFileRoute } from "@tanstack/react-router";
import { plausibleSecretHeader, secretsMatch } from "@/lib/security-rules";

const MAX_ATTEMPTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Outbox worker — called by pg_cron every 5 minutes with header
 * `x-cron-secret` (value lives in public.cron_secrets, service-role only).
 * Sends pending email rows; on failure stamps the error and increments
 * attempts; after 3 attempts the row is marked failed. If the sender domain
 * isn't verified yet, rows stay pending and no attempt is counted.
 */
export const Route = createFileRoute("/api/public/hooks/outbox-sender")({
  server: {
    handlers: {
      GET: async () => json({ error: "Method not allowed" }, 405),
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > 1024) return json({ error: "Payload too large" }, 413);
        const provided = request.headers.get("x-cron-secret");
        // Reject a missing or malformed secret before touching the database.
        if (!plausibleSecretHeader(provided)) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sec } = await supabaseAdmin
          .from("cron_secrets" as never)
          .select("secret")
          .eq("name", "outbox_sender")
          .maybeSingle();
        const expected = (sec as { secret?: string } | null)?.secret ?? "";
        if (!(await secretsMatch(provided, expected))) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { emailSendingEnabled, sendLoginEmailRow } = await import("@/lib/login-email.server");
        // Nothing is sent until an admin switches email sending on (app_settings.email_sending_enabled).
        if (!(await emailSendingEnabled(supabaseAdmin))) return json({ ok: true, paused: true });

        // Hotel-owner emails (Q59 reports) stay held until the separate owner switch is on,
        // even when the main staff switch is on.
        const { data: ownerSetting } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "owner_emails_enabled")
          .maybeSingle();
        const ownerEmailsEnabled = ownerSetting?.value === true;

        let loginSent = 0;
        const { data: logins } = await supabaseAdmin
          .from("login_emails")
          .select("id, user_id, to_address, attempts")
          .is("sent_at", null)
          .is("failed_at", null)
          .lt("attempts", MAX_ATTEMPTS)
          .order("created_at")
          .limit(10);
        for (const l of logins ?? []) {
          const r = await sendLoginEmailRow(supabaseAdmin, l);
          if (r === "pending") break;
          if (r === "sent") loginSent += 1;
        }

        const { data: rows, error } = await supabaseAdmin
          .from("client_message_outbox")
          .select("id, to_address, cc_addresses, subject, body, attempts")
          .eq("channel", "email")
          // Operational copies and owner reports stay held until their switch is on.
          .or(`held.eq.false,kind.in.(approval_blocker_reminder,activation_request${ownerEmailsEnabled ? ",owner_monthly_report" : ""})`)
          .is("sent_at", null)
          .is("failed_at", null)
          .lt("attempts", MAX_ATTEMPTS)
          .order("created_at")
          .limit(25);
        if (error) return json({ error: error.message }, 500);

        const { sendEmail, EmailNotConfiguredError } = await import("@/lib/email.server");
        const { data: digests } = await supabaseAdmin.from("staff_digest_outbox")
          .select("id,to_address,subject,body,attempts").is("sent_at", null).is("failed_at", null).is("email_skipped", null)
          .lt("attempts", MAX_ATTEMPTS).order("created_at").limit(25);
        for (const digest of digests ?? []) {
          try {
            await sendEmail({ to: digest.to_address ?? "", subject: digest.subject, body: digest.body });
            await supabaseAdmin.from("staff_digest_outbox").update({ sent_at: new Date().toISOString(), held: false, error: null }).eq("id", digest.id);
          } catch (e) {
            if (e instanceof EmailNotConfiguredError) break;
            const attempts = digest.attempts + 1;
            await supabaseAdmin.from("staff_digest_outbox").update({ attempts, error: e instanceof Error ? e.message : "Send failed", failed_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null }).eq("id", digest.id);
          }
        }
        let sent = 0;
        let failed = 0;
        let pending = 0;
        for (const r of rows ?? []) {
          try {
            await sendEmail({
              to: r.to_address ?? "",
              cc: r.cc_addresses,
              subject: r.subject ?? "Alcor North Star",
              body: r.body ?? "",
            });
            await supabaseAdmin
              .from("client_message_outbox")
              .update({ sent_at: new Date().toISOString(), error: null })
              .eq("id", r.id);
            sent += 1;
          } catch (e) {
            if (e instanceof EmailNotConfiguredError) {
              // Domain not verified: leave every row pending, stop this run.
              pending = (rows ?? []).length - sent;
              break;
            }
            const attempts = (r.attempts ?? 0) + 1;
            await supabaseAdmin
              .from("client_message_outbox")
              .update({
                attempts,
                error: e instanceof Error ? e.message : "Send failed",
                failed_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
              })
              .eq("id", r.id);
            failed += 1;
          }
        }
        return json({ ok: true, sent, failed, pending, loginSent });
      },
    },
  },
});
