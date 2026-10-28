import { LAUNCH_ROLES } from "@/lib/constants";

export const TASK_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_client", label: "Waiting on client" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

export const TASK_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s.label]),
);

/** Chip colours per task status — semantic tokens only. */
export const TASK_CHIP: Record<string, string> = {
  done: "border-success/50 bg-success/15 text-success",
  in_progress: "border-primary/40 bg-primary/10 text-primary",
  waiting_client: "border-warning/50 bg-warning/15 text-warning-foreground",
  blocked: "border-destructive bg-background text-destructive border-2",
  not_applicable: "border-border bg-muted text-muted-foreground line-through",
  not_started: "border-border bg-card text-foreground",
};

export const LAUNCH_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  proposed: "Proposed",
  awaiting_day0: "Ready to activate",
  active: "Active",
  on_hold: "On hold",
  live: "Live",
  offboarding: "Offboarding",
  completed: "Completed",
  cancelled: "Cancelled",
  closed: "Closed",
};

export const LAUNCH_STATUS_CLASS: Record<string, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  proposed: "border-border bg-muted text-muted-foreground",
  awaiting_day0: "border-warning/50 bg-warning/15 text-warning-foreground",
  active: "border-primary/40 bg-primary/10 text-primary",
  on_hold: "border-warning/50 bg-warning/15 text-warning-foreground",
  live: "border-success/50 bg-success/15 text-success",
  offboarding: "border-gold/60 bg-gold/15 text-foreground",
  completed: "border-success/50 bg-success/15 text-success",
  cancelled: "border-border bg-muted text-muted-foreground",
  closed: "border-border bg-muted text-muted-foreground",
};

/** Statuses that count as an open/active launch. */
export const ACTIVE_LAUNCH_STATUSES = ["active", "live", "on_hold", "offboarding"] as const;

export const GATE_CLASS: Record<string, string> = {
  open: "border-border bg-card text-muted-foreground",
  ready: "border-warning/50 bg-warning/15 text-warning-foreground",
  signed: "border-success/50 bg-success/15 text-success",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return LAUNCH_ROLES.find((r) => r.value === role)?.label ?? role.replace(/_/g, " ");
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today's date in IST (the team's timezone) as YYYY-MM-DD. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Week X of N: ceil((today - day0)/7) clamped 0..N. */
export function launchWeek(day0: string | null | undefined, n: number): number | null {
  if (!day0) return null;
  const days = (new Date(todayISO()).getTime() - new Date(day0).getTime()) / 86400000;
  return Math.min(n, Math.max(0, Math.ceil(days / 7)));
}

export function isOverdue(t: { due_date: string; status: string }): boolean {
  return t.due_date < todayISO() && t.status !== "done" && t.status !== "not_applicable";
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
