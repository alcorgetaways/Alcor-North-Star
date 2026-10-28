import { describe, expect, it } from "vitest";
import { editableLogDates, mondayOf, periodBounds } from "./rd-periods";

describe("Reservation Desk periods", () => {
  it("weeks start on Monday", () => {
    expect(mondayOf("2026-10-23")).toBe("2026-10-19");
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(periodBounds("week", "2026-01-01")).toMatchObject({ from: "2025-12-29", to: "2026-01-05" });
  });
  it("months, quarters and the calendar year", () => {
    expect(periodBounds("month", "2026-12-15")).toMatchObject({ from: "2026-12-01", to: "2027-01-01" });
    expect(periodBounds("quarter", "2026-05-09")).toMatchObject({ from: "2026-04-01", to: "2026-07-01" });
    expect(periodBounds("year", "2026-10-23")).toMatchObject({ from: "2026-01-01", to: "2027-01-01" });
  });
  it("associates can edit only today and yesterday", () => {
    expect(editableLogDates("2026-11-01")).toEqual(["2026-11-01", "2026-10-31"]);
  });
});
