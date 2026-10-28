export type InvoiceStatus = "unpaid" | "part_paid" | "paid" | "overdue";

export const INVOICE_TYPE_LABEL = {
  retainer: "Retainer",
  add_on: "Add-on",
  commission: "Commission",
  team_incentive: "Team incentive",
  other: "Other",
} as const;

/** Mirrors invoice_effective_status() in the database: anything not fully paid past its due date is overdue. */
export function effectiveInvoiceStatus(status: "unpaid" | "part_paid" | "paid", dueOn: string, todayIso: string): InvoiceStatus {
  return status !== "paid" && dueOn < todayIso ? "overdue" : status;
}

/** Simple late interest on the unpaid balance: balance × rate% p.a. × days late / 365, rounded to the rupee. */
export function lateInterest(balance: number, ratePa: number | null, dueOn: string, todayIso: string): number {
  if (!ratePa || balance <= 0 || todayIso <= dueOn) return 0;
  const days = Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);
  return Math.round((balance * ratePa * days) / 36_500);
}
