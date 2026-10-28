import type { LucideIcon } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";

/**
 * @deprecated Use KpiCard/KpiStrip directly. Kept as a thin alias so existing
 * pages get the standard KPI styling.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "gold" | "success" | "warning" | "danger";
}) {
  return (
    <KpiCard
      label={label}
      value={value}
      tone={tone}
      {...(hint !== undefined ? { hint } : {})}
      {...(icon !== undefined ? { icon } : {})}
    />
  );
}
