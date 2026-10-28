/**
 * Source sync month rules (India time). Pure so they can be unit tested.
 * - The running IST month is never stored.
 * - The last complete month is re-fetched on the 2nd and 5th (Google reports late),
 *   and any row flagged partial is re-fetched — only while still unreviewed ('fetched').
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istParts(now: Date) {
  const d = new Date(now.getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), date: d.toISOString().slice(0, 10) };
}

function key(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** First day of the running IST month, e.g. "2026-10-01". */
export function runningMonthIST(now: Date) {
  const p = istParts(now);
  return key(p.year, p.month);
}

/** First day of the last complete IST month. */
export function lastCompleteMonthIST(now: Date) {
  const p = istParts(now);
  return key(p.year, p.month - 1);
}

export function isStorableMonth(month: string, now: Date) {
  return month < runningMonthIST(now);
}

export const REFETCH_DAYS = [2, 5] as const;

export type StoredRow = { status: string; is_partial: boolean; raw_data?: { refetch_checkpoint?: string } | null };

/** Should an existing stored row be re-fetched now? */
export function shouldRefetch(month: string, row: StoredRow, now: Date) {
  if (row.status !== "fetched") return false; // never touch reviewed or approved rows
  if (!isStorableMonth(month, now)) return false;
  if (row.is_partial) return true;
  const p = istParts(now);
  if (month !== lastCompleteMonthIST(now)) return false;
  if (!(REFETCH_DAYS as readonly number[]).includes(p.day)) return false;
  return row.raw_data?.refetch_checkpoint !== `${month}:${p.day}`;
}

/** raw_data for a re-fetch: new raw plus the previous values and when they were fetched. */
export function refetchRawData(
  old: { fetched_values: unknown; fetched_at: string; raw_data: Record<string, unknown> | null },
  newRaw: Record<string, unknown>,
  month: string,
  now: Date,
) {
  return {
    ...newRaw,
    period: (old.raw_data?.["period"] as string | undefined) ?? newRaw["period"],
    refetch_checkpoint: `${month}:${istParts(now).day}`,
    previous_fetch: { values: old.fetched_values, fetched_at: old.fetched_at, earlier: old.raw_data?.["previous_fetch"] ?? null },
  };
}

/**
 * Months a history fetch will attempt for one mapping, oldest first.
 * Shared by the server runner and the /data-sync progress pill so the
 * "n/N months" total can never disagree with what the runner does.
 * Localo history is capped at 18 months; the running month is never included;
 * one run attempts at most `cap` months (the worker bound).
 */
export function historyPlan(opts: {
  startDate: string | null | undefined;
  source: string;
  now: Date;
  existing?: Map<string, StoredRow> | undefined;
  cap?: number | undefined;
}): string[] {
  const cap = opts.cap ?? 12;
  const last = lastCompleteMonthIST(opts.now);
  let first = opts.startDate ? `${opts.startDate.slice(0, 7)}-01` : last;
  if (opts.source === "localo") {
    const cutoff = new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7) - 1 - 17, 1)).toISOString().slice(0, 10);
    if (first < cutoff) first = cutoff;
  }
  const out: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); d.toISOString().slice(0, 10) <= last && out.length < cap; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const key = d.toISOString().slice(0, 10);
    const existing = opts.existing?.get(key);
    if (existing && !shouldRefetch(key, existing, opts.now)) continue;
    out.push(key);
  }
  return out;
}

/** Exponential backoff with jitter for rate-limited source calls (ms). */
export function backoffDelay(attempt: number, random = Math.random) {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return Math.round(base / 2 + random() * (base / 2));
}
