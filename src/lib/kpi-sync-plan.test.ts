import { expect, it } from "vitest";
import { historyPlan } from "./kpi-sync-plan";

// 26 Oct 2026 10:00 UTC = 15:30 IST — the running IST month is October, last complete is September.
const NOW = new Date("2026-10-26T10:00:00Z");

it("never includes the running IST month", () => {
  expect(historyPlan({ startDate: "2026-08-14", source: "metricool", now: NOW })).toEqual(["2026-08-01", "2026-09-01"]);
});

it("caps Localo history at 18 months but not Metricool", () => {
  const localo = historyPlan({ startDate: "2024-01-10", source: "localo", now: NOW, cap: 99 });
  expect(localo[0]).toBe("2025-04-01");
  expect(localo).toHaveLength(18);
  expect(historyPlan({ startDate: "2024-01-10", source: "metricool", now: NOW, cap: 99 })).toHaveLength(33);
});

it("skips stored complete months and re-attempts partial ones", () => {
  const existing = new Map([
    ["2026-08-01", { status: "fetched", is_partial: false, raw_data: null }],
    ["2026-09-01", { status: "fetched", is_partial: true, raw_data: null }],
  ]);
  expect(historyPlan({ startDate: "2026-08-01", source: "metricool", now: NOW, existing })).toEqual(["2026-09-01"]);
});

it("attempts at most 12 months per run so the progress total matches the runner", () => {
  expect(historyPlan({ startDate: "2024-01-10", source: "metricool", now: NOW })).toHaveLength(12);
});
