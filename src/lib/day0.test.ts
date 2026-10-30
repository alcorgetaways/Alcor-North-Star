import { describe, expect, it } from "vitest";
import { day0Checklist } from "./day0";

const full = {
  hasAgreement: true, needsNoc: false, hasNoc: false, advanceAmount: "25000",
  advanceDate: "2026-10-01", reference: "UTR1",
};
const ready = (i: typeof full) => day0Checklist(i).every((x) => x.ok);

describe("Day 0 checklist", () => {
  it("is ready with agreement, advance amount, date and a reference", () => {
    expect(ready(full)).toBe(true);
  });
  it("blocks without the signed agreement", () => {
    expect(ready({ ...full, hasAgreement: false })).toBe(false);
  });
  it("blocks without an advance amount, date, or payment reference", () => {
    expect(ready({ ...full, advanceAmount: "0" })).toBe(false);
    expect(ready({ ...full, advanceDate: "" })).toBe(false);
    expect(ready({ ...full, reference: " " })).toBe(false);
  });
});
