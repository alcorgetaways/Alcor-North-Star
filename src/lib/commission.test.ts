import { describe, expect, it } from "vitest";
import { fmtCommission, parseCommissionInput } from "./commission";

describe("commission display", () => {
  it("shows Not specified for a missing value", () => {
    expect(fmtCommission(null)).toBe("Not specified");
    expect(fmtCommission(undefined)).toBe("Not specified");
  });
  it("shows 0% only for a confirmed zero", () => {
    expect(fmtCommission(0)).toBe("0%");
  });
  it("shows the confirmed percentage", () => {
    expect(fmtCommission(20)).toBe("20%");
  });
  it("blank input means not specified, not zero", () => {
    expect(parseCommissionInput("")).toBeNull();
    expect(parseCommissionInput("0")).toBe(0);
  });
  it("rejects values above 100%", () => {
    expect(() => parseCommissionInput("120")).toThrow();
  });
});
