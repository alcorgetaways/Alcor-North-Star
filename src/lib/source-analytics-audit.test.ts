import { describe, expect, it } from "vitest";
import {
  addMonths,
  alcorImpact,
  clipPeriod,
  compareLike,
  istMonth,
  lastCompleteMonth,
  periodMonths,
  profilesOver,
  rankGrowth,
  trackedOnly,
  type MonthValues,
} from "./source-analytics";

const row = (month: string, values: Record<string, number>): MonthValues => ({ month, values, ranks: {}, approved: false });
const months = (from: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(from, i));
const zeros = (from: string, n: number) => months(from, n).map((m) => row(m, { views: 0, calls: 0, website_clicks: 0, direction_requests: 0 }));
const LAST = "2026-09-01"; // today = 26 Oct 2026 IST → last complete month Sept 2026

describe("P1 — leading pre-tracking zeros are Not tracked", () => {
  it("Simcha Island: Apr-25→Apr-26 (13 months) dropped", () => {
    const rows = [...zeros("2025-04-01", 13), ...months("2026-05-01", 5).map((m) => row(m, { views: 900, calls: 10, website_clicks: 5, direction_requests: 5 }))];
    const t = trackedOnly(rows, LAST);
    expect(t.untracked).toHaveLength(13);
    expect(t.rows[0]!.month).toBe("2026-05-01");
  });
  it("Sariska: Apr→Dec-25 (9 months) dropped, Jan 460 views kept", () => {
    const rows = [...zeros("2025-04-01", 9), row("2026-01-01", { views: 460, calls: 4, website_clicks: 2, direction_requests: 3 })];
    const t = trackedOnly(rows, LAST);
    expect(t.untracked).toHaveLength(9);
    expect(profilesOver([t.rows], ["2025-06-01"], "views")).toBeNull();
    expect(profilesOver([t.rows], ["2026-01-01"], "views")).toBe(460);
  });
  it("Reflections 8, Spring Hill 7, Excel Corbett 2 leading months", () => {
    for (const n of [8, 7, 2]) expect(trackedOnly([...zeros("2025-04-01", n), row(addMonths("2025-04-01", n), { views: 1 })], LAST).untracked).toHaveLength(n);
  });
  it("a zero month AFTER tracking began stays a real zero", () => {
    const t = trackedOnly([row("2026-01-01", { views: 5 }), ...zeros("2026-02-01", 1)], LAST);
    expect(t.rows).toHaveLength(2);
  });
  it("Alcor impact Before average uses tracked months only", () => {
    const rows = trackedOnly([...zeros("2025-04-01", 9), ...months("2026-01-01", 6).map((m) => row(m, { calls: 10, website_clicks: 10, direction_requests: 10, views: 1 }))], LAST).rows;
    const i = alcorImpact(rows, "2026-04-01")!;
    expect(i.beforeMonths).toBe(3);
    expect(i.before).toBe(30);
  });
});

describe("P2 — like-for-like comparisons", () => {
  it("profiles not tracked a year ago are excluded and counted", () => {
    const old = [row("2025-09-01", { views: 1000 }), row("2026-09-01", { views: 1100 })];
    const fresh = trackedOnly([...zeros("2025-04-01", 9), row("2026-09-01", { views: 5000 })], LAST).rows;
    const c = compareLike([old, fresh], ["2026-09-01"], ["2025-09-01"], "views");
    expect(c.compared).toBe(1);
    expect(c.total).toBe(2);
    expect(c.pct).toBeCloseTo(10);
  });
  it("per-profile growth is N/A when either side is not tracked", () => {
    expect(compareLike([[row("2026-09-01", { views: 5 })]], ["2026-09-01"], ["2025-09-01"], "views").pct).toBeNull();
  });
});

describe("P3 — partial periods and IST", () => {
  it("running month in IST: 30 Sep 19:00 UTC is already October in India", () => {
    expect(istMonth(new Date("2026-09-30T19:00:00Z"))).toBe("2026-10-01");
    expect(lastCompleteMonth(new Date("2026-10-26T15:58:00Z"))).toBe("2026-09-01");
  });
  it("Year 2026 = Jan–Sep vs Jan–Sep 2025, labelled partial", () => {
    const p = clipPeriod("year", "2026-12-01", "previous", LAST);
    expect(p.months).toEqual(periodMonths("ytd", "2026-09-01"));
    expect(p.cmp).toEqual(months("2025-01-01", 9));
    expect(p.label).toBe("Jan–Sep 2026 (partial year)");
  });
  it("Q4 2026 with no complete month is empty; Q3 is complete", () => {
    expect(clipPeriod("quarter", "2026-12-01", "previous", LAST).months).toEqual([]);
    expect(clipPeriod("quarter", "2026-09-01", "previous", LAST).partial).toBe(false);
  });
  it("trackedOnly drops the running month", () => {
    expect(trackedOnly([row("2026-09-01", { views: 1 }), row("2026-10-01", { views: 2 })], LAST).rows.map((r) => r.month)).toEqual(["2026-09-01"]);
  });
});

describe("P4 — review deltas per profile", () => {
  // Spring Hill pipeline: Spring Hill Resort profile + Mama's Rasoi (no October row).
  const springHill = [row("2025-12-01", { views: 1, reviews_received: 3800, five_star_reviews: 3000 }), row("2026-09-01", { views: 1, reviews_received: 3878, five_star_reviews: 3050 }), row("2026-10-01", { views: 1, reviews_received: 3896, five_star_reviews: 3060 })];
  const mamas = [row("2025-12-01", { views: 1, reviews_received: 10, five_star_reviews: 8 }), row("2026-09-01", { views: 1, reviews_received: 18, five_star_reviews: 14 })];
  const profiles = [trackedOnly(springHill, LAST).rows, trackedOnly(mamas, LAST).rows];
  const year = clipPeriod("year", "2026-12-01", "previous", LAST).months;

  it("no fake −3,878 drop when one profile's month is missing", () => {
    const raw = [springHill, mamas];
    expect(profilesOver(raw, ["2026-10-01"], "new_reviews")).toBe(18); // Mama's skipped, not counted as 0
    expect(profilesOver(profiles, year, "new_reviews")).toBe(78 + 8);
  });
  it("5-star added ≤ new reviews for every period and the portfolio", () => {
    for (const ms of [year, ...months("2026-01-01", 9).map((m) => [m]), periodMonths("quarter", "2026-09-01")]) {
      const n = profilesOver(profiles, ms, "new_reviews");
      const f = profilesOver(profiles, ms, "new_five_star");
      if (n != null && f != null) expect(f).toBeLessThanOrEqual(n);
      for (const p of profiles) {
        const pn = profilesOver([p], ms, "new_reviews");
        if (pn != null) expect(pn).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("P8 — top/bottom ranking base", () => {
  it("ignores profiles under 100 interactions in the comparison period", () => {
    const r = rankGrowth([{ id: "a", cur: 655, prev: 123 }, { id: "b", cur: 50, prev: 5 }]);
    expect(r.map((x) => x.id)).toEqual(["a"]);
    expect(Math.round(r[0]!.growth)).toBe(433);
  });
});
