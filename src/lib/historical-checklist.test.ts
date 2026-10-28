import { describe, expect, it } from "vitest";
import { historicalBoardTask } from "./historical-checklist";
describe("owner-authorized historical checklist", () => {
  it("shows historical rows as done without manufacturing deadline, owner or approval", () => {
    const row = historicalBoardTask({ id: "historic", launch_id: "launch", notes: "Completed before North Star", week_due: 10 });
    expect(row.status).toBe("done");
    expect(row.due_date).toBe("");
    expect(row.assignee_id).toBeNull();
    expect(row.client_approved_at).toBeNull();
    expect(row.evidence_url).toBeNull();
    expect(row.historical).toBe(true);
    expect(row.week_due).toBe(10);
  });
});