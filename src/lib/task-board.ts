/** Pure helpers for the task trackers (My Tasks + Action Tracker): progress, counts, board columns. */

/** Progress shown on a task card, derived only from its status (no stored field). */
export function taskProgress(status: string): number {
  switch (status) {
    case "done":
    case "completed":
    case "not_applicable":
      return 100;
    case "waiting_client":
      return 75;
    case "in_progress":
    case "blocked":
    case "delayed":
      return 50;
    default:
      return 0;
  }
}

/** Share of total as a whole percent; 0 when there is nothing. */
export function shareOf(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export type MyTaskLike = { status: string; due_date: string };
export type MyTaskGroups<T> = { overdue: T[]; thisWeek: T[]; waiting: T[]; later: T[]; done: T[] };

/** Each task lands in exactly one group; waiting-on-client wins over due-date groups. */
export function groupMyTasks<T extends MyTaskLike>(rows: T[], today: string, weekEnd: string): MyTaskGroups<T> {
  const isDone = (t: T) => t.status === "done" || t.status === "not_applicable";
  const open = rows.filter((t) => !isDone(t));
  const actionable = open.filter((t) => t.status !== "waiting_client");
  return {
    overdue: actionable.filter((t) => t.due_date < today),
    thisWeek: actionable.filter((t) => t.due_date >= today && t.due_date <= weekEnd),
    waiting: open.filter((t) => t.status === "waiting_client"),
    later: actionable.filter((t) => t.due_date > weekEnd),
    done: rows.filter(isDone),
  };
}

export type ActionLike = { status: string; priority: string; due_date: string | null };
export const ACTION_COLUMNS = ["high", "medium", "low", "completed"] as const;
export type ActionColumn = (typeof ACTION_COLUMNS)[number];

/** Board column for an action: closed → completed; critical shares the High column. Dropped stays off the board. */
export function actionColumn(a: ActionLike): ActionColumn | null {
  if (a.status === "completed") return "completed";
  if (a.status === "dropped") return null;
  if (a.priority === "critical" || a.priority === "high") return "high";
  if (a.priority === "low") return "low";
  return "medium";
}

export function actionCounts(rows: ActionLike[], today: string) {
  const open = rows.filter((a) => !["completed", "dropped"].includes(a.status));
  return {
    total: rows.length,
    open: open.length,
    high: open.filter((a) => a.priority === "high" || a.priority === "critical").length,
    overdue: open.filter((a) => a.due_date != null && a.due_date < today).length,
    completed: rows.filter((a) => a.status === "completed").length,
    dropped: rows.filter((a) => a.status === "dropped").length,
  };
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

/** IST calendar month ("YYYY-MM") of a UTC timestamp. */
export function istMonthOf(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  return d.toISOString().slice(0, 7);
}

/** Previous "YYYY-MM". */
export function prevMonth(ym: string): string {
  const [y = 0, m = 1] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Completed actions per IST month: this month, last month and the change. */
export function completedByMonth(rows: Array<{ completed_at: string | null }>, ym: string) {
  const prev = prevMonth(ym);
  let current = 0;
  let previous = 0;
  for (const r of rows) {
    if (!r.completed_at) continue;
    const m = istMonthOf(r.completed_at);
    if (m === ym) current += 1;
    else if (m === prev) previous += 1;
  }
  return { current, previous, delta: current - previous };
}
