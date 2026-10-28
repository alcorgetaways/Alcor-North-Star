/**
 * Reservation Desk periods. Person goals run on the CALENDAR year (Jan–Dec);
 * weeks start on Monday and belong to the year/quarter their Thursday falls in
 * (the database's rd_week_goal uses the same rule).
 */
export type RdPeriod = "week" | "month" | "quarter" | "year";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
};
export function mondayOf(iso: string): string {
  const d = parse(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(iso, -dow);
}

/** [from, to) for the period containing `anchor`. */
export function periodBounds(kind: RdPeriod, anchor: string): { from: string; to: string; label: string } {
  const y = +anchor.slice(0, 4);
  const m = +anchor.slice(5, 7);
  if (kind === "week") {
    const from = mondayOf(anchor);
    const to = addDays(from, 7);
    const f = parse(from);
    return { from, to, label: `Week of ${f.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}` };
  }
  if (kind === "month") {
    const from = `${y}-${pad(m)}-01`;
    const to = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
    return { from, to, label: parse(from).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  if (kind === "quarter") {
    const q = Math.floor((m - 1) / 3);
    const from = `${y}-${pad(q * 3 + 1)}-01`;
    const to = q === 3 ? `${y + 1}-01-01` : `${y}-${pad(q * 3 + 4)}-01`;
    return { from, to, label: `Q${q + 1} ${y} (Jan–Dec year)` };
  }
  return { from: `${y}-01-01`, to: `${y + 1}-01-01`, label: `Calendar year ${y}` };
}

/** Days an associate may still edit their own log: today and yesterday (IST). */
export function editableLogDates(todayIst: string): string[] {
  return [todayIst, addDays(todayIst, -1)];
}

export const GRADE_TONE: Record<string, string> = {
  "A+": "bg-success/15 text-success",
  A: "bg-success/15 text-success",
  B: "bg-primary/10 text-primary",
  C: "bg-warning/15 text-warning-foreground",
  D: "bg-destructive/10 text-destructive",
};
