/** Pure security rules shared by server functions (unit-tested in security-rules.test.ts). */

/** Management may manage ordinary accounts; only an admin may change, ban or unban an admin. */
export function targetChangeError(p: { callerIsManager: boolean; callerIsAdmin: boolean; targetIsAdmin: boolean; newRole?: string }): string | null {
  if (!p.callerIsManager && !p.callerIsAdmin) return "Only admins and management can do this";
  if (p.targetIsAdmin && !p.callerIsAdmin) return "Only an admin can change or deactivate another admin";
  if (p.newRole === "admin" && !p.callerIsAdmin) return "Only an admin can grant the admin role";
  return null;
}

/** Login emails go out only when the main email switch is on; otherwise they stay queued (held). */
export function loginEmailAction(sendingEnabled: boolean): "send" | "hold" {
  return sendingEnabled ? "send" : "hold";
}

/** Random per-user temporary password (never shared, never stored, never emailed). */
export function randomTempPassword(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*-_";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Constant-time string comparison over SHA-256 digests (no length leak). */
export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Cheap shape check done before any database read. */
export function plausibleSecretHeader(v: string | null): v is string {
  return typeof v === "string" && v.length >= 16 && v.length <= 256 && /^[\x21-\x7e]+$/.test(v);
}
