import { describe, it, expect } from "vitest";
import { BACKENTRY_DEADLINE, reviewWindow, requiredMonths, suggestedMatch } from "./kpi-review";
describe("Q50–57 dates and mapping", () => {
  it("keeps the owner's November 5 deadline", () => expect(BACKENTRY_DEADLINE).toBe("2026-11-05"));
  it("opens previous-month review on the 1st–3rd IST", () => {
    expect(reviewWindow("2026-10-01", new Date("2026-10-31T18:30:00Z"))).toBe(true);
    expect(reviewWindow("2026-10-01", new Date("2026-11-03T18:29:59Z"))).toBe(true);
    expect(reviewWindow("2026-10-01", new Date("2026-11-03T18:30:00Z"))).toBe(false);
    expect(reviewWindow("2026-09-01", new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });
  it("counts completed months since onboarding without guessing missing dates", () => {
    expect(requiredMonths("2026-08-20", "2026-11-05")).toBe(3);
    expect(requiredMonths(null, "2026-11-05")).toBeNull();
  });
  it("suggests exact normalized names without choosing uncertain links", () => {
    expect(suggestedMatch("Yogu's Woodside", [{ id: "woodside", name: "Yogus Woodside" }])).toBe("woodside");
    expect(suggestedMatch("Woodside Resort", [{ id: "woodside", name: "Yogus Woodside" }])).toBe("");
  });
});import { canReviewFetched, alcorPeriod } from "./kpi-review";
describe("fetched-month review rule", () => {
  const at = new Date("2026-10-26T08:00:00Z");
  it("allows back months any time", () => expect(canReviewFetched("2026-08-01", at)).toBe(true));
  it("blocks last month outside the 1st–3rd", () => expect(canReviewFetched("2026-09-01", at)).toBe(false));
  it("allows last month on the 2nd", () => expect(canReviewFetched("2026-09-01", new Date("2026-10-02T06:00:00Z"))).toBe(true));
  it("never allows the running month", () => expect(canReviewFetched("2026-10-01", at)).toBe(false));
  it("labels months before the pipeline start", () => {
    expect(alcorPeriod("2025-06-01", "2025-09-15", false)).toBe("Before Alcor");
    expect(alcorPeriod("2025-09-01", "2025-09-15", false)).toBe("Alcor");
    expect(alcorPeriod("2025-06-01", "2025-09-15", true)).toBeNull();
  });
});

import { fetchedRowOpen } from "./kpi-review";
describe("QA-12 one fetched review rule", () => {
  const at = new Date("2026-10-26T06:00:00Z");
  it("earlier months are reviewable on both screens, partial rows never", () => {
    expect(fetchedRowOpen({ month: "2026-08-01" }, at)).toBe(true);
    expect(fetchedRowOpen({ month: "2026-08-01", is_partial: true }, at)).toBe(false);
    expect(fetchedRowOpen({ month: "2026-10-01" }, at)).toBe(false);
  });
});
