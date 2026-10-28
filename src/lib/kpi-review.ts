export const BACKENTRY_DEADLINE = "2026-11-05";
export function reviewWindow(month: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const value = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  const previous = new Date(Date.UTC(value("year"), value("month") - 2, 1)).toISOString().slice(0, 10);
  return month === previous && value("day") >= 1 && value("day") <= 3;
}
export function suggestedMatch(name: string, candidates: Array<{ id: string; name: string }>) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return candidates.find((c) => normalize(c.name) === normalize(name))?.id ?? "";
}
export function requiredMonths(start: string | null, today: string): number | null {
  if (!start) return null;
  const a = new Date(start), b = new Date(today);
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth());
}/** Head/team can review a fetched month: any earlier month any time; last month only 1st–3rd IST; never the running month. */
export function canReviewFetched(month: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(at);
  const value = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  const previous = new Date(Date.UTC(value("year"), value("month") - 2, 1)).toISOString().slice(0, 10);
  return month < previous || reviewWindow(month, at);
}
/** QA-12: the single review rule for every fetched-data screen; partial (running-month) rows are never reviewable. */
export function fetchedRowOpen(row: { month: string; is_partial?: boolean | null }, at: Date) {
  return !row.is_partial && canReviewFetched(row.month, at);
}
/** Query-key prefixes shared by every fetched-data view; invalidate all after any review action. */
export const FETCHED_QUERY_PREFIXES = [["fetched-kpis"], ["fetched-source"]] as const;
export const FETCHED_STATUS_LABEL: Record<string, string> = { fetched: "Fetched", confirmed: "Reviewed", approved: "Approved" };
/** "Before Alcor" when the month is earlier than the pipeline start; internal clients never get the label. */
export function alcorPeriod(month: string, start: string | null | undefined, internal: boolean): "Before Alcor" | "Alcor" | null {
  if (internal) return null;
  if (!start) return null;
  return month.slice(0, 7) < start.slice(0, 7) ? "Before Alcor" : "Alcor";
}
