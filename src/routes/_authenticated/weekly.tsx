import { MainKpis } from "@/components/MainKpis";
import { ConfirmButton } from "@/components/ConfirmButton";
import { parseRequiredMetrics, firstMetricError } from "@/lib/form-rules";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { SegmentedPill } from "@/components/SegmentedPill";
import { demoIn } from "@/lib/demo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard, MetricGrid } from "@/components/MetricCard";
import { inr, int } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
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
import { currency, weekLabel, weekOptions, weekStart } from "@/lib/kpi";
import { CplTrendChart } from "@/components/CplTrendChart";

export const Route = createFileRoute("/_authenticated/weekly")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Weekly Performance KPIs — Alcor North Star" },
      {
        name: "description",
        content:
          "Log weekly ad spend, leads, cost per lead and live campaigns for every assigned performance marketing hotel.",
      },
      { property: "og:title", content: "Weekly Performance KPIs — Alcor North Star" },
      {
        property: "og:description",
        content: "Weekly performance marketing tracking for assigned hotels.",
      },
    ],
  }),
  component: WeeklyKpis,
});

type Assignment = {
  id: string;
  client_id: string;
  clients: { hotel_name: string; city: string | null } | null;
  pipelines: { name: string } | null;
};

type Entry = {
  id: string;
  week_start: string;
  channel: string;
  ad_spend: number;
  leads: number;
  campaigns_live: number;
  cost_per_lead: number | null;
  notes: string | null;
};

const EMPTY = { ad_spend: "", leads: "", campaigns_live: "", notes: "" };

const CHANNELS = [
  { value: "google", label: "Google Ads" },
  { value: "meta", label: "Meta Ads" },
] as const;

function WeeklyKpis() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [clientPipelineId, setClientPipelineId] = useState<string>("");
  const [week, setWeek] = useState<string>(weekStart());
  const [channel, setChannel] = useState<string>("google");
  const [form, setForm] = useState(EMPTY);


  const { data: assignments = [] } = useQuery({
    queryKey: ["weekly-assignments", user?.id, isManager],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const q = supabase
        .from("client_pipelines")
        .select("id, client_id, clients(hotel_name, city), pipelines!inner(name, code)").not("client_id", "in", demoIn())
        .eq("pipelines.code", "performance_marketing");
      // QA-11: row-level access (can_view_pipeline: managers, pipeline members, assignments) decides the list.
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Assignment[]).sort((a, b) =>
        (a.clients?.hotel_name ?? "").localeCompare(b.clients?.hotel_name ?? ""),
      );
    },
  });

  useEffect(() => {
    if (!clientPipelineId && assignments.length) setClientPipelineId(assignments[0]!.id);
  }, [assignments, clientPipelineId]);

  const selected = assignments.find((a) => a.id === clientPipelineId);

  const { data: allEntries = [] } = useQuery({
    queryKey: ["weekly-entries", clientPipelineId],
    enabled: Boolean(clientPipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_kpi_entries")
        .select("id, week_start, channel, ad_spend, leads, campaigns_live, cost_per_lead, notes").not("client_id", "in", demoIn())
        .eq("client_pipeline_id", clientPipelineId)
        .order("week_start", { ascending: false })
        .limit(52);
      if (error) throw error;
      return data as unknown as Entry[];
    },
  });

  const entries = allEntries.filter((e) => (e.channel ?? "google") === channel);
  const existing = entries.find((e) => e.week_start === week);

  useEffect(() => {
    setForm(
      existing
        ? {
            ad_spend: String(existing.ad_spend ?? ""),
            leads: String(existing.leads ?? ""),
            campaigns_live: String(existing.campaigns_live ?? ""),
            notes: existing.notes ?? "",
          }
        : EMPTY,
    );
  }, [existing, week, clientPipelineId, channel]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a hotel first");
      const parsed = parseRequiredMetrics(form as Record<string, unknown>, ["ad_spend", "leads", "campaigns_live"] as const);
      if (!parsed.ok) throw new Error(firstMetricError(parsed.errors, { ad_spend: "Ad spend", leads: "Leads", campaigns_live: "Campaigns live" }) ?? "Check the numbers");
      const { error } = await supabase.from("weekly_kpi_entries").upsert(
        {
          ...parsed.values,
          client_id: selected.client_id,
          client_pipeline_id: selected.id,
          week_start: week,
          channel,
          notes: form.notes || null,
          created_by: user?.id ?? null,
        },
        { onConflict: "client_pipeline_id,week_start,channel" },
      );
      if (error) throw error;

    },
    onSuccess: () => {
      toast.success("Weekly numbers saved");
      void qc.invalidateQueries({ queryKey: ["weekly-entries", clientPipelineId] });
      void qc.invalidateQueries({ queryKey: ["weekly-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const spend = Number(form.ad_spend || 0);
  const leads = Number(form.leads || 0);
  const cpl = leads > 0 ? spend / leads : null;

  return (
    <div className="min-w-0 space-y-8 overflow-x-hidden">
      <PageHeader
        title="Weekly Performance KPIs"
        description="Log ad spend, leads, cost per lead and live campaigns each week for the hotels assigned to you. Saved numbers appear instantly on the management and client dashboards."
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="No performance marketing hotels assigned yet"
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
              <Label>Week</Label>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions().map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <MainKpis clientPipelineId={clientPipelineId} month={`${week.slice(0,7)}-01`} />
          <h2 className="text-section-title font-semibold">All KPIs</h2>
          <SegmentedPill ariaLabel="Advertising channel" items={CHANNELS.map(({ value, label }) => ({ value, label }))} value={channel} onChange={setChannel} />

          <section className="card-surface p-5">
            <h2 className="text-section-title font-semibold">
              {CHANNELS.find((c) => c.value === channel)?.label} · {existing ? "Update" : "Add"} week
              of {weekLabel(week)}
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="spend">Total ad spend (₹)</Label>
                <Input
                  id="spend"
                  inputMode="decimal"
                  value={form.ad_spend}
                  onChange={(e) => setForm({ ...form, ad_spend: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leads">Leads received</Label>
                <Input
                  id="leads"
                  inputMode="numeric"
                  value={form.leads}
                  onChange={(e) => setForm({ ...form, leads: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cost per lead</Label>
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                  {cpl === null ? "—" : currency(cpl)}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camps">Campaigns live</Label>
                <Input
                  id="camps"
                  inputMode="numeric"
                  value={form.campaigns_live}
                  onChange={(e) => setForm({ ...form, campaigns_live: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="notes">Notes for management</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <ConfirmButton className="mt-4" onConfirm={() => save.mutateAsync()} doneLabel="Saved" disabled={save.isPending}>
              {save.isPending ? "Saving…" : existing ? "Update week" : "Save week"}
            </ConfirmButton>
          </section>

          <MetricGrid>
            <MetricCard label="Spend this week" value={existing?.ad_spend ?? spend} format={inr} />
            <MetricCard label="Leads" value={existing?.leads ?? leads} format={int} />
            <MetricCard label="Cost per lead" value={existing?.cost_per_lead ?? cpl} format={inr} tone="gold" />
            <MetricCard label="Campaigns live" value={existing?.campaigns_live ?? Number(form.campaigns_live || 0)} format={int} />
          </MetricGrid>

          <CplTrendChart
            title={`Cost per lead trend · ${CHANNELS.find((c) => c.value === channel)?.label}`}
            points={entries}
          />

          <section className="space-y-4">
            <h2 className="text-section-title font-semibold">
              Week history · {CHANNELS.find((c) => c.value === channel)?.label}
            </h2>
            <DataTable<Entry>
              rows={entries}
              rowKey={(e) => e.id}
              emptyMessage="No weekly data logged yet."
              columns={[
                { key: "week", header: "Week", render: (e) => weekLabel(e.week_start) },
                { key: "spend", header: "Ad spend", align: "right", render: (e) => currency(e.ad_spend) },
                { key: "leads", header: "Leads", align: "right", render: (e) => e.leads },
                { key: "cpl", header: "Cost / lead", align: "right", render: (e) => currency(e.cost_per_lead) },
                { key: "campaigns", header: "Campaigns", align: "right", render: (e) => e.campaigns_live },
                { key: "notes", header: "Notes", render: (e) => <span className="text-muted-foreground">{e.notes ?? "—"}</span> },
              ]}
            />
          </section>
        </>
      )}
      <MonthlyActivityPlans code="performance_marketing" />
    </div>
  );
}
