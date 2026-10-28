import { expect, it } from "vitest";
import { isGateLocked } from "./task-locks";

it("QA-22 lock chip always agrees with the tasks_gate_a_locked result", () => {
  const rows = [
    { task_id: "a", locked: true },
    { task_id: "b", locked: false },
  ];
  expect(isGateLocked(rows, "a", false)).toBe(true);
  expect(isGateLocked(rows, "b", false)).toBe(false);
  expect(isGateLocked(rows, "missing", false)).toBe(false);
  expect(isGateLocked(new Map(rows.map((r) => [r.task_id, r.locked])), "a", false)).toBe(true);
  expect(isGateLocked(null, "a", false)).toBe(false);
});

it("QA-22 a failed lock check fails closed on every screen", () => {
  const rows = [{ task_id: "a", locked: false }];
  expect(isGateLocked(rows, "a", true)).toBe(true);
  expect(isGateLocked(null, "a", true)).toBe(true);
});
