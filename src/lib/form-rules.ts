/**
 * Shared form and flow rules (QA flows & forms batch, 26 Oct 2026).
 * Pure functions so every screen applies the same rule and unit tests cover it.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/* ---------- QA-01: owner question pipeline options ---------- */
export type QuestionPipelineOption = { id: string; name: string; clientPipelineId?: string };
type OwnerPipelineRow = {
  id: string;
  pipeline_id: string;
  pipelines: { code: string; name: string } | null;
};
/** Options carry the real pipelines.id uuid (never the code) plus the client_pipeline id. */
export function questionPipelineOptions(
  rows: OwnerPipelineRow[],
  titles: Record<string, string> = {},
  onlyCodes?: Set<string>,
): QuestionPipelineOption[] {
  const seen = new Set<string>();
  const out: QuestionPipelineOption[] = [];
  for (const r of rows) {
    if (!isUuid(r.pipeline_id) || seen.has(r.pipeline_id)) continue;
    const code = r.pipelines?.code ?? "";
    if (onlyCodes && onlyCodes.size && !onlyCodes.has(code)) continue;
    seen.add(r.pipeline_id);
    out.push({ id: r.pipeline_id, name: titles[code] ?? r.pipelines?.name ?? code, clientPipelineId: r.id });
  }
  return out;
}

/* ---------- QA-02: KPI number parsing ---------- */
export type ParsedMetric = { value: number | null; error: string | null };
/** blank → null (not tracked), non-number or negative → error. Never turns blank into 0. */
export function parseMetric(v: unknown, opts: { allowNegative?: boolean } = {}): ParsedMetric {
  if (v === null || v === undefined) return { value: null, error: null };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { value: null, error: "Enter a number" };
    if (!opts.allowNegative && v < 0) return { value: null, error: "Can't be negative" };
    return { value: v, error: null };
  }
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return { value: null, error: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: "Enter a number" };
  if (!opts.allowNegative && n < 0) return { value: null, error: "Can't be negative" };
  return { value: n, error: null };
}
/** Parse a set of fields; returns values plus a per-field error map (empty when valid). */
export function parseMetrics<K extends string>(form: Partial<Record<K, unknown>>, keys: readonly K[]) {
  const values = {} as Record<K, number | null>;
  const errors: Partial<Record<K, string>> = {};
  for (const k of keys) {
    const p = parseMetric(form[k]);
    values[k] = p.value;
    if (p.error) errors[k] = p.error;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}
/** For columns stored as NOT NULL: blank is an error ("type 0 if none"), never a silent 0. */
export function parseRequiredMetrics<K extends string>(form: Partial<Record<K, unknown>>, keys: readonly K[]) {
  const r = parseMetrics(form, keys);
  for (const k of keys) if (r.values[k] === null && !r.errors[k]) r.errors[k] = "Enter a number (0 if none)";
  return { values: r.values as Record<K, number>, errors: r.errors, ok: Object.keys(r.errors).length === 0 };
}
export function firstMetricError(errors: Record<string, string | undefined>, labels: Record<string, string> = {}) {
  const k = Object.keys(errors).find((x) => errors[x]);
  return k ? `${labels[k] ?? k}: ${errors[k]}` : null;
}

/* ---------- QA-03: report re-seed guard ---------- */
/** Server data may replace local edits only when nothing is unsaved. */
export const shouldReseed = (dirty: boolean) => !dirty;

/* ---------- QA-04 / React Query: no retry on 4xx ---------- */
export function isClientError(e: unknown): boolean {
  const x = e as { status?: number; code?: string } | null;
  if (!x) return false;
  if (typeof x.status === "number") return x.status >= 400 && x.status < 500;
  // PostgREST codes: PGRST116 (0 rows), 22P02 (bad uuid), 42501 (permission)
  return x.code === "PGRST116" || x.code === "22P02" || x.code === "42501";
}
export const retryUnless4xx = (count: number, e: unknown) => !isClientError(e) && count < 2;

/* ---------- QA-13: data-sync month ---------- */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
/** Latest complete month (IST), as YYYY-MM. */
export function latestCompleteMonth(now: Date = new Date()): string {
  const [y, m] = istToday(now).split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}
export const isFutureOrRunningMonth = (ym: string, now: Date = new Date()) => ym > latestCompleteMonth(now);

/* ---------- QA-15: manual bookings ---------- */
export function manualBookingKey(rand: () => string = () => crypto.randomUUID()) {
  return `manual:${rand()}`;
}
export function bookingError(b: { checkIn?: string | null; checkOut?: string | null; deal?: number | null; advance?: number | null }) {
  if (b.checkIn && b.checkOut && b.checkOut < b.checkIn) return "Check-out can't be before check-in";
  if (b.deal != null && b.deal < 0) return "Deal value can't be negative";
  if (b.advance != null && b.advance < 0) return "Advance can't be negative";
  if (b.advance != null && b.deal != null && b.advance > b.deal) return "Advance can't be more than the deal value";
  return null;
}

/* ---------- QA-16: res desk daily log ---------- */
export const DAILY_LOG_FIELDS = [
  "user_id", "log_date", "dials", "connects", "leads_new", "quotes_sent", "bookings_count",
  "booked_value", "follow_ups", "notes",
] as const;
export function pickFields<T extends Record<string, unknown>>(row: T, fields: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
}
export function dailyLogError(l: { dials?: number | null; connects?: number | null }) {
  if ((l.dials ?? 0) < 0 || (l.connects ?? 0) < 0) return "Numbers can't be negative";
  if (l.connects != null && l.dials != null && l.connects > l.dials) return "Connects can't be more than dials";
  return null;
}

/* ---------- QA-17: targets ---------- */
/** Only rows the user edited are saved; 0 needs an explicit confirmation; negatives rejected. */
export function targetRowsToSave(
  rows: Array<{ id: string; value: string; touched: boolean; zeroConfirmed?: boolean }>,
) {
  const save: Array<{ id: string; value: number }> = [];
  const errors: Record<string, string> = {};
  for (const r of rows) {
    if (!r.touched) continue;
    const p = parseMetric(r.value);
    if (p.error) { errors[r.id] = p.error; continue; }
    if (p.value === null) { errors[r.id] = "Enter a target"; continue; }
    if (p.value === 0 && !r.zeroConfirmed) { errors[r.id] = "Confirm a target of 0"; continue; }
    save.push({ id: r.id, value: p.value });
  }
  return { save, errors };
}

/* ---------- QA-09: quick status change ---------- */
/** Same rule as TaskSheet: moving a task to waiting_client needs an evidence link or file. */
export function quickStatusError(t: { status: string; evidence_url?: string | null }, next: string) {
  if (next === "waiting_client" && t.status !== "waiting_client" && !(t.evidence_url ?? "").trim())
    return "Add the evidence link first — the hotel owner must see the work before approving.";
  return null;
}

/* ---------- Remaining P3 form rules ---------- */
export const MAX_OWNER_UPLOAD_BYTES = 10 * 1024 * 1024;
export function ownerUploadError(file: { size: number; type: string }) {
  if (file.size > MAX_OWNER_UPLOAD_BYTES) return "Maximum file size is 10 MB";
  if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return "Choose a PDF, PNG or JPEG";
  return null;
}
export function evidenceUrlError(value: string) {
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "Enter a valid http or https evidence link";
    return null;
  } catch { return "Enter a valid http or https evidence link"; }
}
export function taskBlockerFields(status: string, reason: string, impact: string) {
  const blocked = status === "blocked" || status === "waiting_client";
  return { blocker_reason: blocked ? status === "waiting_client" ? "Waiting on client approval" : reason.trim() || null : null, blocker_impact: blocked ? impact.trim() || null : null };
}
export function taskDateError(canEditPlan: boolean, date: string) {
  return canEditPlan && !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Choose a due date before saving" : null;
}
export function allOtasRow<T extends { month: string; ota_name?: string | null }>(rows: T[], month: string) {
  return rows.find((row) => row.month === month && row.ota_name === "All OTAs");
}
