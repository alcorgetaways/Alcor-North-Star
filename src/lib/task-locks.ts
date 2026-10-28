/**
 * Gate A lock state for task lists (QA-22). Every screen derives the "Locked"
 * chip from the same tasks_gate_a_locked RPC result through this helper, so a
 * chip can never disagree with the lock. On error we fail closed (locked) so
 * work beyond Gate A is never opened by a failed check.
 */
export function isGateLocked(
  rows: Map<string, boolean> | Array<{ task_id: string; locked: boolean }> | null | undefined,
  taskId: string,
  errored: boolean,
): boolean {
  if (errored) return true;
  if (!rows) return false;
  if (rows instanceof Map) return Boolean(rows.get(taskId));
  return Boolean(rows.find((r) => r.task_id === taskId)?.locked);
}
