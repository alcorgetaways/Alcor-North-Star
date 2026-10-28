/**
 * Bookings CSV import — maps Amit's "SALES" sheet columns onto the bookings ledger.
 * Pure functions (no network) so the preview and the tests share one code path.
 */

export type BookingInput = {
  import_key: string;
  client_id: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  status: "BOOKED" | "CANCELLED";
  booked_on: string | null;
  guest_name: string | null;
  guest_city: string | null;
  category: string | null;
  source: string | null;
  package: string | null;
  room_category: string | null;
  adults: number | null;
  kids: number | null;
  infants: number | null;
  rooms: number | null;
  nights: number | null;
  check_in: string | null;
  check_out: string | null;
  deal_inr: number;
  advance_pct: number | null;
  advance_inr: number | null;
  advance_deposit_date: string | null;
  due_balance_inr: number | null;
  special_request: string | null;
  stay_month: string;
  /** Personal data — written to the restricted guest-contacts table only. */
  guest_phone: string | null;
  guest_email: string | null;
  meal_plan: MealPlan | null;
  package_note: string | null;
  /** Problems that don't stop the import (e.g. advance > deal). Stored on the booking. */
  import_flags: string[];
};

export type ImportRow = {
  row: number;
  booking?: BookingInput | undefined;
  property?: string | undefined;
  /** Sales person as shown in the preview ("Aman", "Hemant (former)", …). */
  salesPerson?: string | undefined;
  errors: string[];
  flags: string[];
};

export type MealPlan = "MAP" | "CP" | "EP" | "AP" | "APAI";

/** SALES-sheet ASM spellings for current staff → their North Star first name. */
export const STAFF_ALIASES: Record<string, string> = {
  manu: "Mohnish", mohnishmanu: "Mohnish", manumohnish: "Mohnish", mohnish: "Mohnish",
  aman: "Aman", rahul: "Rahul", monika: "Monika", monica: "Monika", param: "Param", tanuja: "Tanuja",
  ankit: "Ankit", neha: "Neha", shalini: "Shalini", amit: "Amit",
};
/** People who have left — kept as free-text sales person names, never matched to a login. */
export const FORMER_STAFF = ["Hemant", "Pooja K", "Imam", "Rajan", "Asha", "Sandeep", "Abhilash"];

/** SALES-sheet property spellings → North Star client name. */
export const PROPERTY_ALIASES: Record<string, string> = {
  upvanjawi: "Upvan Jawai",
  upvanjawai: "Upvan Jawai",
  seasonsjawai: "Season Jawai",
  seasonjawai: "Season Jawai",
  yadusjawai: "Yadus Jawai - By Alcor",
};
/** Names that are not one North Star client — always flagged as unmatched, never guessed. */
export const UNMATCHED_PROPERTIES = ["alcorresort"];

/**
 * Package text → meal plan + leftover note. Order matters: APAI before AP, MAP before AP/CP.
 * e.g. "MAP + Safari" → MAP, note "Safari"; "Breakfast only" → CP; "Room only" → EP.
 */
const MEAL_RULES: Array<[MealPlan, RegExp]> = [
  ["APAI", /\bAPAI\b|ALL\s*INCLUSIVE|A\.?P\.?A\.?I/i],
  ["MAP", /\bMAP\b|M\.A\.P|MODIFIED\s*AMERICAN|HALF\s*BOARD|\bHB\b|BREAKFAST\s*(\+|&|AND)\s*DINNER|B\s*\+\s*D|DINNER\s*(\+|&|AND)\s*BREAKFAST/i],
  ["AP", /\bAP\b|A\.P\.|AMERICAN\s*PLAN|FULL\s*BOARD|\bFB\b|ALL\s*MEALS|3\s*MEALS|BREAKFAST\s*(\+|,|&)\s*LUNCH\s*(\+|,|&|AND)\s*DINNER/i],
  ["CP", /\bCP\b|C\.P\.|CONTINENTAL|\bB&B\b|\bBB\b|BED\s*(AND|&)\s*BREAKFAST|WITH\s*BREAKFAST|BREAKFAST/i],
  ["EP", /\bEP\b|E\.P\.|EUROPEAN|ROOM\s*ONLY|WITHOUT\s*(MEALS|BREAKFAST)|NO\s*MEALS/i],
];
export function mapPackage(raw: string | null | undefined): { plan: MealPlan | null; note: string | null } {
  const s = (raw ?? "").trim();
  if (!s) return { plan: null, note: null };
  for (const [plan, re] of MEAL_RULES) {
    if (re.test(s)) {
      const note = s.replace(re, " ").replace(/^[\s+&,/()-]+|[\s+&,/()-]+$/g, "").replace(/\s+/g, " ").trim();
      return { plan, note: note || null };
    }
  }
  return { plan: null, note: s };
}

/**
 * "9-MarMon", "9 Mar", "09-Mar-Mon" (no year) → ISO date, with the year inferred from C/I:
 * a booking is made on or before check-in, so a later month/day than C/I means the year before.
 */
export function parseBookedOnShort(raw: string | undefined, checkIn: string | null): string | null | "invalid" | "no-year" {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d{1,2})[\s/.-]*([A-Za-z]{3,9}?)(?:[\s/.-]*(mon|tue|wed|thu|fri|sat|sun)[a-z]*)?$/i);
  if (!m) return null;
  const mo = MONTHS[m[2]!.toLowerCase().slice(0, 3)];
  if (!mo) return "invalid";
  if (!checkIn) return "no-year";
  const cy = +checkIn.slice(0, 4), cm = +checkIn.slice(5, 7), cd = +checkIn.slice(8, 10);
  const d = +m[1]!;
  const y = mo > cm || (mo === cm && d > cd) ? cy - 1 : cy;
  return iso(y, mo, d);
}

/** Sheet column → field. Keys are normalised headers (upper case, letters/digits/%/ only). */
export const COLUMN_MAP: Record<string, keyof BookingInput | "property" | "sales_person" | "month"> = {
  ASM: "sales_person",
  SALESPERSON: "sales_person",
  PROPERTY: "property",
  STATUS: "status",
  BOOKEDON: "booked_on",
  NAME: "guest_name",
  GUESTNAME: "guest_name",
  NUMBER: "guest_phone",
  PHONE: "guest_phone",
  EMAIL: "guest_email",
  CITY: "guest_city",
  CATEGORY: "category",
  SOURCE: "source",
  PACKAGE: "package",
  ROOMCATEGORY: "room_category",
  ADULTS: "adults",
  KIDS: "kids",
  INFANTS: "infants",
  ROOMS: "rooms",
  NIGHTS: "nights",
  "C/I": "check_in",
  CHECKIN: "check_in",
  "C/O": "check_out",
  CHECKOUT: "check_out",
  DEAL: "deal_inr",
  "DEAL%": "deal_inr",
  "ADVANCE%": "advance_pct",
  ADVANCE: "advance_inr",
  ADVANCEDEPOSITDATE: "advance_deposit_date",
  DUEBALANCE: "due_balance_inr",
  SPECIALREQUEST: "special_request",
  MONTH: "month",
};

export function normHeader(h: string): string {
  return h.toUpperCase().replace(/\(.*?\)/g, "").replace(/[^A-Z0-9%/]/g, "");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** Returns ISO date, null for blank, or "invalid". Day-first (Indian) for numeric dates. */
export function parseDate(raw: string | undefined): string | null | "invalid" {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return iso(fullYear(+m[3]!), +m[2]!, +m[1]!);
  m = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,9})[\s,/-]+(\d{2,4})$/);
  if (m) {
    const mo = MONTHS[m[2]!.toLowerCase().slice(0, m[2]!.toLowerCase().startsWith("sept") ? 4 : 3)];
    return mo ? iso(fullYear(+m[3]!), mo, +m[1]!) : "invalid";
  }
  return "invalid";
}

/** "Oct", "October 2026", "Oct-26", "10/2026" → first of month, using fallbackYear when the year is missing. */
export function parseStayMonth(raw: string | undefined, fallbackYear: number | null): string | null | "invalid" {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^([A-Za-z]{3,9})[\s'/-]*(\d{2,4})?$/);
  if (m) {
    const mo = MONTHS[m[1]!.toLowerCase().slice(0, 3)];
    const y = m[2] ? fullYear(+m[2]) : fallbackYear;
    if (!mo || !y) return "invalid";
    return iso(y, mo, 1);
  }
  m = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return iso(+m[2]!, +m[1]!, 1);
  const d = parseDate(s);
  if (d && d !== "invalid") return `${d.slice(0, 7)}-01`;
  return "invalid";
}

/** "₹1,25,000", "Rs. 4500", "12%" → number; blank → null; garbage → NaN. */
export function parseNumber(raw: string | undefined): number | null {
  const s = (raw ?? "").replace(/₹|rs\.?|inr|%|,|\s/gi, "");
  if (!s || s === "-") return null;
  return Number(s);
}

/** FNV-1a 64-bit — stable key so a rerun updates the same booking instead of adding a duplicate. */
export function stableKey(parts: Array<string | number | null>): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const ch of parts.map((p) => (p ?? "").toString().trim().toLowerCase()).join("|")) {
    h ^= BigInt(ch.codePointAt(0)!);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return `csv:${h.toString(16).padStart(16, "0")}`;
}

type Ref = { id: string; name: string };

function matchByName(list: Ref[], raw: string): Ref | null | "ambiguous" {
  const n = norm(raw);
  if (!n) return null;
  const exact = list.filter((x) => norm(x.name) === n);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return "ambiguous";
  const partial = list.filter((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)));
  if (partial.length === 1) return partial[0]!;
  return partial.length > 1 ? "ambiguous" : null;
}

function matchStaff(list: Ref[], raw: string): Ref | null {
  const n0 = norm(raw);
  if (!n0) return null;
  if (FORMER_STAFF.some((f) => norm(f) === n0)) return null;
  const n = norm(STAFF_ALIASES[n0] ?? raw);
  const exact = list.filter((x) => norm(x.name) === n);
  if (exact.length === 1) return exact[0]!;
  const first = list.filter((x) => norm(x.name.split(" ")[0] ?? "") === n);
  return first.length === 1 ? first[0]! : null;
}

export function mapBookingRows(
  table: string[][],
  ctx: { properties: Ref[]; staff: Ref[] },
): { rows: ImportRow[]; unknownColumns: string[]; missingColumns: string[] } {
  const [head = [], ...body] = table;
  const fields = head.map((h) => COLUMN_MAP[normHeader(h)]);
  const unknownColumns = head.filter((_, i) => !fields[i]).map((h) => h.trim()).filter(Boolean);
  const missingColumns = ["property", "status", "deal_inr"].filter((f) => !fields.includes(f as never));

  const rows = body.map((cells, idx): ImportRow => {
    const get = (f: string) => {
      const i = fields.indexOf(f as never);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const errors: string[] = [];
    const text = (f: string) => get(f) || null;
    const int = (f: string) => {
      const v = parseNumber(get(f));
      if (v != null && (!Number.isFinite(v) || v < 0)) { errors.push(`${f.replace(/_/g, " ")} is not a number`); return null; }
      return v == null ? null : Math.round(v);
    };
    const num = (f: string, label: string) => {
      const v = parseNumber(get(f));
      if (v != null && !Number.isFinite(v)) { errors.push(`${label} is not a number`); return null; }
      return v;
    };
    const date = (f: string, label: string) => {
      const v = parseDate(get(f));
      if (v === "invalid") { errors.push(`${label} "${get(f)}" is not a date`); return null; }
      return v;
    };

    const flags: string[] = [];
    const propertyRaw = get("property");
    const pn = norm(propertyRaw);
    const unmatched = UNMATCHED_PROPERTIES.includes(pn);
    const prop = unmatched ? null : matchByName(ctx.properties, PROPERTY_ALIASES[pn] ?? propertyRaw);
    if (!propertyRaw) errors.push("Property is empty");
    else if (unmatched) errors.push(`Property "${propertyRaw}" is flagged as unmatched — it is not one North Star client`);
    else if (prop === "ambiguous") errors.push(`Property "${propertyRaw}" matches more than one hotel`);
    else if (!prop) errors.push(`Property "${propertyRaw}" is not a North Star client`);

    const st = get("status").toUpperCase();
    const status = st.startsWith("CANCEL") ? "CANCELLED" : st === "BOOKED" || st === "CONFIRMED" ? "BOOKED" : null;
    if (!status) errors.push(`Status "${get("status")}" must be BOOKED or CANCELLED`);

    const dealRaw = num("deal_inr", "Deal");
    if (dealRaw == null) flags.push("Deal missing");
    else if (dealRaw < 0) errors.push("Deal (₹) is negative");
    const deal = dealRaw ?? 0;

    const check_in = date("check_in", "C/I");
    let booked_on: string | null;
    const short = parseBookedOnShort(get("booked_on"), check_in);
    if (short === null) booked_on = date("booked_on", "Booked On");
    else if (short === "no-year") { booked_on = null; flags.push(`Booked On "${get("booked_on")}" has no year and no C/I`); }
    else if (short === "invalid") { booked_on = null; errors.push(`Booked On "${get("booked_on")}" is not a date`); }
    else booked_on = short;
    const check_out = date("check_out", "C/O");
    if (check_in && check_out && check_out < check_in) errors.push("C/O is before C/I");

    const yearHint = check_in ? +check_in.slice(0, 4) : booked_on ? +booked_on.slice(0, 4) : null;
    let stay = parseStayMonth(get("month"), yearHint);
    if (stay === "invalid") { errors.push(`MONTH "${get("month")}" is not a month`); stay = null; }
    const stay_month = stay ?? (check_in ? `${check_in.slice(0, 7)}-01` : null);
    if (!stay_month) errors.push("Stay month missing (no MONTH or C/I)");

    const spRaw = get("sales_person");
    const sp = matchStaff(ctx.staff, spRaw);
    const former = FORMER_STAFF.find((f) => norm(f) === norm(spRaw));
    const phone = text("guest_phone");
    const guest = text("guest_name");
    const advance = num("advance_inr", "Advance");
    if (advance != null && dealRaw != null && advance > dealRaw) flags.push("Advance is more than the deal");
    const pkg = mapPackage(text("package"));
    if (text("package") && !pkg.plan) flags.push(`Package "${text("package")}" not mapped to a meal plan`);

    const booking: BookingInput | undefined =
      errors.length || !prop || prop === "ambiguous" || !status || !stay_month
        ? undefined
        : {
            import_key: stableKey([prop.id, guest, (phone ?? "").replace(/\D/g, ""), booked_on, check_in, deal]),
            client_id: prop.id,
            sales_person_id: sp?.id ?? null,
            sales_person_name: sp ? sp.name : spRaw || null,
            status,
            booked_on,
            guest_name: guest,
            guest_city: text("guest_city"),
            category: text("category"),
            source: text("source"),
            package: text("package"),
            room_category: text("room_category"),
            adults: int("adults"),
            kids: int("kids"),
            infants: int("infants"),
            rooms: int("rooms"),
            nights: int("nights"),
            check_in,
            check_out,
            deal_inr: deal,
            advance_pct: num("advance_pct", "Advance %"),
            advance_inr: advance,
            advance_deposit_date: date("advance_deposit_date", "Advance deposit date"),
            due_balance_inr: num("due_balance_inr", "Due balance"),
            special_request: text("special_request"),
            stay_month,
            guest_phone: phone,
            guest_email: text("guest_email"),
            meal_plan: pkg.plan,
            package_note: pkg.plan ? pkg.note : null,
            import_flags: flags,
          };
    // number parsing inside the object literal may add errors late
    return {
      row: idx + 2,
      booking: errors.length ? undefined : booking,
      property: prop && prop !== "ambiguous" ? prop.name : propertyRaw,
      salesPerson: sp ? sp.name : former ? `${former} (former)` : spRaw || "Unassigned",
      errors,
      flags,
    };
  });
  return { rows, unknownColumns, missingColumns };
}

/** Financial year (Apr–Mar) that a date falls in, named by its starting year. */
export function fyOf(isoDate: string): number {
  const y = +isoDate.slice(0, 4);
  const m = +isoDate.slice(5, 7);
  return m >= 4 ? y : y - 1;
}

/** The twelve stay months of FY `fy` (Apr fy … Mar fy+1) as ISO first-of-month dates. */
export function fyMonths(fy: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? fy : fy + 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  });
}

/** Commission bucket for one booking, as the database's commission_due() computes it. */
export function commissionBucket(category: string | null, source: string | null): "weddings" | "ota" | "direct" {
  if (/(wedding|event)/i.test(category ?? "")) return "weddings";
  if (/ota/i.test(source ?? "")) return "ota";
  return "direct";
}

/** Preview totals per sales person and per property (ready rows only). */
export function summarizeImport(rows: ImportRow[]) {
  const by = (key: (r: ImportRow) => string) => {
    const m = new Map<string, { name: string; rows: number; booked: number; cancelled: number; deal: number }>();
    for (const r of rows) {
      if (!r.booking) continue;
      const k = key(r);
      const cur = m.get(k) ?? { name: k, rows: 0, booked: 0, cancelled: 0, deal: 0 };
      cur.rows++;
      if (r.booking.status === "BOOKED") { cur.booked++; cur.deal += r.booking.deal_inr; } else cur.cancelled++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.rows - a.rows);
  };
  return {
    staff: by((r) => r.salesPerson ?? "Unassigned"),
    properties: by((r) => r.property ?? "—"),
    flagged: rows.filter((r) => r.booking && r.flags.length).length,
  };
}
