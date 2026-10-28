export type TimelinePoint = { date: string; value: number };
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};

/** Official MCP uses offset-bearing ISO dates, not bare wall-clock dates. */
export function metricoolTimelineUrl(user: string, brand: string, network: string, subject: string, metric: string, start: string, end: string) {
  const legacy = network === "youtube" && subject === "account" || network === "linkedin" && subject === "stories";
  const url = new URL(legacy ? `https://app.metricool.com/api/stats/timeline/${metric}` : "https://app.metricool.com/api/v2/analytics/timelines");
  const params: Record<string, string> = { userId: user, blogId: brand, timezone: "Asia/Kolkata", integrationSource: "MCP" };
  if (legacy) Object.assign(params, { start: start.replaceAll("-", ""), end: end.replaceAll("-", "") });
  else {
    Object.assign(params, { from: `${start}T00:00:00+05:30`, to: `${end}T23:59:59+05:30`, network, metric });
    if (network === "linkedin") params['metricType'] = subject;
    else if (network === "youtube" && subject === "videos") params['postsType'] = "publishedInRange";
    else params['subject'] = subject;
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

export function timelinePoints(payload: unknown, metric: string, start: string, end: string): TimelinePoint[] {
  const data = object(payload)['data'];
  const series = Array.isArray(data) ? data.find((v) => object(v)['metric'] === metric) : undefined;
  const rows = Array.isArray(payload) ? payload : object(series)['values'];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const rawDate = Array.isArray(r) ? new Date(Number(r[0])).toISOString() : String(object(r)['dateTime'] ?? "");
    const timestamp = Date.parse(rawDate);
    if (!Number.isFinite(timestamp)) return [];
    const date = new Date(timestamp + 330 * 60_000).toISOString().slice(0, 10);
    const raw = Array.isArray(r) ? r[1] : object(r)['value'];
    const value = raw == null || raw === "" ? NaN : Number(raw);
    return date >= start && date <= end && Number.isFinite(value) ? [{ date, value }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}
export function timelineSum(points: TimelinePoint[]): number | null {
  return points.length ? points.reduce((a, p) => a + p.value, 0) : null;
}
/** Boundary dates must actually exist; never subtract the first day of the month. */
export function followerDelta(points: TimelinePoint[], previousEnd: string, end: string): number | null {
  const before = points.find((p) => p.date === previousEnd)?.value;
  const after = points.find((p) => p.date === end)?.value;
  return before == null || after == null ? null : after - before;
}