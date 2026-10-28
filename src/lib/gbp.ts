export const GBP_METRICS = [
  { key: "posts", label: "Posts done" },
  { key: "photos", label: "Pictures uploaded" },
  { key: "five_star_reviews", label: "5-star reviews (total)" },
  { key: "profile_interactions", label: "Profile interactions" },
  { key: "chat_clicks", label: "Chat clicks" },
  { key: "calls", label: "Calls" },
  { key: "website_clicks", label: "Website clicks" },
  { key: "views", label: "Profile views" },
  { key: "booking_clicks", label: "Booking clicks" },
  { key: "direction_requests", label: "Direction requests" },
] as const;

export type GbpMetric = (typeof GBP_METRICS)[number]["key"];

export type GbpEntry = {
  id?: string;
  month: string;
  posts: number;
  photos: number;
  five_star_reviews: number;
  profile_interactions?: number | null;
  chat_clicks: number;
  calls: number;
  website_clicks: number;
  views?: number | null;
  booking_clicks?: number | null;
  direction_requests?: number | null;
  notes?: string | null;
  status?: string | null;
};

export type GbpReport = {
  id: string;
  kind: string;
  title: string;
  month: string | null;
  file_path: string | null;
  notes: string | null;
  created_at: string;
  clients?: { hotel_name: string } | null;
};

export const GBP_REPORT_KINDS = [
  { value: "gmb_audit", label: "GMB Audit Report" },
  { value: "nap", label: "NAP Audit" },
  { value: "monthly", label: "Monthly Report" },
  { value: "growth_plan_12m", label: "12 Month Growth Plan Report" },
  { value: "progress", label: "Progress Report" },
  { value: "yearly_growth", label: "Yearly growth report" },
] as const;

export function reportKindLabel(kind: string): string {
  return GBP_REPORT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("en-IN");
}

/** Sum multiple hotels' rows into one row per month. Missing fields count as 0. */
export function aggregateGbp(rows: GbpEntry[]): GbpEntry[] {
  const map = new Map<string, GbpEntry>();
  for (const r of rows) {
    const cur =
      map.get(r.month) ??
      ({
        id: r.month,
        month: r.month,
        ...Object.fromEntries(GBP_METRICS.map((m) => [m.key, 0])),
      } as GbpEntry);
    for (const m of GBP_METRICS) cur[m.key] = Number(cur[m.key] ?? 0) + Number(r[m.key] ?? 0);
    map.set(r.month, cur);
  }
  return Array.from(map.values());
}

/** 12 months starting from the given month key (inclusive). */
export function next12Months(from: string): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}
