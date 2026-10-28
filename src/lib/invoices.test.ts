import { describe, expect, it } from "vitest";
import { effectiveInvoiceStatus, lateInterest } from "./invoices";

describe("invoices", () => {
  it("unpaid or part-paid past the due date is overdue; paid never is", () => {
    expect(effectiveInvoiceStatus("unpaid", "2026-10-15", "2026-10-16")).toBe("overdue");
    expect(effectiveInvoiceStatus("part_paid", "2026-10-15", "2026-10-16")).toBe("overdue");
    expect(effectiveInvoiceStatus("unpaid", "2026-10-15", "2026-10-15")).toBe("unpaid");
    expect(effectiveInvoiceStatus("paid", "2026-10-15", "2026-12-01")).toBe("paid");
  });
  it("late interest at 18% p.a. on the unpaid balance", () => {
    // ₹40,000 × 18% × 30 days / 365 = ₹592
    expect(lateInterest(40000, 18, "2026-10-15", "2026-11-14")).toBe(592);
    expect(lateInterest(40000, null, "2026-10-15", "2026-11-14")).toBe(0);
    expect(lateInterest(40000, 18, "2026-10-15", "2026-10-10")).toBe(0);
  });
});
