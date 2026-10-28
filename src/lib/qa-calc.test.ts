import { describe, expect, it } from "vitest";
import { backoffDelay, isStorableMonth, lastCompleteMonthIST, refetchRawData, runningMonthIST, shouldRefetch } from "@/lib/kpi-sync-plan";
import { hotelScores, isLate, portfolioScore, type PipelineScoreRow } from "@/lib/report-scores";
import { reportTiming } from "@/lib/scorecard";
import { isRealClient } from "@/lib/demo";

const NOW = new Date("2026-10-26T12:00:00Z");

describe("L3 source sync months (IST)", () => {
  it("never stores the running month on 26 Oct 2026", () => {
    expect(runningMonthIST(NOW)).toBe("2026-10-01");
    expect(lastCompleteMonthIST(NOW)).toBe("2026-09-01");
    expect(isStorableMonth("2026-10-01", NOW)).toBe(false);
    expect(isStorableMonth("2026-09-01", NOW)).toBe(true);
  });
  it("uses India time at the month boundary (1 Nov 00:30 IST = 31 Oct 19:00 UTC)", () => {
    expect(runningMonthIST(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11-01");
  });
  it("re-fetches a partial row once its month is complete, never a reviewed one", () => {
    expect(shouldRefetch("2026-10-01", { status: "fetched", is_partial: true }, NOW)).toBe(false);
    const nov3 = new Date("2026-11-03T06:00:00Z");
    expect(shouldRefetch("2026-10-01", { status: "fetched", is_partial: true }, nov3)).toBe(true);
    expect(shouldRefetch("2026-10-01", { status: "approved", is_partial: true }, nov3)).toBe(false);
    expect(shouldRefetch("2026-10-01", { status: "confirmed", is_partial: false }, nov3)).toBe(false);
  });
  it("re-fetches the last complete month on the 2nd and 5th only, once per day", () => {
    const nov2 = new Date("2026-11-02T06:00:00Z");
    const nov5 = new Date("2026-11-05T06:00:00Z");
    const nov4 = new Date("2026-11-04T06:00:00Z");
    const row = { status: "fetched", is_partial: false };
    expect(shouldRefetch("2026-10-01", row, nov2)).toBe(true);
    expect(shouldRefetch("2026-10-01", row, nov4)).toBe(false);
    expect(shouldRefetch("2026-10-01", row, nov5)).toBe(true);
    expect(shouldRefetch("2026-10-01", { ...row, raw_data: { refetch_checkpoint: "2026-10-01:5" } }, nov5)).toBe(false);
    expect(shouldRefetch("2026-09-01", row, nov2)).toBe(false);
  });
  it("keeps the previous values and timestamp in raw_data.previous_fetch", () => {
    const raw = refetchRawData({ fetched_values: { views: 10 }, fetched_at: "2026-10-26T10:00:00Z", raw_data: { period: "alcor" } }, { x: 1 }, "2026-10-01", new Date("2026-11-02T06:00:00Z"));
    expect(raw.previous_fetch).toEqual({ values: { views: 10 }, fetched_at: "2026-10-26T10:00:00Z", earlier: null });
    expect(raw.period).toBe("alcor");
  });
});

describe("L14 Localo backoff", () => {
  it("grows exponentially with jitter, capped at 30s", () => {
    expect(backoffDelay(0, () => 0)).toBe(500);
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(3, () => 0)).toBe(4000);
    expect(backoffDelay(10, () => 1)).toBe(30000);
  });
});

describe("L10 IST end of day", () => {
  it("00:30 IST the day after the due date is late", () => {
    const r = { status: "submitted", due_date: "2026-11-05", submitted_at: "2026-11-05T19:00:00Z" }; // 6 Nov 00:30 IST
    expect(reportTiming(r)).toBe("late");
    expect(isLate(r.submitted_at, r.due_date)).toBe(true);
  });
  it("23:30 IST on the due date is on time", () => {
    expect(reportTiming({ status: "submitted", due_date: "2026-11-05", submitted_at: "2026-11-05T18:00:00Z" })).toBe("on_time");
  });
});

describe("L8 dashboard scores", () => {
  const rows: PipelineScoreRow[] = [
    { month: "2026-09-01", client_id: "a", hotel_name: "A", client_pipeline_id: "1", weight: 1, score: 60 },
    { month: "2026-09-01", client_id: "a", hotel_name: "A", client_pipeline_id: "2", weight: 1, score: 90 },
    { month: "2026-09-01", client_id: "a", hotel_name: "A", client_pipeline_id: "3", weight: 1, score: 90 },
    { month: "2026-09-01", client_id: "b", hotel_name: "B", client_pipeline_id: "4", weight: 2, score: 100 },
  ];
  it("hotel score is the true mean, not a pairwise average", () => {
    // pairwise bug would give ((60+90)/2+90)/2 = 82.5
    expect(hotelScores(rows, "2026-09-01")[0]).toEqual({ id: "a", hotel: "A", score: 80 });
  });
  it("portfolio score is weighted by pipeline weight", () => {
    expect(portfolioScore(rows, "2026-09-01")).toBe((60 + 90 + 90 + 200) / 5);
    expect(portfolioScore(rows, "2026-10-01")).toBeNull();
  });
});

describe("L7 real client predicate", () => {
  it("excludes test and demo hotels", () => {
    expect(isRealClient({ is_test: true, is_demo: false })).toBe(false);
    expect(isRealClient({ is_test: true, is_demo: true })).toBe(false);
    expect(isRealClient({ is_test: false, is_demo: false })).toBe(true);
  });
});
