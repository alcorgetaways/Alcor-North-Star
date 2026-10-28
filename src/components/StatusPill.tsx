import { cn } from "@/lib/utils";
import { kpiStatus, STATUS_CLASS, STATUS_DOT, STATUS_LABEL, type KpiStatus } from "@/lib/kpi";

/**
 * KPI attainment pill (percent + attainment label). Visual style matches the
 * shared StatusBadge; the status logic stays in @/lib/kpi.
 */
export function StatusPill({
  value,
  showValue = true,
  className,
}: {
  value: number | null | undefined;
  showValue?: boolean;
  className?: string;
}) {
  const status: KpiStatus = kpiStatus(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label font-medium whitespace-nowrap",
        STATUS_CLASS[status],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
      {showValue && value !== null && value !== undefined ? (
        <span className="tabular-nums">{Number(value).toFixed(0)}%</span>
      ) : (
        STATUS_LABEL[status]
      )}
      {showValue && value !== null && value !== undefined ? (
        <span className="opacity-70">· {STATUS_LABEL[status]}</span>
      ) : null}
    </span>
  );
}
