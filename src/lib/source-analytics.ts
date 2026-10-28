/**
 * Pure helpers for the GBP / Social performance dashboards.
 * Months are "YYYY-MM-01" strings. Flow metrics are summed over a period;
 * cumulative totals (review counts) report the change over the period.
 */
export type Granularity = "month" | "quarter" | "year" | "ytd";
export type Compare = "previous" | "last_year";

export type MonthValues = {
  month: string;
  values: Record<string, number>;
  /** keyword -> best (lowest) Google position that month */
  ranks: Record<string, number>;
  approved: boolean;
};

export const CUMULATIVE = new Set(["reviews_received", "five_star_reviews"]);

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** The months covered by the period ending at/containing `anchor`. */
export function periodMonths(gran: Granularity, anchor: string): string[] {
  const y = anchor.slice(0, 4);
  const m = Number(anchor.slice(5, 7));
  if (gran === "month") return [anchor.slice(0, 7) + "-01"];
  if (gran === "quarter") {
    const q0 = Math.floor((m - 1) / 3) * 3 + 1;
    return [0, 1, 2].map((i) => `${y}-${String(q0 + i).padStart(2, "0")}-01`);
  }
  const last = gran === "year" ? 12 : m;
  return Array.from({ length: last }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}-01`);
}

export function comparisonMonths(gran: Granularity, anchor: string, compare: Compare): string[] {
  if (compare === "last_year") return periodMonths(gran, addMonths(anchor, -12));
  if (gran === "month") return periodMonths(gran, addMonths(anchor, -1));
  if (gran === "quarter") return periodMonths(gran, addMonths(periodMonths(gran, anchor)[0]!, -1));
  if (gran === "year") return periodMonths(gran, addMonths(anchor, -12));
  // YTD vs previous period = same length directly before Jan
  const len = periodMonths(gran, anchor).length;
  return Array.from({ length: len }, (_, i) => addMonths(anchor.slice(0, 4) + "-01-01", i - len));
}

export function periodLabel(gran: Granularity, anchor: string): string {
  const y = anchor.slice(0, 4);
  const m = Number(anchor.slice(5, 7));
  const mon = new Date(Date.UTC(Number(y), m - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
  if (gran === "month") return `${mon} ${y}`;
  if (gran === "quarter") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (gran === "year") return y;
  return `Jan–${mon} ${y}`;
}

/** Period anchors (last month of each period) available for a list of data months, newest first. */
export function periodOptions(gran: Granularity, months: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...months].sort().reverse()) {
    const key = gran === "month" || gran === "ytd" ? m : periodMonths(gran, m).at(-1)!;
    const id = gran === "month" || gran === "ytd" ? m : key;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(gran === "month" || gran === "ytd" ? m : key);
    }
  }
  return out;
}

function getValue(byMonth: Map<string, MonthValues>, month: string, key: string): number | null {
  const v = byMonth.get(month)?.values;
  if (!v) return null;
  if (key === "interactions") {
    const parts = ["calls", "website_clicks", "direction_requests"].map((k) => v[k]);
    return parts.every((p) => p == null) ? null : parts.reduce<number>((s, p) => s + (p ?? 0), 0);
  }
  return v[key] ?? null;
}

/**
 * Value of a metric over a set of months. Flow metrics sum (null if no month has data).
 * Cumulative metrics ("new_reviews" -> reviews_received, "new_five_star" -> five_star_reviews)
 * = total at the last month with data minus total at the month before the period.
 */
export function metricOver(rows: MonthValues[], months: string[], key: string): number | null {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const cum = key === "new_reviews" ? "reviews_received" : key === "new_five_star" ? "five_star_reviews" : null;
  if (cum) {
    // Both end-points must exist for this profile, otherwise the change is unknown (never a fake drop).
    const end = getValue(byMonth, months.at(-1)!, cum);
    const before = getValue(byMonth, addMonths(months[0]!, -1), cum);
    if (end == null || before == null) return null;
    return end - before;
  }
  let any = false;
  let sum = 0;
  for (const m of months) {
    const v = getValue(byMonth, m, key);
    if (v != null) {
      any = true;
      sum += v;
    }
  }
  return any ? sum : null;
}

export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Per-month series for a metric (each month treated as its own period). */
export function monthlySeries(rows: MonthValues[], months: string[], key: string): Array<number | null> {
  return months.map((m) => metricOver(rows, [m], key));
}

/** Group months into buckets for the chart (month / quarter / year). */
export function bucketMonths(months: string[], gran: Granularity): Array<{ label: string; months: string[] }> {
  const g = gran === "ytd" ? "month" : gran;
  const out: Array<{ label: string; months: string[] }> = [];
  for (const m of [...months].sort()) {
    const label = periodLabel(g, m);
    const last = out.at(-1);
    if (last && last.label === label) last.months.push(m);
    else out.push({ label, months: [m] });
  }
  return out;
}

/** Average monthly value before vs since the Alcor start month. */
export function alcorImpact(rows: MonthValues[], start: string | null | undefined, key = "interactions") {
  if (!start) return null;
  const s = start.slice(0, 7);
  const vals = (pred: (m: string) => boolean) =>
    rows.filter((r) => pred(r.month.slice(0, 7))).map((r) => metricOver(rows, [r.month], key)).filter((v): v is number => v != null);
  const before = vals((m) => m < s);
  const since = vals((m) => m >= s);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const b = avg(before);
  const a = avg(since);
  return { before: b, since: a, beforeMonths: before.length, sinceMonths: since.length, uplift: pctChange(a, b) };
}

/** Keyword buckets at a month: Top 3 / Top 10 / Top 20 / beyond. */
export function rankBuckets(ranks: Record<string, number>) {
  const out = { top3: 0, top10: 0, top20: 0, beyond: 0 };
  for (const p of Object.values(ranks)) {
    if (p <= 3) out.top3++;
    else if (p <= 10) out.top10++;
    else if (p <= 20) out.top20++;
    else out.beyond++;
  }
  return out;
}

/** Latest month within `months` that has data. */
export function latestWithData(rows: MonthValues[], months: string[]): MonthValues | undefined {
  const set = new Set(months);
  return [...rows].filter((r) => set.has(r.month)).sort((a, b) => b.month.localeCompare(a.month))[0];
}

// ───────────── Audit rules (Q68) ─────────────
export const CORE_FLOW = ["views", "calls", "website_clicks", "direction_requests"];
const CUM_KEYS = new Set(["new_reviews", "new_five_star"]);

/** Current calendar month in Asia/Kolkata ("YYYY-MM-01"). */
export function istMonth(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 7) + "-01";
}
/** Latest complete month (the running IST month is never counted). */
export function lastCompleteMonth(now = new Date()): string {
  return addMonths(istMonth(now), -1);
}

/**
 * P1: a profile's LEADING run of months where views, calls, website clicks and direction
 * requests are all 0 (or blank) is "Not tracked" — dropped here, so it reads as null, not 0.
 * Also drops the running month and anything later (P3).
 */
export function trackedOnly(rows: MonthValues[], lastComplete: string, applyLeadingRule = true) {
  const sorted = [...rows].filter((r) => r.month <= lastComplete).sort((a, b) => a.month.localeCompare(b.month));
  const untracked: string[] = [];
  let i = 0;
  if (applyLeadingRule)
    while (i < sorted.length && CORE_FLOW.every((k) => !sorted[i]!.values[k])) untracked.push(sorted[i++]!.month);
  return { rows: sorted.slice(i), untracked };
}

/** True when a profile has data for the whole period (flow) or both end-points (review deltas). */
export function covered(rows: MonthValues[], months: string[], key: string): boolean {
  if (CUM_KEYS.has(key)) return metricOver(rows, months, key) != null;
  return months.every((m) => metricOver(rows, [m], key) != null);
}

/** Sum of each profile's own value (review deltas computed per profile, missing ones skipped). */
export function profilesOver(profiles: MonthValues[][], months: string[], key: string): number | null {
  const v = profiles.map((p) => metricOver(p, months, key)).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

/** P2: like-for-like — only profiles tracked in BOTH periods count toward the % change. */
export function compareLike(profiles: MonthValues[][], cur: string[], prev: string[], key: string) {
  const withData = profiles.filter((p) => p.length);
  const both = withData.filter((p) => covered(p, cur, key) && covered(p, prev, key));
  const c = both.length ? profilesOver(both, cur, key) : null;
  const pv = both.length ? profilesOver(both, prev, key) : null;
  return { cur: c, prev: pv, compared: both.length, total: withData.length, pct: pctChange(c, pv) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monShort = (m: string) => MON[Number(m.slice(5, 7)) - 1]!;

/**
 * P3: clip a period to complete months; an incomplete quarter/year compares the SAME months
 * of the comparison period and is labelled e.g. "Jan–Sep 2026 (partial year)".
 */
export function clipPeriod(gran: Granularity, anchor: string, compare: Compare, lastComplete: string) {
  const full = periodMonths(gran, anchor);
  const months = full.filter((m) => m <= lastComplete);
  const partial = (gran === "quarter" || gran === "year") && months.length > 0 && months.length < full.length;
  let cmp = comparisonMonths(gran, anchor, compare);
  if (partial) {
    const shift = compare === "last_year" || gran === "year" ? -12 : -3;
    cmp = months.map((m) => addMonths(m, shift));
  }
  const lbl = (ms: string[]) =>
    ms.length === 1 ? `${monShort(ms[0]!)} ${ms[0]!.slice(0, 4)}` : `${monShort(ms[0]!)}–${monShort(ms.at(-1)!)} ${ms.at(-1)!.slice(0, 4)}`;
  return {
    months,
    cmp,
    partial,
    label: partial ? `${lbl(months)} (partial ${gran})` : periodLabel(gran, anchor),
    cmpLabel: partial ? lbl(cmp) : periodLabel(gran, cmp.at(-1)!),
  };
}

/** P8: rank only profiles with ≥ minBase interactions in the comparison period. */
export function rankGrowth<T>(items: Array<T & { cur: number | null; prev: number | null }>, minBase = 100) {
  return items
    .filter((r) => r.cur != null && r.prev != null && r.prev >= minBase)
    .map((r) => ({ ...r, growth: pctChange(r.cur, r.prev)! }))
    .sort((a, b) => b.growth - a.growth);
}
