import { inr, pct as fmtPct } from "@/lib/format";
export type KpiStatus = "green" | "yellow" | "red" | "none";

export function kpiStatus(pct: number | null | undefined): KpiStatus {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "none";
  if (pct >= 90) return "green";
  if (pct >= 70) return "yellow";
  return "red";
}

export const STATUS_LABEL: Record<KpiStatus, string> = {
  green: "On Track",
  yellow: "Needs Push",
  red: "Below Target",
  none: "No Data",
};

export const STATUS_CLASS: Record<KpiStatus, string> = {
  green: "bg-success/12 text-success border-success/30",
  yellow: "bg-warning/15 text-warning-foreground border-warning/40",
  red: "bg-destructive/12 text-destructive border-destructive/30",
  none: "bg-muted text-muted-foreground border-border",
};

export const STATUS_DOT: Record<KpiStatus, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  none: "bg-muted-foreground/40",
};

/** Re-exported from the shared format module (kept here for existing imports). */
export function pct(value: number | null | undefined, digits = 0): string {
  return fmtPct(value, digits >= 1 ? 1 : 0);
}

export function growth(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function average(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/** Weighted North Star score across active pipelines. */
export function northStarScore(
  rows: Array<{ achievement: number | null; weight: number }>,
): number | null {
  const clean = rows.filter((r) => typeof r.achievement === "number" && r.weight > 0);
  if (!clean.length) return null;
  const totalWeight = clean.reduce((a, r) => a + r.weight, 0);
  if (!totalWeight) return null;
  return clean.reduce((a, r) => a + (r.achievement as number) * r.weight, 0) / totalWeight;
}

export function monthKey(date?: Date): string {
  // Default: the running month in India time, whatever the browser's timezone.
  if (!date) return `${new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7)}-01`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(month: string | null | undefined): string {
  if (!month) return "—";
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthOptions(count = 18): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    out.push({ value, label: monthLabel(value) });
  }
  return out;
}

export function formatValue(value: number | null | undefined, type: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "currency") return `₹${Number(value).toLocaleString("en-IN")}`;
  if (type === "percentage") return `${Number(value)}%`;
  if (type === "rating") return Number(value).toFixed(1);
  return Number(value).toLocaleString("en-IN");
}

/** Client-safe phrasing for a performance level. */
export function clientTone(pctValue: number | null): string {
  if (pctValue === null) return "We are collecting this month's data.";
  if (pctValue >= 100) return "We exceeded the target set for this month.";
  if (pctValue >= 90) return "We achieved almost all of this month's target and momentum is strong.";
  if (pctValue >= 70)
    return `We achieved ${pctValue.toFixed(0)}% of this month's target and have identified the next actions to improve performance.`;
  return `We achieved ${pctValue.toFixed(0)}% of this month's target. We have reviewed what held performance back and are changing our approach next month.`;
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function weekStart(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function weekLabel(week: string | null | undefined): string {
  if (!week) return "—";
  const start = new Date(`${week}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function weekOptions(count = 12): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const base = new Date(`${weekStart()}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const value = d.toISOString().slice(0, 10);
    out.push({ value, label: weekLabel(value) });
  }
  return out;
}

/** Re-exported from the shared format module (kept here for existing imports). */
export const currency = inr;
