import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inr, int } from "@/lib/format";
import { weekLabel } from "@/lib/kpi";

type Week = { week_start: string; leads: number; cost_per_lead: number | null };

/** Weekly leads (bars) with cost per lead (line). Same approved weekly rows as before. */
export function OwnerAdsChart({ weeks, limit = 12 }: { weeks: Week[]; limit?: number }) {
  const data = useMemo(
    () =>
      [...weeks]
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .slice(-limit)
        .map((w) => ({
          week: weekLabel(w.week_start).split(" – ")[0],
          leads: Number(w.leads || 0),
          cpl: w.cost_per_lead != null && Number(w.cost_per_lead) > 0 ? Number(w.cost_per_lead) : null,
        })),
    [weeks, limit],
  );
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => inr(v)} />
          <Tooltip
            formatter={(v: number, name: string) => (name === "Cost / lead" ? inr(v) : int(v))}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="l" dataKey="leads" name="Leads" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="c" dataKey="cpl" name="Cost / lead" stroke="var(--gold)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
