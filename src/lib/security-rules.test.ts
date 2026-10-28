import { describe, expect, it } from "vitest";
import { loginEmailAction, plausibleSecretHeader, randomTempPassword, secretsMatch, targetChangeError } from "./security-rules";

describe("S5 admin targets", () => {
  it("management cannot demote or ban an admin", () => {
    expect(targetChangeError({ callerIsManager: true, callerIsAdmin: false, targetIsAdmin: true, newRole: "team_member" })).toMatch(/Only an admin/);
    expect(targetChangeError({ callerIsManager: true, callerIsAdmin: false, targetIsAdmin: true })).toMatch(/Only an admin/);
  });
  it("management can change a non-admin, but not grant admin", () => {
    expect(targetChangeError({ callerIsManager: true, callerIsAdmin: false, targetIsAdmin: false, newRole: "team_member" })).toBeNull();
    expect(targetChangeError({ callerIsManager: true, callerIsAdmin: false, targetIsAdmin: false, newRole: "admin" })).toMatch(/grant the admin/);
  });
  it("admin can change an admin", () => {
    expect(targetChangeError({ callerIsManager: true, callerIsAdmin: true, targetIsAdmin: true, newRole: "management" })).toBeNull();
  });
  it("non-manager is refused", () => {
    expect(targetChangeError({ callerIsManager: false, callerIsAdmin: false, targetIsAdmin: false })).not.toBeNull();
  });
});

describe("S7 login emails respect the switch", () => {
  it("holds when off, sends when on", () => {
    expect(loginEmailAction(false)).toBe("hold");
    expect(loginEmailAction(true)).toBe("send");
  });
});

describe("S6 per-user temporary passwords", () => {
  it("are long and different every time", () => {
    const a = randomTempPassword();
    const b = randomTempPassword();
    expect(a.length).toBe(24);
    expect(a).not.toBe(b);
  });
});

describe("hook secret compare", () => {
  it("matches only the exact secret", async () => {
    expect(await secretsMatch("abcdefghijklmnop1", "abcdefghijklmnop1")).toBe(true);
    expect(await secretsMatch("abcdefghijklmnop2", "abcdefghijklmnop1")).toBe(false);
    expect(await secretsMatch("", "")).toBe(false);
  });
  it("rejects missing or malformed headers before lookup", () => {
    expect(plausibleSecretHeader(null)).toBe(false);
    expect(plausibleSecretHeader("short")).toBe(false);
    expect(plausibleSecretHeader("x".repeat(300))).toBe(false);
    expect(plausibleSecretHeader("abcdefghijklmnop1")).toBe(true);
  });
});
