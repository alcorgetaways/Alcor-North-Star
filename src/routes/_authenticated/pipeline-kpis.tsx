import { AllKpis, MainKpis } from "@/components/MainKpis";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { DEFAULT_PIPELINE_CODE } from "@/lib/access";
import { ConfirmButton } from "@/components/ConfirmButton";
import { parseMetrics, firstMetricError } from "@/lib/form-rules";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { SegmentedPill } from "@/components/SegmentedPill";
import { PipelineBaselines } from "@/components/PipelineBaselines";
import { demoIn } from "@/lib/demo";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { HelpPanel } from "@/components/HelpPanel";
import { DataTable } from "@/components/DataTable";
import { DepartmentScorecards } from "@/components/DepartmentScorecards";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthKey, monthLabel, monthOptions } from "@/lib/kpi";
import {
  FORM_PIPELINE_BLURB,
  FORM_PIPELINE_CODES,
  formatMetric,
  metricValue,
  type MetricField,
  type PipelineKpiEntry,
} from "@/lib/pipeline-kpis";
import { changePct } from "@/lib/social";

export const Route = createFileRoute("/_authenticated/pipeline-kpis")({
  validateSearch: (s: Record<string, unknown>) => ({ code: String(s["code"] ?? DEFAULT_PIPELINE_CODE) }),
  head: () => ({
    meta: [
      { title: "Pipeline KPIs — Alcor North Star" },
      { name: "description", content: "Log monthly KPIs for assigned hotels and submit for management approval." },
      { property: "og:title", content: "Pipeline KPIs — Alcor North Star" },
      { property: "og:description", content: "Monthly pipeline KPI tracking for assigned hotels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PipelineKpis,
});

type Assignment = {
  id: string;
  client_id: string;
  clients: { hotel_name: string; city: string | null } | null;
};

type Def = {
  id: string;
  name: string;
  definition: string | null;
  unit: string | null;
  source_key: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
};

/** Field definition built from a KPI definition row. */
function fieldFromDef(d: Def): MetricField & { definition: string | null } {
  return {
    key: (d.source_key ?? "").replace(/^pke\./, ""),
    label: d.name,
    definition: d.definition,
    suffix: d.unit === "%" ? "%" : d.unit === "minutes" ? " min" : undefined,
  };
}

function PipelineKpis() {
  const { code } = Route.useSearch();
  const [month, setMonth] = useState(monthKey());
  if (code !== "business_development" && code !== "corporate_comms") return <HotelPipelineKpis />;
  return <div className="space-y-6"><PageHeader title={code === "business_development" ? "Business Development" : "Corporate Design and Communication"} actions={<Input type="month" aria-label="Scorecard month" className="w-44" value={month.slice(0, 7)} onChange={(e) => { if (e.target.value) setMonth(`${e.target.value}-01`); }} />} />{code === "corporate_comms" ? <CorporateHotelKpis month={month}/> : null}<DepartmentScorecards month={month} code={code} /><MonthlyActivityPlans code={code} /></div>;
}

function CorporateHotelKpis({month}:{month:string}) {
  const [selected,setSelected]=useState("");
  const {data=[]}=useQuery({queryKey:["corporate-main-hotels"],queryFn:async()=>{const {data,error}=await supabase.from("client_pipelines").select("id,clients(hotel_name),pipelines!inner(code)").eq("pipelines.code","corporate_comms").neq("status","ended").not("client_id","in",demoIn());if(error)throw error;return data;}});
  const cp=data.some((p)=>p.id===selected)?selected:data[0]?.id??"";
  return <section className="space-y-4"><Select value={cp} onValueChange={setSelected}><SelectTrigger aria-label="Corporate communication hotel"><SelectValue placeholder="Hotel"/></SelectTrigger><SelectContent>{data.map((p)=><SelectItem key={p.id} value={p.id}>{p.clients?.hotel_name}</SelectItem>)}</SelectContent></Select>{cp?<><MainKpis clientPipelineId={cp} month={month}/><h2 className="text-section-title font-semibold">All KPIs</h2><AllKpis clientPipelineId={cp} month={month}/></>:null}</section>;
}

function HotelPipelineKpis() {
  const { code } = Route.useSearch();
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [clientPipelineId, setClientPipelineId] = useState("");
  const [month, setMonth] = useState(monthKey());
  const [form, setForm] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const { data: formPipelines = [] } = useQuery({
    queryKey: ["form-pipelines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, code")
        .in("code", [...FORM_PIPELINE_CODES])
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as Array<{ id: string; name: string; code: string }>;
    },
  });

  const activeCode = formPipelines.some((p) => p.code === code)
    ? code
    : (formPipelines[0]?.code ?? "email_marketing");
  const pipelineRow = formPipelines.find((p) => p.code === activeCode);
  const title = pipelineRow?.name ?? "Pipeline KPIs";
  const blurb =
    FORM_PIPELINE_BLURB[activeCode] ??
    "Log monthly KPIs for assigned hotels and submit for management approval.";

  const { data: assignments = [] } = useQuery({
    queryKey: ["pk-assignments", activeCode, user?.id, isManager],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const q = supabase
        .from("client_pipelines")
        .select("id, client_id, clients(hotel_name, city), pipelines!inner(name, code)").not("client_id", "in", demoIn())
        .eq("pipelines.code", activeCode);
      // QA-11: row-level access (can_view_pipeline: managers, pipeline members, assignments) decides the list.
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Assignment[]).sort((a, b) =>
        (a.clients?.hotel_name ?? "").localeCompare(b.clients?.hotel_name ?? ""),
      );
    },
  });

  useEffect(() => {
    // QA-05: switching pipeline drops a hotel row that belongs to the previous pipeline.
    if (!assignments.some((a) => a.id === clientPipelineId)) setClientPipelineId(assignments[0]?.id ?? "");
  }, [assignments, clientPipelineId]);

  const selected = assignments.find((a) => a.id === clientPipelineId);

  const { data: defs = [] } = useQuery({
    queryKey: ["pk-defs", pipelineRow?.id],
    enabled: Boolean(pipelineRow?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, definition, unit, source_key")
        .eq("pipeline_id", pipelineRow?.id ?? "")
        .eq("active", true)
        .like("source_key", "pke.%")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Def[];
    },
  });
  const fields = useMemo(() => defs.map(fieldFromDef), [defs]);

  const { data: entries = [] } = useQuery({
    queryKey: ["pk-entries", activeCode, clientPipelineId],
    enabled: Boolean(clientPipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_kpi_entries")
        .select("id, month, channel, metrics, notes, status, client_pipeline_id, client_id").not("client_id", "in", demoIn())
        .eq("client_pipeline_id", clientPipelineId)
        .order("month", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data as unknown as PipelineKpiEntry[];
    },
  });

  const existing = entries.find((e) => e.month === month);

  useEffect(() => {
    if (existing) {
      const f: Record<string, string> = {};
      fields.forEach((m) => (f[m.key] = String(metricValue(existing.metrics, m.key) ?? "")));
      setForm(f);
      setNotes(existing.notes ?? "");
    } else {
      setForm(Object.fromEntries(fields.map((m) => [m.key, ""])));
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, month, activeCode, defs.length]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a hotel first");
      const parsed = parseMetrics(form as Record<string, unknown>, fields.map((m) => m.key));
      if (!parsed.ok) throw new Error(firstMetricError(parsed.errors, Object.fromEntries(fields.map((m) => [m.key, m.label ?? m.key]))) ?? "Check the numbers");
      const metrics: Record<string, number | null> = parsed.values;
      // channel is the pipeline code from the database (e.g. "whatsapp")
      const { error } = await supabase.from("pipeline_kpi_entries").upsert(
        {
          client_id: selected.client_id,
          client_pipeline_id: selected.id,
          month,
          channel: activeCode,
          metrics,
          notes: notes || null,
          created_by: user?.id ?? null,
        },
        { onConflict: "client_pipeline_id,month,channel" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Numbers saved");
      qc.invalidateQueries({ queryKey: ["pk-entries", activeCode, clientPipelineId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Save the month first");
      const { error } = await supabase
        .from("pipeline_kpi_entries")
        .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Approved — the hotel can now see this month");
      qc.invalidateQueries({ queryKey: ["pk-entries", activeCode, clientPipelineId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byMonth = new Map(entries.map((e) => [e.month, e]));

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={blurb} />
      <HelpPanel
        title={activeCode === "website_seo" ? "How Website SEO KPIs work" : "How monthly KPIs work"}
        lines={
          activeCode === "website_seo"
            ? [
                "This page tracks the Website SEO work done each month for each hotel: blogs published, keywords ranking in Google's top 10, Search Console clicks and impressions, technical issues fixed, backlinks built and SEMrush site health.",
                "Pick the hotel and month, type in the numbers, add a note if something needs explaining, and press Save month.",
                "The hotel sees nothing until management approves the month; editing an approved month sends it back for approval.",
                "Targets for these KPIs are set on the KPI Targets page under the Website SEO tab — they never mix with GMB targets.",
                "The history table below shows each month with the change versus the previous month, so a red month is easy to spot.",
              ]
            : [
                "Pick the hotel and month, enter the numbers for each KPI and press Save month.",
                "The hotel sees a month only after management approves it; editing an approved month sends it back for approval.",
                "Targets are set on the KPI Targets page; the history table below shows month-on-month change.",
              ]
        }
      />
      <MonthlyActivityPlans code={activeCode} />
      <PipelineBaselines code={activeCode} pipelineId={clientPipelineId || undefined} />

      {formPipelines.length > 1 ? (
        <SegmentedPill
          ariaLabel="Pipeline"
          value={activeCode}
          items={formPipelines.map((p) => ({ value: p.code, label: p.name, to: "/pipeline-kpis", search: { code: p.code } }))}
        />
      ) : null}

      {assignments.length === 0 ? (
        <EmptyState
          title="No hotels assigned for this pipeline yet"
          description="BD assigns hotels during onboarding."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              <Select value={clientPipelineId} onValueChange={setClientPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a hotel" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.clients?.hotel_name}
                      {a.clients?.city ? ` · ${a.clients.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions(240).map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <MainKpis clientPipelineId={clientPipelineId} month={month} />
          <h2 className="text-section-title font-semibold">All KPIs</h2>
          <section className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section-title font-semibold">
                {selected?.clients?.hotel_name ?? "Hotel"} · {monthLabel(month)}
              </h2>
              {existing ? (
                <StatusBadge status={existing.status} label={STATUS_LABEL[existing.status] ?? existing.status} />
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((m) => (
                <div key={m.key} className="space-y-1.5">
                  <Label htmlFor={m.key}>
                    {m.label}
                    {m.direction === "lower_better" ? " (lower is better)" : ""}
                  </Label>
                  <Input
                    id={m.key}
                    inputMode="decimal"
                    value={form[m.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [m.key]: e.target.value })}
                  />
                  {m.definition ? (
                    <p className="text-label text-muted-foreground">{m.definition}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="pk-notes">Notes for management</Label>
              <Textarea id="pk-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ConfirmButton onConfirm={() => save.mutateAsync()} doneLabel="Saved" disabled={save.isPending}>
                {save.isPending ? "Saving…" : existing ? "Update month" : "Save month"}
              </ConfirmButton>
              {isManager && existing && existing.status !== "approved" ? (
                <ConfirmButton variant="outline" onConfirm={() => approve.mutateAsync()} doneLabel="Approved" disabled={approve.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve for client
                </ConfirmButton>
              ) : null}
            </div>
            <p className="mt-2 text-label text-muted-foreground">
              The hotel sees a month only after management approves it. Editing an approved month sends it back for approval.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title font-semibold">Monthly history</h2>
              <Badge variant="outline">{entries.length} months</Badge>
            </div>
            <DataTable<PipelineKpiEntry>
              rows={entries}
              rowKey={(e) => String(e.id)}
              emptyMessage="No months logged yet."
              columns={[
                { key: "month", header: "Month", render: (e) => <span className="font-medium">{monthLabel(e.month)}</span> },
                ...fields.map((m) => ({
                  key: m.key,
                  header: <div className="space-y-1"><span>{m.label}</span><div className="h-8 w-24"><ResponsiveContainer width="100%" height="100%"><LineChart data={entries.slice().reverse().map((e) => ({value: metricValue(e.metrics,m.key)}))}><Line dataKey="value" stroke="var(--gold)" dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></div>,
                  render: (e: PipelineKpiEntry) => {
                    const v = metricValue(e.metrics, m.key);
                    const prev = [...byMonth.values()]
                      .filter((x) => x.month < e.month)
                      .sort((a, b) => (a.month < b.month ? 1 : -1))[0];
                    const prevV = prev ? metricValue(prev.metrics, m.key) : null;
                    const g = changePct(v, prevV);
                    const good =
                      g === null ? null : m.direction === "lower_better" ? g <= 0 : g >= 0;
                    return (
                      <>
                        {formatMetric(v, m)}
                        {g !== null ? (
                          <span className={`ml-2 text-label ${good ? "text-success" : "text-destructive"}`}>
                            {g > 0 ? "+" : ""}
                            {g.toFixed(1)}%
                          </span>
                        ) : null}
                      </>
                    );
                  },
                })),
                {
                  key: "status",
                  header: "Status",
                  render: (e) => <StatusBadge status={e.status} label={STATUS_LABEL[e.status] ?? e.status} />,
                },
              ]}
            />
          </section>
        </>
      )}
    </div>
  );
}
