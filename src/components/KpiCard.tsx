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
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { direction: "up" | "down"; text: string };
  icon?: LucideIcon;
  tone?: "default" | "gold" | "success" | "warning" | "danger";
  compact?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    gold: "text-gold",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];

  return (
    <div className={cn("card-surface", compact ? "p-4" : "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-label-muted", compact && "text-xs")}>{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0 opacity-60", toneClass)} strokeWidth={1.75} /> : null}
      </div>
      <div className={cn("flex items-baseline gap-2", compact ? "mt-2" : "mt-3")}>
        <p className={cn("font-semibold tabular-nums leading-tight break-words", compact ? "text-xl" : "text-[1.75rem]", toneClass)}>{value}</p>
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
      {hint ? <p className={cn("text-label text-muted-foreground", compact ? "mt-1" : "mt-2")}>{hint}</p> : null}
    </div>
  );
}

export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>{children}</div>
  );
}
