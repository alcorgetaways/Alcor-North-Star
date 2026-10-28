import { describe, expect, it } from "vitest";
import {
  bookingError, dailyLogError, isUuid, isClientError, latestCompleteMonth, manualBookingKey,
  parseMetric, parseMetrics, pickFields, questionPipelineOptions, quickStatusError, targetRowsToSave,
} from "./form-rules";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

describe("QA-01 owner question pipeline options", () => {
  it("options are pipelines.id uuids, never codes", () => {
    const opts = questionPipelineOptions([
      { id: U2, pipeline_id: U1, pipelines: { code: "gbp", name: "Google Business Profile" } },
      { id: "x", pipeline_id: "gbp", pipelines: { code: "gbp", name: "bad" } },
    ]);
    expect(opts).toEqual([{ id: U1, name: "Google Business Profile", clientPipelineId: U2 }]);
    expect(opts.every((o) => isUuid(o.id))).toBe(true);
  });
});

describe("QA-02 parseMetric", () => {
  it("blank is null, not 0", () => expect(parseMetric("")).toEqual({ value: null, error: null }));
  it("text is rejected", () => expect(parseMetric("abc").error).toBe("Enter a number"));
  it("negative is rejected", () => expect(parseMetric("-5").error).toBe("Can't be negative"));
  it("valid numbers parse, commas allowed", () => expect(parseMetric("1,250").value).toBe(1250));
  it("one bad field blocks save", () => {
    const r = parseMetrics({ calls: "3", views: "x" }, ["calls", "views"] as const);
    expect(r.ok).toBe(false);
    expect(r.values.calls).toBe(3);
  });
});

describe("QA-04 no retry on 4xx", () => {
  it("permission and bad-id errors are client errors", () => {
    expect(isClientError({ code: "22P02" })).toBe(true);
    expect(isClientError({ status: 403 })).toBe(true);
    expect(isClientError({ status: 500 })).toBe(false);
  });
});

describe("QA-13 data sync month", () => {
  it("defaults to the latest complete IST month", () => {
    expect(latestCompleteMonth(new Date("2026-10-26T12:00:00Z"))).toBe("2026-09");
    // 31 Oct 19:00 UTC is already 1 Nov in India
    expect(latestCompleteMonth(new Date("2026-10-31T19:00:00Z"))).toBe("2026-10");
  });
});

describe("QA-15 manual bookings", () => {
  it("two identical walk-ins get different keys", () => expect(manualBookingKey()).not.toBe(manualBookingKey()));
  it("validates dates and amounts", () => {
    expect(bookingError({ checkIn: "2026-11-05", checkOut: "2026-11-04" })).toMatch(/Check-out/);
    expect(bookingError({ deal: -1 })).toMatch(/negative/);
    expect(bookingError({ deal: 1000, advance: 1500 })).toMatch(/more than/);
    expect(bookingError({ checkIn: "2026-11-05", checkOut: "2026-11-05", deal: 1000, advance: 500 })).toBeNull();
  });
});

describe("QA-16 daily log", () => {
  it("sends only log fields", () => {
    expect(Object.keys(pickFields({ id: "x", created_at: "y", dials: 3, user_id: "u", log_date: "d" }, ["user_id", "log_date", "dials"]))).toEqual(["user_id", "log_date", "dials"]);
  });
  it("connects can't exceed dials", () => expect(dailyLogError({ dials: 5, connects: 6 })).toMatch(/more than dials/));
});

describe("QA-17 targets", () => {
  it("saves only edited rows; 0 needs confirmation; negatives rejected", () => {
    const r = targetRowsToSave([
      { id: "a", value: "120", touched: false },
      { id: "b", value: "50", touched: true },
      { id: "c", value: "0", touched: true },
      { id: "d", value: "0", touched: true, zeroConfirmed: true },
      { id: "e", value: "-3", touched: true },
    ]);
    expect(r.save).toEqual([{ id: "b", value: 50 }, { id: "d", value: 0 }]);
    expect(Object.keys(r.errors)).toEqual(["c", "e"]);
  });
});

describe("QA-09 quick status", () => {
  it("waiting on client needs evidence, like the task panel", () => {
    expect(quickStatusError({ status: "in_progress", evidence_url: "" }, "waiting_client")).toMatch(/evidence/);
    expect(quickStatusError({ status: "in_progress", evidence_url: "https://x" }, "waiting_client")).toBeNull();
    expect(quickStatusError({ status: "in_progress" }, "done")).toBeNull();
  });
});

import { parseRequiredMetrics } from "./form-rules";
describe("QA-02 required columns", () => {
  it("blank in a required field is an error, never 0", () => {
    const r = parseRequiredMetrics({ calls: "" }, ["calls"] as const);
    expect(r.ok).toBe(false);
    expect(r.errors.calls).toMatch(/0 if none/);
  });
});
