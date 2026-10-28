/** Commission display: NULL = "Not specified", 0 = a confirmed 0%. One rule for every screen. */
export function fmtCommission(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "Not specified";
  const n = Number(v);
  if (!Number.isFinite(n)) return "Not specified";
  return `${n}%`;
}

/** Parse an edit-form value: blank → null (not specified), otherwise a number. */
export function parseCommissionInput(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Commission must be between 0 and 100%, or blank for not specified");
  return n;
}

export const COMMISSION_FIELDS = [
  { key: "commission_direct_pct", label: "Direct" },
  { key: "commission_ota_pct", label: "OTA" },
  { key: "commission_weddings_pct", label: "Weddings / events" },
] as const;
