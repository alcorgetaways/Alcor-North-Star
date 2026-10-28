import { describe, expect, it } from "vitest";
import { allOtasRow, evidenceUrlError, ownerUploadError, taskBlockerFields, taskDateError } from "./form-rules";
import { DEFAULT_PIPELINE_CODE, canAccess } from "./access";

describe("P3 QA rules", () => {
  it("QA-24 records blocker details only while blocked and rejects an empty editable due date", () => {
    expect(taskBlockerFields("done", "Other blocker", "Delayed")).toEqual({ blocker_reason: null, blocker_impact: null });
    expect(taskBlockerFields("waiting_client", "Other blocker", "Delayed").blocker_reason).toBe("Waiting on client approval");
    expect(taskDateError(true, "")).toBe("Choose a due date before saving");
    expect(taskDateError(false, "")).toBeNull();
  });
  it("QA-31 rejects large uploads before account lookup", () => {
    expect(ownerUploadError({ size: 10 * 1024 * 1024 + 1, type: "application/pdf" })).toBe("Maximum file size is 10 MB");
    expect(ownerUploadError({ size: 10 * 1024 * 1024, type: "application/pdf" })).toBeNull();
  });
  it("QA-32 selects All OTAs rather than the first matching channel", () => {
    const all = { month: "2026-09-01", ota_name: "All OTAs", revenue: 200 };
    expect(allOtasRow([{ month: all.month, ota_name: "Booking.com", revenue: 100 }, all], all.month)).toBe(all);
    expect(allOtasRow([{ month: all.month, ota_name: "Booking.com" }], all.month)).toBeUndefined();
  });
  it("QA-33 rejects unsafe evidence schemes and credentials", () => {
    expect(evidenceUrlError("javascript:alert(1)")).toBeTruthy();
    expect(evidenceUrlError("not a link")).toBeTruthy();
    expect(evidenceUrlError("https://user:password@example.org/file")).toBeTruthy();
    expect(evidenceUrlError("https://example.org/file")).toBeNull();
  });
  it("QA-37 default pipeline is the guard's default", () => {
    expect(DEFAULT_PIPELINE_CODE).toBe("performance_marketing");
    expect(canAccess("/pipeline-kpis", {}, ["team_member"], [DEFAULT_PIPELINE_CODE])).toBe(true);
    expect(canAccess("/pipeline-kpis", {}, ["team_member"], ["email_marketing"])).toBe(false);
  });
});