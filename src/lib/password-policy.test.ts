import { describe, expect, it } from "vitest";
import { validateForcedNewPassword } from "./password-policy";

describe("forced password change rules", () => {
  it("rejects passwords shorter than 10 characters", () => {
    expect(validateForcedNewPassword("Initial123", "Short12", "Short12")).toMatch(/10 characters/);
  });

  it("rejects the initial password as the new password", () => {
    expect(validateForcedNewPassword("Initial123", "Initial123", "Initial123")).toMatch(/different/);
  });

  it("rejects a mismatched confirmation", () => {
    expect(validateForcedNewPassword("Initial123", "NewPassword1", "NewPassword2")).toMatch(/match/);
  });

  it("accepts a valid new password confirmed twice", () => {
    expect(validateForcedNewPassword("Initial123", "NewPassword1", "NewPassword1")).toBeNull();
  });
});
