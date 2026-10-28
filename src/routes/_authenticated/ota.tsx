import { MainKpis } from "@/components/MainKpis";
import { ConfirmButton } from "@/components/ConfirmButton";
import { allOtasRow } from "@/lib/form-rules";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { parseMetrics, parseRequiredMetrics, firstMetricError } from "@/lib/form-rules";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { demoIn } from "@/lib/demo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
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
import { OTA_FIELDS, formatMetric, metricValue, type OtaRecord } from "@/lib/pipeline-kpis";
import { changePct } from "@/lib/social";

const OTA_NUM_KEYS = ["live_channels", "new_channels", "active_channels", "ranking", "content_score", "conversion_rate", "reputation_score", "bookings", "revenue"] as const;

export const Route = createFileRoute("/_authenticated/ota")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "OTA Management KPIs — Alcor North Star" },
      {
        name: "description",
        content:
          "Log monthly OTA channels, ranking, content score, conversion, reputation, bookings and revenue for every assigned hotel.",
      },
      { property: "og:title", content: "OTA Management KPIs — Alcor North Star" },
      { property: "og:description", content: "Monthly OTA performance tracking for assigned hotels." },
    ],
  }),
  component: OtaKpis,
});

type Assignment = {
  id: string;
  client_id: string;
  clients: { hotel_name: string; city: string | null } | null;
};

const EMPTY = {
  live_channels: "",
  new_channels: "",
  active_channels: "",
  ranking: "",
  content_score: "",
  conversion_rate: "",
  reputation_score: "",
  bookings: "",
  revenue: "",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
};

function OtaKpis() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [clientPipelineId, setClientPipelineId] = useState("");
  const [month, setMonth] = useState(monthKey());
  const [form, setForm] = useState<typeof EMPTY & { [k: string]: string }>(EMPTY);
  const [notes, setNotes] = useState("");

  const { data: assignments = [] } = useQuery({
    queryKey: ["ota-assignments", user?.id, isManager],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const q = supabase
        .from("client_pipelines")
        .select("id, client_id, clients(hotel_name, city), pipelines!inner(name, code)").not("client_id", "in", demoIn())
        .eq("pipelines.code", "ota");
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

  const { data: entries = [] } = useQuery({
    queryKey: ["ota-entries", clientPipelineId],
    enabled: Boolean(clientPipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ota_records")
        .select(
          "id, month, ota_name, live_channels, new_channels, active_channels, ranking, content_score, conversion_rate, reputation_score, bookings, revenue, notes, status",
        ).not("client_id", "in", demoIn())
        .eq("client_pipeline_id", clientPipelineId)
        .order("month", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        month: (r as unknown as { month: string }).month,
      })) as unknown as OtaRecord[];
    },
  });

  const existing = allOtasRow(entries, month);

  useEffect(() => {
    if (existing) {
      setForm({
        ...EMPTY,
        ...Object.fromEntries(OTA_FIELDS.map((m) => [m.key, String(metricValue(existing as never, m.key) ?? "")])),
      });
      setNotes(existing.notes ?? "");
    } else {
      setForm({ ...EMPTY });
      setNotes("");
    }
  }, [existing, month, clientPipelineId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a hotel first");
      const req = parseRequiredMetrics(form as Record<string, unknown>, ["live_channels", "new_channels", "active_channels"] as const);
      const opt = parseMetrics(form as Record<string, unknown>, OTA_NUM_KEYS.filter((k) => !k.endsWith("_channels")));
      const parsed = { values: { ...opt.values, ...req.values } };
      const err = firstMetricError({ ...opt.errors, ...req.errors });
      if (err) throw new Error(err);
      const row = {
        ...parsed.values,
        client_id: selected.client_id,
        client_pipeline_id: selected.id,
        month,
        ota_name: "All OTAs",
        notes: notes || null,
        created_by: user?.id ?? null,
      };
      const { error } = await supabase
        .from("ota_records")
        .upsert(row, { onConflict: "client_pipeline_id,month,ota_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("OTA numbers saved");
      qc.invalidateQueries({ queryKey: ["ota-entries", clientPipelineId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Save the month first");
      const { error } = await supabase
        .from("ota_records")
        .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Approved — the hotel can now see this month");
      qc.invalidateQueries({ queryKey: ["ota-entries", clientPipelineId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prev = (m: string) =>
    [...entries].filter((e) => e.month < m).sort((a, b) => (a.month < b.month ? 1 : -1))[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="OTA Management KPIs"
        description="Log live, new and active channels, ranking, content score, conversion, reputation, bookings and revenue each month. Clients see a month only after management approves it."
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="No OTA hotels assigned yet"
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
                  {monthOptions().map((m) => (
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
              {OTA_FIELDS.map((m) => (
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
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="ota-notes">Notes for management</Label>
              <Textarea id="ota-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ConfirmButton doneLabel="Saved" onConfirm={() => save.mutateAsync()} disabled={save.isPending}>
                {existing ? "Update month" : "Save month"}
              </ConfirmButton>
              {isManager && existing && existing.status !== "approved" ? (
                <ConfirmButton doneLabel="Approved" variant="outline" onConfirm={() => approve.mutateAsync()} disabled={approve.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve for client
                </ConfirmButton>
              ) : null}
            </div>
            <p className="mt-2 text-label text-muted-foreground">
              The hotel sees a month only after management approves it.
            </p>
          </section>

          <section className="space-y-3 border-y border-border py-5"><h2 className="text-section-title font-semibold">Bookings and revenue</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={entries.filter((e) => e.ota_name === "All OTAs").slice().reverse().map((e) => ({ ...e, label: monthLabel(e.month) }))}><XAxis dataKey="label" tick={{fontSize:11}} /><YAxis yAxisId="bookings" width={42} /><YAxis yAxisId="revenue" orientation="right" width={64} /><Tooltip /><Bar yAxisId="bookings" dataKey="bookings" name="Bookings" fill="var(--primary)" isAnimationActive={false} /><Line yAxisId="revenue" dataKey="revenue" name="Revenue ₹" stroke="var(--gold)" dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></section>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title font-semibold">Monthly history</h2>
              <Badge variant="outline">{entries.length} months</Badge>
            </div>
            <DataTable<OtaRecord>
              rows={entries}
              rowKey={(e) => String(e.id)}
              emptyMessage="No months logged yet."
              columns={[
                { key: "month", header: "Month", render: (e) => <span className="font-medium">{monthLabel(e.month)}</span> },
                ...OTA_FIELDS.map((m) => ({
                  key: m.key,
                  header: m.label,
                  render: (e: OtaRecord) => {
                    const v = metricValue(e as never, m.key);
                    const p = prev(e.month);
                    const pv = p ? metricValue(p as never, m.key) : null;
                    const g = changePct(v, pv);
                    const good = g === null ? null : m.direction === "lower_better" ? g <= 0 : g >= 0;
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
      <MonthlyActivityPlans code="ota" />
    </div>
  );
}
