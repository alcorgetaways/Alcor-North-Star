import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KPI card: small muted label, 28/32 semibold tabular number, optional delta
 * badge (▲ green / ▼ red) and hint. Use inside KpiStrip (2–4 per row).
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { direction: "up" | "down"; text: string };
  icon?: LucideIcon;
  tone?: "default" | "gold" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    gold: "text-gold",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];

  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label-muted">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0 opacity-60", toneClass)} strokeWidth={1.75} /> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className={cn("text-[1.75rem] font-semibold tabular-nums leading-tight break-words", toneClass)}>{value}</p>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-label font-medium",
              delta.direction === "up" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {delta.direction === "up" ? "▲" : "▼"} {delta.text}
            <span className="font-normal text-muted-foreground">vs last month</span>
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-2 text-label text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>{children}</div>
  );
}
