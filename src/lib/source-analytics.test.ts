import { describe, expect, it } from "vitest";
import { alcorImpact, comparisonMonths, metricOver, periodMonths, rankBuckets, type MonthValues } from "./source-analytics";

const row = (month: string, values: Record<string, number>): MonthValues => ({ month, values, ranks: {}, approved: false });
const rows = [
  row("2026-06-01", { calls: 10, website_clicks: 5, direction_requests: 5, reviews_received: 100, five_star_reviews: 80 }),
  row("2026-07-01", { calls: 20, website_clicks: 10, direction_requests: 10, reviews_received: 110, five_star_reviews: 86 }),
  row("2026-08-01", { calls: 30, website_clicks: 10, direction_requests: 20, reviews_received: 125, five_star_reviews: 95 }),
  row("2026-09-01", { calls: 40, website_clicks: 20, direction_requests: 20, reviews_received: 130, five_star_reviews: 99 }),
];

describe("GBP analytics", () => {
  it("interactions = calls + website clicks + directions", () => {
    expect(metricOver(rows, ["2026-07-01"], "interactions")).toBe(40);
  });
  it("quarter sums flow metrics", () => {
    expect(metricOver(rows, periodMonths("quarter", "2026-08-01"), "calls")).toBe(90);
  });
  it("new reviews = change in cumulative total over the period", () => {
    expect(metricOver(rows, periodMonths("quarter", "2026-08-01"), "new_reviews")).toBe(30);
    expect(metricOver(rows, ["2026-09-01"], "new_five_star")).toBe(4);
  });
  it("new reviews is unknown without the month before the period", () => {
    expect(metricOver(rows, ["2026-06-01"], "new_reviews")).toBeNull();
  });
  it("missing metrics stay null, never zero", () => {
    expect(metricOver(rows, ["2026-07-01"], "posts")).toBeNull();
  });
  it("comparison periods", () => {
    expect(comparisonMonths("month", "2026-01-01", "previous")).toEqual(["2025-12-01"]);
    expect(comparisonMonths("quarter", "2026-08-01", "previous")).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
    expect(comparisonMonths("month", "2026-08-01", "last_year")).toEqual(["2025-08-01"]);
  });
  it("Alcor impact compares monthly averages", () => {
    const i = alcorImpact(rows, "2026-08-01")!;
    expect(i.before).toBe(30);
    expect(i.since).toBe(70);
  });
  it("keyword buckets: lower is better", () => {
    expect(rankBuckets({ a: 1, b: 3.5, c: 15, d: 40 })).toEqual({ top3: 1, top10: 1, top20: 1, beyond: 1 });
  });
});
