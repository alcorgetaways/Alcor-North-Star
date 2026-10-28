import { describe, expect, it } from "vitest";
import { commissionBucket, fyMonths, fyOf, mapBookingRows, parseCsv, parseDate, parseStayMonth, summarizeImport } from "./bookings-import";

const ctx = {
  properties: [{ id: "p1", name: "Season Jawai" }, { id: "p2", name: "Melody Moon Resort" }],
  staff: [{ id: "u1", name: "Neha Sharma" }],
};
const HEAD =
  "ASM,Property,STATUS,Booked On,NAME,NUMBER,EMAIL,CITY,CATEGORY,SOURCE,PACKAGE,ROOM CATEGORY,ADULTS,KIDS,INFANTS,ROOMS,NIGHTS,C/I,C/O,Deal (₹),ADVANCE %,ADVANCE,ADVANCE DEPOSIT DATE,DUE BALANCE,SPECIAL REQUEST,MONTH";

describe("bookings CSV import", () => {
  it("maps the SALES sheet columns", () => {
    const csv = `${HEAD}\nNeha,Season Jawai,BOOKED,01/10/2026,Ravi,98765 43210,r@x.in,Delhi,FAMILIES,WEB FORM,MAP,Deluxe,2,1,0,1,2,12/10/2026,14/10/2026,"₹45,000",50%,"22,500",02/10/2026,"22,500",,Oct`;
    const { rows, unknownColumns, missingColumns } = mapBookingRows(parseCsv(csv), ctx);
    expect(unknownColumns).toEqual([]);
    expect(missingColumns).toEqual([]);
    const b = rows[0]!.booking!;
    expect(rows[0]!.errors).toEqual([]);
    expect(b.client_id).toBe("p1");
    expect(b.sales_person_id).toBe("u1");
    expect(b.deal_inr).toBe(45000);
    expect(b.check_in).toBe("2026-10-12");
    expect(b.stay_month).toBe("2026-10-01");
    expect(b.guest_phone).toBe("98765 43210");
  });

  it("keeps people who have left as free text", () => {
    const csv = `${HEAD}\nRahul Old,Melody Moon,CANCELLED,,G,,,,,OTA,,,,,,,,05/11/2026,06/11/2026,1000,,,,,,`;
    const r = mapBookingRows(parseCsv(csv), ctx).rows[0]!;
    expect(r.booking!.sales_person_id).toBeNull();
    expect(r.booking!.sales_person_name).toBe("Rahul Old");
    expect(r.booking!.status).toBe("CANCELLED");
    expect(r.booking!.stay_month).toBe("2026-11-01");
  });

  it("reports row-by-row errors", () => {
    const csv = `${HEAD}\nNeha,Unknown Hotel,MAYBE,32/13/2026,G,,,,,,,,,,,,,,,abc,,,,,,`;
    const r = mapBookingRows(parseCsv(csv), ctx).rows[0]!;
    expect(r.row).toBe(2);
    expect(r.booking).toBeUndefined();
    expect(r.errors.join(" ")).toMatch(/not a North Star client/);
    expect(r.errors.join(" ")).toMatch(/BOOKED or CANCELLED/);
    expect(r.errors.join(" ")).toMatch(/Booked On/);
  });

  it("rerunning the same file gives the same keys (no duplicates)", () => {
    const csv = `${HEAD}\nNeha,Season Jawai,BOOKED,01/10/2026,Ravi,9876543210,,,,,,,,,,,,12/10/2026,,45000,,,,,,`;
    const a = mapBookingRows(parseCsv(csv), ctx).rows[0]!.booking!.import_key;
    const b = mapBookingRows(parseCsv(csv), ctx).rows[0]!.booking!.import_key;
    expect(a).toBe(b);
  });

  it("parses Indian day-first and month-name dates", () => {
    expect(parseDate("05/04/2026")).toBe("2026-04-05");
    expect(parseDate("5-Apr-26")).toBe("2026-04-05");
    expect(parseDate("2026-04-05")).toBe("2026-04-05");
    expect(parseDate("31/02/2026")).toBe("invalid");
    expect(parseStayMonth("Oct-26", null)).toBe("2026-10-01");
    expect(parseStayMonth("March", 2027)).toBe("2027-03-01");
  });

  it("financial year runs April to March", () => {
    expect(fyOf("2026-04-01")).toBe(2026);
    expect(fyOf("2027-03-31")).toBe(2026);
    expect(fyMonths(2026)[0]).toBe("2026-04-01");
    expect(fyMonths(2026)[11]).toBe("2027-03-01");
  });

  it("commission buckets: weddings/events, then OTA, else direct", () => {
    expect(commissionBucket("WEDDING", "OTA")).toBe("weddings");
    expect(commissionBucket("FAMILIES", "OTA")).toBe("ota");
    expect(commissionBucket("CORPORATE", "WEB FORM")).toBe("direct");
  });
});

describe("SALES-tab import readiness (Reservation Desk)", () => {
  const ctx2 = {
    properties: [
      { id: "upv", name: "Upvan Jawai" },
      { id: "sea", name: "Season Jawai" },
      { id: "yad", name: "Yadus Jawai - By Alcor" },
      { id: "cty", name: "Countryard Resort By Alcor" },
    ],
    staff: [
      { id: "aman", name: "Aman" }, { id: "moh", name: "Mohnish" }, { id: "sha", name: "Shalini Sharma" },
      { id: "neha", name: "Neha" }, { id: "rahul", name: "Rahul" },
    ],
  };
  const csv = [
    HEAD,
    `AMAN,UPVAN JAWI,BOOKED,9-MarMon,G1,,,,,,MAP + Safari,,2,,,1,2,12/03/2026,14/03/2026,20000,,5000,,,,`,
    `Manu,SEASONS JAWAI,BOOKED,28-DecSun,G2,,,,,,Room Only,,2,,,1,1,05/01/2026,06/01/2026,10000,,,,,,`,
    `Hemant,Yadu's Jawai,CANCELLED,1-Feb,G3,,,,,,APAI,,2,,,1,1,10/02/2026,11/02/2026,15000,,,,,,`,
    `Pooja K,YADUS JAWAI,BOOKED,2-Feb,G4,,,,,,Breakfast,,2,,,1,1,10/02/2026,11/02/2026,,,1000,,,,`,
    `Shalini,ALCOR RESORT,BOOKED,2-Feb,G5,,,,,,CP,,2,,,1,1,10/02/2026,11/02/2026,5000,,,,,,`,
    `Mohnish/Manu,Upvan Jawai,BOOKED,3-Apr,G6,,,,,,Jungle Special,,2,,,1,1,10/04/2026,11/04/2026,8000,,9000,,,,`,
  ].join("\n");
  const { rows } = mapBookingRows(parseCsv(csv), ctx2);

  it("maps ASM names to staff and keeps former staff as free text", () => {
    expect(rows[0]!.booking!.sales_person_id).toBe("aman");
    expect(rows[1]!.booking!.sales_person_id).toBe("moh");
    expect(rows[5]!.booking!.sales_person_id).toBe("moh");
    expect(rows[2]!.booking!.sales_person_id).toBeNull();
    expect(rows[2]!.booking!.sales_person_name).toBe("Hemant");
    expect(rows[2]!.salesPerson).toBe("Hemant (former)");
    expect(rows[3]!.booking!.sales_person_id).toBeNull();
  });

  it("normalises property spellings and flags ALCOR RESORT as unmatched", () => {
    expect(rows[0]!.booking!.client_id).toBe("upv");
    expect(rows[1]!.booking!.client_id).toBe("sea");
    expect(rows[2]!.booking!.client_id).toBe("yad");
    expect(rows[3]!.booking!.client_id).toBe("yad");
    expect(rows[4]!.booking).toBeUndefined();
    expect(rows[4]!.errors[0]).toMatch(/unmatched/);
  });

  it("parses Booked On like 9-MarMon with the year taken from C/I", () => {
    expect(rows[0]!.booking!.booked_on).toBe("2026-03-09");
    expect(rows[1]!.booking!.booked_on).toBe("2025-12-28"); // December booking for a January stay
    expect(rows[2]!.booking!.booked_on).toBe("2026-02-01");
  });

  it("flags but still imports advance > deal and missing deal", () => {
    expect(rows[5]!.booking).toBeDefined();
    expect(rows[5]!.flags).toContain("Advance is more than the deal");
    expect(rows[3]!.booking!.deal_inr).toBe(0);
    expect(rows[3]!.booking!.import_flags).toContain("Deal missing");
  });

  it("maps package variants to meal plans with notes", () => {
    expect(rows[0]!.booking!.meal_plan).toBe("MAP");
    expect(rows[0]!.booking!.package_note).toBe("Safari");
    expect(rows[1]!.booking!.meal_plan).toBe("EP");
    expect(rows[2]!.booking!.meal_plan).toBe("APAI");
    expect(rows[3]!.booking!.meal_plan).toBe("CP");
    expect(rows[5]!.booking!.meal_plan).toBeNull();
    expect(rows[5]!.flags.some((f) => f.includes("not mapped"))).toBe(true);
  });

  it("summarises the preview per sales person and property", () => {
    const s = summarizeImport(rows);
    expect(s.staff.find((x) => x.name === "Mohnish")!.rows).toBe(2);
    expect(s.properties.find((x) => x.name === "Yadus Jawai - By Alcor")!.rows).toBe(2);
    expect(s.flagged).toBe(2);
  });
});
