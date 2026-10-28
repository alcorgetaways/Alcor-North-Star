import { todayIST } from "@/lib/launch";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency, monthLabel, monthOptions, monthKey, previousMonthKey } from "@/lib/kpi";
import { fyOf } from "@/lib/bookings-import";
import { useAuth } from "@/hooks/useAuth";
import { DataTable } from "@/components/DataTable";
import { ProgressRing } from "@/components/ProgressRing";
import { inr, inrShort } from "@/lib/format";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as RTooltip } from "recharts";

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "On hold since <date>" banner + Resume for AM/management. Pauses tasks, KPI entry, reports, scores and reminders. */
export function OnHoldBanner({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const { data: held } = useQuery({
    queryKey: ["on-hold-launch", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id, on_hold_since, on_hold_reason, status")
        .eq("client_id", clientId)
        .eq("status", "on_hold")
        .limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
  });
  const resume = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("resume_launch", { _launch_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Launch resumed — open task dates moved by the time on hold");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!held) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
      <div className="flex items-start gap-3">
        <PauseCircle className="mt-0.5 h-5 w-5 text-warning-foreground" />
        <div>
          <p className="font-medium">On hold since {fmtDate(held.on_hold_since) ?? "— date not recorded"}</p>
          <p className="text-muted-foreground">
            Task due dates, escalations, KPI entry, monthly reports, scores and reminders are paused.
            {held.on_hold_reason ? ` Reason: ${held.on_hold_reason}` : ""}
          </p>
        </div>
      </div>
      {isManager ? (
        <Button size="sm" variant="outline" disabled={resume.isPending} onClick={() => resume.mutate(held.id)}>
          Resume launch
        </Button>
      ) : null}
    </div>
  );
}

/** Put an open launch on hold (AM or management). */
export function HoldLaunchButton({ launchId, status }: { launchId: string; status: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const hold = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("hold_launch", { _launch_id: launchId, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Launch is on hold");
      setOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!["draft", "awaiting_day0", "active", "live"].includes(status)) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Put on hold</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put this launch on hold</DialogTitle>
            <DialogDescription>
              Everything pauses: no task due dates or escalations, no KPI entry, no monthly reports, no score and no reminders.
              Resuming continues from where it stopped — open task dates move forward by the days on hold.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button disabled={!reason.trim() || hold.isPending} onClick={() => hold.mutate()}>Put on hold</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

type GoalProgress = {
  fy: number;
  yearly_goal: number | null;
  achieved: number | null;
  months: Array<{ month: string; goal: number | null; achieved: number; pct: number | null }>;
};

/** Owner's yearly revenue goal vs booked revenue (bookings ledger, by stay month). Staff with sales access only. */
export function PropertyGoalCard({ clientId, inactive }: { clientId: string; inactive: boolean }) {
  const fy = fyOf(todayIST());
  const { data } = useQuery({
    queryKey: ["property-goal", clientId, fy],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("property_goal_progress", { _client_id: clientId, _fy: fy });
      if (error) throw error;
      return data as unknown as GoalProgress;
    },
  });
  if (!data || data.yearly_goal == null) return null;
  const cur = data.months.find((m) => m.month === monthKey()) ?? null;
  const yPct = data.yearly_goal ? Math.round(((data.achieved ?? 0) / data.yearly_goal) * 1000) / 10 : null;
  return (
    <div className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-section-title font-semibold">Owner revenue goal · FY {fy}-{String(fy + 1).slice(2)}</p>
        {inactive ? <Badge variant="secondary">Inactive client — goal kept for reference</Badge> : null}
      </div>
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
        <ProgressRing size="large" value={data.achieved ?? 0} goal={data.yearly_goal} caption="of yearly goal" label="of yearly goal" />
        <div className="flex-1 text-center sm:text-left">
          <p className="font-display text-5xl font-semibold tabular-nums leading-none">{yPct == null ? "—" : `${yPct}%`}</p>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">of yearly goal</p>
          <p className="mt-3 text-[0.875rem] tabular-nums">
            {inr(data.achieved ?? 0)} booked of {inr(data.yearly_goal)} · This month's goal {cur ? inr(cur.goal) : "—"}
          </p>
        </div>
      </div>
      <div className="mt-5 h-60" role="img" aria-label="Monthly booked revenue against the monthly goal">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.months.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis tickFormatter={(v) => inrShort(Number(v))} stroke="var(--muted-foreground)" fontSize={11} width={56} />
            <RTooltip formatter={(v) => inr(Number(v))} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            <Bar dataKey="achieved" name="Booked" fill="var(--gold)" radius={[4, 4, 0, 0]} />
            <Line dataKey="goal" name="Goal" stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground">Show table</summary>
        <DataTable
          className="mt-2 rounded-none border-0 bg-transparent shadow-none"
          rows={data.months}
          rowKey={(m) => m.month}
          columns={[
            { key: "month", header: "Month", render: (m) => monthLabel(m.month) },
            { key: "goal", header: "Goal", align: "right", render: (m) => currency(m.goal) },
            { key: "booked", header: "Booked", align: "right", render: (m) => (m.achieved ? currency(m.achieved) : "—") },
            { key: "pct", header: "%", align: "right", render: (m) => (m.pct == null ? "—" : `${m.pct}%`) },
          ]}
        />
      </details>

      <p className="mt-2 text-xs text-muted-foreground">Monthly goals default to yearly ÷ 12 and can be edited on Sales &amp; Bookings. Not part of team scorecards.</p>
    </div>
  );
}

type Rollup = {
  month: string;
  brand_score: number | null;
  properties: Array<{ id: string; name: string; code: string | null; score: number | null; pipelines: number }>;
  kpis: Array<{ pipeline: string; kpi: string; unit: string | null; rate: boolean; actual: number | null; target: number | null; properties: number }>;
};

/** Brand view: KPIs per property, rolled up to the brand (sum, or average for rates). */
export function BrandRollupCard({ clientId }: { clientId: string }) {
  const [month, setMonth] = useState(previousMonthKey(monthKey()));
  const { data: kids = [] } = useQuery({
    queryKey: ["brand-kids", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id").eq("parent_client_id", clientId);
      if (error) throw error;
      return data;
    },
  });
  const { data } = useQuery({
    queryKey: ["brand-rollup", clientId, month],
    enabled: kids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("brand_rollup", { _parent: clientId, _month: month });
      if (error) throw error;
      return data as unknown as Rollup;
    },
  });
  if (!kids.length) return null;
  const fmt = (v: number | null, unit: string | null) =>
    v == null ? "—" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit === "%" ? "%" : ""}`;
  return (
    <div className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-section-title font-semibold">Brand roll-up · {kids.length} properties</p>
          <p className="text-xs text-muted-foreground">Brand totals = sum of the properties (average for rates and times). Submitted and approved reports only.</p>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{monthOptions(12).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DataTable
          className="rounded-none border-0 bg-transparent shadow-none"
          rows={[...(data?.properties ?? []).map((p) => ({ id: p.id, name: p.name, code: p.code, score: p.score, brand: false })), { id: "brand", name: "Brand", code: null as string | null, score: data?.brand_score ?? null, brand: true }]}
          rowKey={(p) => p.id}
          emptyMessage="No submitted property reports yet."
          columns={[
            {
              key: "property",
              header: "Property",
              render: (p) => (
                <span className={p.brand ? "font-medium" : ""}>
                  {p.code ? <span className="mr-2 text-label text-muted-foreground">{p.code}</span> : null}{p.name}
                </span>
              ),
            },
            { key: "score", header: "Score", align: "right", render: (p) => <span className={p.brand ? "font-medium" : ""}>{p.score == null ? "Not scored" : `${p.score}%`}</span> },
          ]}
        />
        <DataTable
          className="rounded-none border-0 bg-transparent shadow-none"
          rows={data?.kpis ?? []}
          rowKey={(k) => `${k.pipeline}-${k.kpi}`}
          emptyMessage={`No submitted property reports for ${monthLabel(month)}.`}
          columns={[
            {
              key: "kpi",
              header: "KPI (brand)",
              render: (k) => (
                <>
                  <span className="block text-label text-muted-foreground">{k.pipeline} · {k.properties} propert{k.properties === 1 ? "y" : "ies"}{k.rate ? " · average" : ""}</span>
                  {k.kpi}
                </>
              ),
            },
            { key: "actual", header: "Actual", align: "right", render: (k) => fmt(k.actual, k.unit) },
            { key: "target", header: "Target", align: "right", render: (k) => fmt(k.target, k.unit) },
          ]}
        />
      </div>
    </div>
  );
}

/** Past monthly report history imported from the BD tracker (status only, no KPI values). */
export function ReportHistoryCard({ clientId }: { clientId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["report-history", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_history").select("month, status, source").eq("client_id", clientId).order("month");
      if (error) throw error;
      return data;
    },
  });
  if (!data.length) return null;
  return (
    <div className="card-surface p-5 text-sm">
      <p className="text-section-title font-semibold">Earlier report history</p>
      <p className="text-xs text-muted-foreground">{data[0]!.source} — submitted (imported), no KPI values.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.map((r) => <Badge key={r.month} variant="secondary">{monthLabel(r.month)} · submitted (imported)</Badge>)}
      </div>
    </div>
  );
}
