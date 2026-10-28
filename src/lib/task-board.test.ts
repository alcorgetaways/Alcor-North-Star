import { describe, expect, it } from "vitest";
import { actionColumn, actionCounts, groupMyTasks, initials, shareOf, taskProgress } from "@/lib/task-board";

describe("task progress", () => {
  it("maps statuses", () => {
    expect(taskProgress("done")).toBe(100);
    expect(taskProgress("completed")).toBe(100);
    expect(taskProgress("waiting_client")).toBe(75);
    expect(taskProgress("in_progress")).toBe(50);
    expect(taskProgress("not_started")).toBe(0);
  });
});

describe("my task groups", () => {
  const rows = [
    { status: "not_started", due_date: "2026-10-20" },
    { status: "in_progress", due_date: "2026-10-28" },
    { status: "waiting_client", due_date: "2026-10-01" },
    { status: "not_started", due_date: "2026-12-01" },
    { status: "done", due_date: "2026-10-01" },
  ];
  const g = groupMyTasks(rows, "2026-10-26", "2026-11-02");
  it("every task in exactly one group", () => {
    expect(g.overdue.length + g.thisWeek.length + g.waiting.length + g.later.length + g.done.length).toBe(rows.length);
  });
  it("waiting on client wins over overdue", () => {
    expect(g.waiting).toHaveLength(1);
    expect(g.overdue).toHaveLength(1);
  });
});

describe("action board", () => {
  it("columns", () => {
    expect(actionColumn({ status: "in_progress", priority: "critical", due_date: null })).toBe("high");
    expect(actionColumn({ status: "completed", priority: "low", due_date: null })).toBe("completed");
    expect(actionColumn({ status: "dropped", priority: "low", due_date: null })).toBeNull();
    expect(actionColumn({ status: "not_started", priority: "medium", due_date: null })).toBe("medium");
  });
  it("counts", () => {
    const c = actionCounts([
      { status: "not_started", priority: "high", due_date: "2026-10-01" },
      { status: "completed", priority: "high", due_date: "2026-10-01" },
      { status: "dropped", priority: "low", due_date: null },
      { status: "in_progress", priority: "low", due_date: "2026-11-30" },
    ], "2026-10-26");
    expect(c).toEqual({ total: 4, open: 2, high: 1, overdue: 1, completed: 1, dropped: 1 });
  });
  it("share and initials", () => {
    expect(shareOf(12, 24)).toBe(50);
    expect(shareOf(1, 0)).toBe(0);
    expect(initials("Anju Sharma")).toBe("AS");
    expect(initials(null)).toBe("?");
  });
});
