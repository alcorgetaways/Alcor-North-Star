import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { currency, weekLabel } from "@/lib/kpi";

export type CplPoint = { week_start: string; cost_per_lead: number | null };

type Props = {
  title?: string;
  points: CplPoint[];
  /** how many most recent weeks to plot */
  limit?: number;
};

/**
 * Cost per lead trend — the key performance-marketing metric.
 * Lower is better, so a falling line is shown as positive.
 */
export function CplTrendChart({ title = "Cost per lead trend", points, limit = 12 }: Props) {
  const data = useMemo(() => {
    const sorted = [...points]
      .filter((p) => p.cost_per_lead != null && Number(p.cost_per_lead) > 0)
      .sort((a, b) => a.week_start.localeCompare(b.week_start));
    return sorted.slice(-limit).map((p) => ({
      week: weekLabel(p.week_start),
      cpl: Number(p.cost_per_lead),
    }));
  }, [points, limit]);

  if (data.length === 0) {
    return (
      <div className="card-surface px-5 py-10 text-center text-sm text-muted-foreground">
        Not enough data yet to chart the cost per lead trend.
      </div>
    );
  }

  const first = data[0]?.cpl ?? 0;
  const last = data[data.length - 1]?.cpl ?? 0;
  const deltaPct = first ? ((last - first) / first) * 100 : 0;
  const improving = deltaPct < -0.5;
  const worsening = deltaPct > 0.5;
  const Icon = improving ? ArrowDownRight : worsening ? ArrowUpRight : Minus;
  const toneClass = improving
    ? "text-success"
    : worsening
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div className="card-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4">
        <div>
          <h3 className="text-card-title font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            Last {data.length} week{data.length === 1 ? "" : "s"} · lower is better
          </p>
        </div>
        <div className="text-right">
          <p className="text-kpi font-semibold tabular-nums text-gold">{currency(last)}</p>
          <p className={`inline-flex items-center gap-1 text-xs ${toneClass}`}>
            <Icon className="h-3 w-3" />
            {Math.abs(deltaPct).toFixed(1)}% {improving ? "down" : worsening ? "up" : "flat"} vs{" "}
            {data[0]?.week}
          </p>
        </div>
      </div>
      <div className="h-56 w-full px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="cplFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--gold, 43 74% 52%))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--gold, 43 74% 52%))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-muted-foreground"
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-muted-foreground"
              tickFormatter={(v: number) => currency(v)}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number | string) => [currency(Number(v)), "Cost per lead"]}
            />
            <Area
              type="monotone"
              dataKey="cpl"
              stroke="currentColor"
              className="text-gold"
              strokeWidth={2}
              fill="url(#cplFill)"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
