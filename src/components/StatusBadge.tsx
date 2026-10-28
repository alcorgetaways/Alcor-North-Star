import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "muted";

/**
 * One status mapping for the whole app. Normalise (lowercase, dashes/underscores
 * to spaces) and look up the tone; unknown statuses render muted.
 */
const TONE_BY_STATUS: Record<string, Tone> = {
  // green
  active: "success",
  approved: "success",
  paid: "success",
  "on time": "success",
  verified: "success",
  live: "success",
  resolved: "success",
  booked: "success",
  won: "success",
  yes: "success",
  submitted: "success",
  // amber
  pending: "warning",
  provisional: "warning",
  proposed: "warning",
  "on hold": "warning",
  "due soon": "warning",
  "awaiting day0": "warning",
  "in progress": "warning",
  requested: "warning",
  nurture: "warning",
  "payment awaiting": "warning",
  "waiting client": "warning",
  // red
  churn: "danger",
  churned: "danger",
  overdue: "danger",
  failed: "danger",
  missed: "danger",
  blocked: "danger",
  lost: "danger",
  rejected: "danger",
  due: "danger",
  voided: "danger",
  // grey
  draft: "muted",
  completed: "muted",
  cancelled: "muted",
  "not specified": "muted",
  demo: "muted",
  closed: "muted",
  ended: "muted",
  "no launch": "muted",
  unknown: "muted",
  inactive: "muted",
  offboarding: "muted",
  "not started": "muted",
  "upgraded": "muted",
  "downgraded": "muted",
  baseline: "muted",
  "not graded": "muted",
};

const TONE_CLASS: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

const DOT_CLASS: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/60",
};

function normalize(status: string) {
  return status.trim().toLowerCase().replace(/[-_]+/g, " ");
}

export function statusTone(status: string): Tone {
  return TONE_BY_STATUS[normalize(status)] ?? "muted";
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  /** Raw status value; mapped through the shared tone table. */
  status: string;
  /** Display text; defaults to the raw status. */
  label?: string;
  /** Force a tone instead of the mapped one. */
  tone?: Tone;
  className?: string;
}) {
  const t = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label font-medium whitespace-nowrap",
        TONE_CLASS[t],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[t])} aria-hidden="true" />
      {label ?? status}
    </span>
  );
}
