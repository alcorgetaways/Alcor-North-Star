import { sendGmail, GmailNotConfiguredError } from "@/lib/gmail.server";

/**
 * Sends one email as "Alcor North Star <admin@alcorgetaways.com>" through the linked
 * Gmail connector (owner decision: Gmail, not Resend). The old Hostinger SMTP path
 * (smtp.server.ts) and the Resend path stay in the repo, disabled — not deleted.
 * Throws EmailNotConfiguredError while the Gmail connector secrets are missing — the
 * worker then leaves rows pending without counting an attempt.
 */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not set up yet");
    this.name = "EmailNotConfiguredError";
  }
}

export async function sendEmail(opts: { to: string; cc?: string[]; subject: string; body: string; html?: string }): Promise<void> {
  if (!opts.to) throw new Error("No recipient address on the message");
  try {
    await sendGmail({ to: opts.to, ...(opts.cc ? { cc: opts.cc } : {}), subject: opts.subject, text: opts.body });
  } catch (e) {
    if (e instanceof GmailNotConfiguredError) throw new EmailNotConfiguredError();
    throw e;
  }
}
