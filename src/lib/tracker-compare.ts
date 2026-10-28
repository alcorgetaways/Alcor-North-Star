import { parseCsv } from "./bookings-import";

/** One North Star client as seen by the comparison (current / latest launch terms). */
export type NsClient = {
  name: string;
  status: string | null;
  plan_code: string | null;
  retainer: number | null;
  contact: string | null;
  phone: string | null;
  state: string | null;
  destination: string | null;
};

export type TrackerDiff = { client: string; field: string; tracker: string; north_star: string };
export type TrackerCompare = {
  rows_read: number;
  matched: number;
  differences: TrackerDiff[];
  not_in_north_star: string[];
  not_in_tracker: string[];
};

const PLAN_MAP: Record<string, string> = { gmb: "gmb_seo", small: "diamond_start", growing: "diamond_grow", pro: "diamond_scale" };
const STATUS_MAP: Record<string, string> = { active: "active", churned: "closed", "on hold": "on_hold", onhold: "on_hold" };
const ALIASES: Record<string, string> = {
  "countryside villa by alcor": "countryside villa dhanaulti",
  "excel hotels resorts": "excel main brand",
  "excel hotels banyan jim corbett": "the banyan retreat",
  "excel hotels bhimtal": "excel bhimtal",
};

export const normName = (s: string) => {
  const n = s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return ALIASES[n] ?? n;
};
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
const clean = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function col(head: string[], ...tests: RegExp[]) {
  for (const t of tests) {
    const i = head.findIndex((h) => t.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** Read-only dry-run: lists every difference between the BD tracker "Clients" tab (CSV) and North Star. Changes nothing. */
export function compareTrackerRows(csv: string, clients: NsClient[]): TrackerCompare {
  const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const iName = col(head, /hotel|property|brand/, /client/, /name/);
  const iStatus = col(head, /status/);
  const iPlan = col(head, /plan|package/);
  const iRet = col(head, /retainer|fee/);
  const iContact = col(head, /contact person|contact name|poc|owner/);
  const iPhone = col(head, /phone|mobile|number|contact no/);
  const iState = col(head, /state/);
  const iDest = col(head, /destination|location|city/);
  const byName = new Map(clients.map((c) => [normName(c.name), c]));
  const seen = new Set<string>();
  const out: TrackerCompare = { rows_read: 0, matched: 0, differences: [], not_in_north_star: [], not_in_tracker: [] };
  for (const r of rows.slice(1)) {
    const name = (r[iName] ?? "").trim();
    if (!name) continue;
    out.rows_read++;
    const key = normName(name);
    const c = byName.get(key);
    if (!c) {
      out.not_in_north_star.push(name);
      continue;
    }
    if (seen.has(key)) continue; // several tracker rows (renewals) for one hotel: compare the first only
    seen.add(key);
    out.matched++;
    const add = (field: string, tracker: string, ns: string | number | null | undefined) =>
      out.differences.push({ client: c.name, field, tracker: tracker || "(blank)", north_star: ns == null || ns === "" ? "(blank)" : String(ns) });
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : null);
    const st = cell(iStatus);
    if (st !== null && st !== "") {
      const want = STATUS_MAP[clean(st)] ?? clean(st);
      const have = c.status === "live" ? "active" : c.status;
      if (want !== have) add("status", st, c.status);
    }
    const pl = cell(iPlan);
    if (pl !== null && pl !== "" && (PLAN_MAP[clean(pl)] ?? clean(pl)) !== c.plan_code) add("plan", pl, c.plan_code);
    const ret = cell(iRet);
    if (ret !== null && ret !== "") {
      const n = Number(ret.replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n) && n !== Number(c.retainer ?? -1)) add("retainer", ret, c.retainer);
    }
    const ct = cell(iContact);
    if (ct !== null && clean(ct) !== clean(c.contact)) add("contact", ct, c.contact);
    const ph = cell(iPhone);
    if (ph !== null && digits(ph) !== digits(c.phone)) add("phone", ph, c.phone);
    const sta = cell(iState);
    if (sta !== null && clean(sta) !== clean(c.state)) add("state", sta, c.state);
    const de = cell(iDest);
    if (de !== null && clean(de) !== clean(c.destination)) add("destination", de, c.destination);
  }
  out.not_in_tracker = clients.filter((c) => !seen.has(normName(c.name))).map((c) => c.name);
  return out;
}
