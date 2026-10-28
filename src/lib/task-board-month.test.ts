import { describe, expect, it } from "vitest";
import { completedByMonth, istMonthOf, prevMonth } from "./task-board";

describe("Action completion IST month boundary", () => {
  it("31 Oct 18:29 UTC is still October in IST, 18:30 UTC is November", () => {
    expect(istMonthOf("2026-10-31T18:29:59Z")).toBe("2026-10");
    expect(istMonthOf("2026-10-31T18:30:00Z")).toBe("2026-11");
  });
  it("30 Sep 19:00 UTC counts as 1 Oct IST", () => {
    expect(istMonthOf("2026-09-30T19:00:00Z")).toBe("2026-10");
  });
  it("January's previous month is last December", () => {
    expect(prevMonth("2027-01")).toBe("2026-12");
  });
  it("counts this month vs last month, ignoring unrecorded dates", () => {
    const r = completedByMonth(
      [{ completed_at: "2026-10-05T05:00:00Z" }, { completed_at: "2026-09-30T19:00:00Z" }, { completed_at: "2026-09-10T05:00:00Z" }, { completed_at: null }],
      "2026-10",
    );
    expect(r).toEqual({ current: 2, previous: 1, delta: 1 });
  });
});
