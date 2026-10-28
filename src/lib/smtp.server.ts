/**
 * Minimal SMTP client (implicit TLS, port 465, AUTH LOGIN) that works on the
 * Cloudflare Worker runtime (cloudflare:sockets) and in local Node dev (node:tls).
 * Credentials come from SMTP_USER / SMTP_PASSWORD and are never logged.
 */
type Conn = { write(s: string): Promise<void>; readLine(): Promise<string>; close(): Promise<void> };

async function openTls(host: string, port: number): Promise<Conn> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";
  const isWorker = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (isWorker) {
    const mod = (await import(/* @vite-ignore */ "cloudflare:" + "sockets")) as {
      connect: (a: { hostname: string; port: number }, o: { secureTransport: "on" }) => {
        readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): Promise<void>;
      };
    };
    const sock = mod.connect({ hostname: host, port }, { secureTransport: "on" });
    const reader = sock.readable.getReader();
    const writer = sock.writable.getWriter();
    return {
      write: (s) => writer.write(enc.encode(s)),
      async readLine() {
        while (!buf.includes("\r\n")) {
          const { value, done } = await reader.read();
          if (done) throw new Error("SMTP connection closed");
          buf += dec.decode(value, { stream: true });
        }
        const i = buf.indexOf("\r\n");
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        return line;
      },
      close: () => sock.close().catch(() => undefined),
    };
  }
  const tls = await import("node:tls");
  const socket = tls.connect({ host, port, servername: host });
  const waiters: Array<() => void> = [];
  let closed = false;
  socket.on("data", (d: Buffer) => { buf += d.toString("utf8"); waiters.splice(0).forEach((w) => w()); });
  socket.on("close", () => { closed = true; waiters.splice(0).forEach((w) => w()); });
  socket.on("error", () => { closed = true; waiters.splice(0).forEach((w) => w()); });
  await new Promise<void>((res, rej) => { socket.once("secureConnect", () => res()); socket.once("error", rej); });
  return {
    write: (s) => new Promise((res, rej) => socket.write(s, (e?: Error | null) => (e ? rej(e) : res()))),
    async readLine() {
      while (!buf.includes("\r\n")) {
        if (closed) throw new Error("SMTP connection closed");
        await new Promise<void>((r) => waiters.push(r));
      }
      const i = buf.indexOf("\r\n");
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      return line;
    },
    close: async () => { socket.end(); },
  };
}

async function expect(c: Conn, code: string) {
  let line = await c.readLine();
  while (line.length > 3 && line[3] === "-") line = await c.readLine(); // multi-line reply
  if (!line.startsWith(code)) throw new Error(`SMTP error: ${line.slice(0, 200)}`);
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export type SmtpMessage = { to: string; cc?: string[]; subject: string; text: string; html?: string };

export const SMTP_FROM_NAME = "Alcor North Star";
export const SMTP_HOST = "smtp.hostinger.com";
export const SMTP_PORT = 465;

export class SmtpNotConfiguredError extends Error {
  constructor() { super("SMTP_USER / SMTP_PASSWORD are not set yet"); this.name = "SmtpNotConfiguredError"; }
}

export async function sendSmtp(msg: SmtpMessage): Promise<void> {
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASSWORD"];
  if (!user || !pass) throw new SmtpNotConfiguredError();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(msg.to)) throw new Error("Invalid recipient address");
  const cc = [...new Set(msg.cc ?? [])];
  if (cc.some(v=>!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v))) throw new Error("Invalid CC recipient address");
  const c = await openTls(SMTP_HOST, SMTP_PORT);
  try {
    await expect(c, "220");
    await c.write("EHLO northstar.alcorgetaways.com\r\n"); await expect(c, "250");
    await c.write("AUTH LOGIN\r\n"); await expect(c, "334");
    await c.write(`${b64(user)}\r\n`); await expect(c, "334");
    await c.write(`${b64(pass)}\r\n`);
    try { await expect(c, "235"); } catch { throw new Error("SMTP login was rejected — check SMTP_USER and SMTP_PASSWORD"); }
    await c.write(`MAIL FROM:<${user}>\r\n`); await expect(c, "250");
    await c.write(`RCPT TO:<${msg.to}>\r\n`); await expect(c, "25");
    for (const recipient of cc) { await c.write(`RCPT TO:<${recipient}>\r\n`); await expect(c,"25"); }
    await c.write("DATA\r\n"); await expect(c, "354");
    const boundary = `ns-${crypto.randomUUID()}`;
    const headers = [
      `From: ${SMTP_FROM_NAME} <${user}>`,
      `To: <${msg.to}>`,
      ...(cc.length ? [`Cc: ${cc.map(v=>`<${v}>`).join(", ")}`] : []),
      `Subject: ${encodeHeader(msg.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${user.split("@")[1]}>`,
      "MIME-Version: 1.0",
      msg.html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : "Content-Type: text/plain; charset=UTF-8",
      msg.html ? "" : "Content-Transfer-Encoding: base64",
    ].filter(Boolean);
    const wrap = (s: string) => b64(s).replace(/.{1,76}/g, "$&\r\n");
    const body = msg.html
      ? [`--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(msg.text),
         `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(msg.html),
         `--${boundary}--`].join("\r\n")
      : wrap(msg.text);
    await c.write(`${headers.join("\r\n")}\r\n\r\n${body}\r\n.\r\n`);
    await expect(c, "250");
    await c.write("QUIT\r\n");
  } finally {
    await c.close();
  }
}
