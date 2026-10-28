/**
 * The one number-format module. Every page formats money, counts and
 * percentages through these helpers so the same value always reads the same.
 */

export type MissingReason = "not_tracked" | "not_approved" | "no_target" | "no_data";

export const MISSING_TEXT: Record<MissingReason, string> = {
  not_tracked: "Not tracked yet",
  not_approved: "Not yet approved",
  no_target: "No target set",
  no_data: "No data for this period yet",
};

const isNum = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(Number(v));

/** Full rupees with Indian grouping: ₹6,55,975. */
export function inr(value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Short rupees: ₹950, ₹12.5K, ₹6.6L, ₹1.2Cr. */
export function inrShort(value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  const n = Number(value);
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, "");
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** Whole number with Indian grouping: 1,23,456. */
export function int(value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  return Math.round(Number(value)).toLocaleString("en-IN");
}

/** Percentage with 0–1 decimals (default 0). */
export function pct(value: number | null | undefined, digits: 0 | 1 = 0): string {
  if (!isNum(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

/** Signed percentage change: +12.3% / −4%. */
export function signedPct(value: number | null | undefined, digits: 0 | 1 = 1): string {
  if (!isNum(value)) return "—";
  const v = Number(value);
  const s = Math.abs(v).toFixed(digits).replace(/\.0$/, "");
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}%`;
}
