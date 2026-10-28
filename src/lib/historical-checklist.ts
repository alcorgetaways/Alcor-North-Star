/** Historical snapshots have no operational deadlines, assignees or approvals. */
export function historicalBoardTask<T extends { id: string; launch_id: string; notes: string; week_due: number }>(row: T) {
  return { ...row, historical: true as const, due_date: "", status: "done", assignee_id: null, backup_id: null,
    evidence_url: null, requires_client_approval: false, client_approved_at: null, carried_from_task_id: null };
}