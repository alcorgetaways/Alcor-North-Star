/**
 * Gmail sender via the linked "mohnish's Gmail" connector (google_mail) through the
 * Lovable connector gateway. Server-side only — LOVABLE_API_KEY and GOOGLE_MAIL_API_KEY
 * must never reach the browser. This is the single active sending path; the Hostinger
 * SMTP (smtp.server.ts) and Resend paths stay in the repo but are not called.
 */

export const GMAIL_FROM = "Alcor North Star <admin@alcorgetaways.com>";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export class GmailNotConfiguredError extends Error {
  constructor() {
    super("Gmail connector is not linked (GOOGLE_MAIL_API_KEY / LOVABLE_API_KEY missing)");
    this.name = "GmailNotConfiguredError";
  }
}

export type GmailMessage = { to: string; cc?: string[]; subject: string; text: string };

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64url(s)}?=`);

function rawMessage(msg: GmailMessage): string {
  const cc = [...new Set(msg.cc ?? [])];
  const headers = [
    `From: ${GMAIL_FROM}`,
    `To: <${msg.to}>`,
    ...(cc.length ? [`Cc: ${cc.map((v) => `<${v}>`).join(", ")}`] : []),
    `Subject: ${encodeHeader(msg.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  return b64url(`${headers.join("\r\n")}\r\n\r\n${msg.text}`);
}

/** Sends one message through Gmail. Returns the Gmail message id. */
export async function sendGmail(msg: GmailMessage): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!apiKey || !connKey) throw new GmailNotConfiguredError();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(msg.to)) throw new Error("Invalid recipient address");
  const cc = [...new Set(msg.cc ?? [])];
  if (cc.some((v) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v))) throw new Error("Invalid CC recipient address");
  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawMessage(msg) }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gmail send failed [${res.status}]: ${body}`);
    throw new Error(`Gmail send failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}
