import { cn } from "@/lib/utils";

const GRADE_CLASS: Record<string, string> = {
  "A+": "border-success/30 bg-success/10 text-success",
  A: "border-success/30 bg-success/10 text-success",
  B: "border-primary/30 bg-primary/10 text-primary",
  C: "border-warning/40 bg-warning/10 text-warning-foreground",
  D: "border-destructive/30 bg-destructive/10 text-destructive",
};

/**
 * Grade chip for A+/A/B/C/D. No data (null/undefined grade) shows a grey
 * "No activity yet" chip instead of a misleading low grade.
 */
export function GradeChip({
  grade,
  points,
  className,
}: {
  grade: string | null | undefined;
  /** Total points out of 100, shown after the grade. */
  points?: number | null;
  className?: string;
}) {
  if (!grade) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-label font-medium text-muted-foreground",
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
        No activity yet
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label font-semibold tabular-nums",
        GRADE_CLASS[grade] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {grade}
      {points !== null && points !== undefined ? <span className="font-medium opacity-80">· {points}</span> : null}
    </span>
  );
}
