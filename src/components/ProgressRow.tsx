import { cn } from "@/lib/utils";

/**
 * Goal attainment / pacing row: label, thin bar (navy fill, gold at ≥100%),
 * value / goal and percent.
 */
export function ProgressRow({
  label,
  value,
  goal,
  format = (n: number) => n.toLocaleString("en-IN"),
  hint,
  className,
}: {
  label: string;
  value: number;
  goal: number;
  format?: (n: number) => string;
  hint?: string;
  className?: string;
}) {
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
  const width = Math.min(100, goal > 0 ? (value / goal) * 100 : 0);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-small text-foreground">{label}</p>
        <p className="text-label text-muted-foreground tabular-nums">
          {format(value)} / {format(goal)} · {pct}%
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", pct >= 100 ? "bg-gold" : "bg-primary")}
          style={{ width: `${width}%` }}
        />
      </div>
      {hint ? <p className="text-label text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
