import { northStarScore } from "@/lib/kpi";

/** End of a calendar day in India time (23:59:59.999 IST) as epoch ms. */
export function istEndOfDayMs(date: string): number {
  return new Date(`${date}T23:59:59.999+05:30`).getTime();
}

/** Submitted after the due date's IST end of day. */
export function isLate(submittedAt: string, dueDate: string) {
  return new Date(submittedAt).getTime() > istEndOfDayMs(dueDate);
}

/** Not submitted and the due date's IST day is over. */
export function isOverdue(dueDate: string, now: number = Date.now()) {
  return now > istEndOfDayMs(dueDate);
}

export type PipelineScoreRow = {
  month: string;
  client_id: string;
  hotel_name: string;
  client_pipeline_id: string;
  weight: number;
  score: number | null;
};

/** Portfolio North Star for a month: weighted mean over approved pipeline scores. */
export function portfolioScore(rows: PipelineScoreRow[], month: string) {
  return northStarScore(rows.filter((r) => r.month === month).map((r) => ({ achievement: r.score == null ? null : Number(r.score), weight: Number(r.weight) })));
}

/** Per-hotel weighted mean (true mean, not pairwise), lowest first. */
export function hotelScores(rows: PipelineScoreRow[], month: string) {
  const by = new Map<string, { hotel: string; rows: Array<{ achievement: number | null; weight: number }> }>();
  for (const r of rows) {
    if (r.month !== month) continue;
    const cur = by.get(r.client_id) ?? { hotel: r.hotel_name, rows: [] };
    cur.rows.push({ achievement: r.score == null ? null : Number(r.score), weight: Number(r.weight) });
    by.set(r.client_id, cur);
  }
  return [...by.entries()]
    .map(([id, v]) => ({ id, hotel: v.hotel, score: northStarScore(v.rows) }))
    .filter((h): h is { id: string; hotel: string; score: number } => h.score != null)
    .sort((a, b) => a.score - b.score);
}
