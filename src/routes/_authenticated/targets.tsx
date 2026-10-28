import { parseMetric, targetRowsToSave } from "@/lib/form-rules";
import { useMemo, useState } from "react";
import { SegmentedPill } from "@/components/SegmentedPill";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard, MetricGrid } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/DataTable";
import { DepartmentScorecards } from "@/components/DepartmentScorecards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { monthKey, monthLabel } from "@/lib/kpi";

export const Route = createFileRoute("/_authenticated/targets")({
  validateSearch: (search: Record<string, unknown>): { pipeline?: string } => {
    const p = search["pipeline"];
    return typeof p === "string" && p.trim() ? { pipeline: p.trim() } : {};
  },
  head: () => ({
    meta: [
      { title: "KPI Targets — Alcor North Star" },
      { name: "description", content: "Pipeline heads propose next month's KPI targets; management approves them." },
      { property: "og:title", content: "KPI Targets — Alcor North Star" },
      { property: "og:description", content: "Monthly KPI target proposals and the management approval queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TargetsPage,
});

type Row = {
  client_pipeline_id: string; client_id: string; hotel_name: string; client_code: string | null;
  pipeline_code: string; pipeline_name: string; kpi_definition_id: string; kpi_name: string; unit: string | null;
  direction: string; prev_actual: number | null; suggested: number | null; target_id: string | null;
  target: number | null; status: string | null; baseline: boolean;
};

function addMonths(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y!, mo! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
const fmt = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const key = (r: Row) => `${r.client_pipeline_id}:${r.kpi_definition_id}`;

function TargetsPage() {
  const { isManager } = useAuth();
  const { pipeline } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const next = addMonths(monthKey(), 1);
  const [month, setMonth] = useState(next);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["targets-due", month],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("targets_due", { _month: month });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const pipelines = useMemo(() => {
    const distinct = new Map<string, { code: string; name: string }>();
    for (const row of rows) distinct.set(row.pipeline_code, { code: row.pipeline_code, name: row.pipeline_name });
    return [...distinct.values()];
  }, [rows]);

  const selectedPipeline =
    pipelines.find((item) => item.code === pipeline)?.code ??
    pipelines.find((item) => item.code === "gbp")?.code ??
    pipelines[0]?.code;

  const scopedRows = useMemo(
    () => rows.filter((row) => row.pipeline_code === selectedPipeline),
    [rows, selectedPipeline],
  );

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of scopedRows) m.set(r.client_pipeline_id, [...(m.get(r.client_pipeline_id) ?? []), r]);
    return [...m.values()];
  }, [scopedRows]);
  const queue = scopedRows.filter((r) => r.status === "provisional" && r.target_id);
  const due = scopedRows.filter((r) => !r.target_id && !r.baseline).length;
  const pickedInQueue = queue.filter((r) => picked.has(r.target_id!)).map((r) => r.target_id!);

  const save = useMutation({
    mutationFn: async (list: Row[]) => {
      // QA-17: only rows the user edited are saved (untouched suggestions stay unsaved); 0 needs an explicit yes.
      const editable = list.filter((r) => !r.baseline && (isManager || r.status !== "approved"));
      const zeros = editable.filter((r) => edits[key(r)] !== undefined && parseMetric(edits[key(r)]).value === 0).length;
      const zeroOk = zeros > 0 && window.confirm(`${zeros} target(s) set to 0. A 0 target is scored (any result meets it). Save them as 0?`);
      const { save: rows, errors } = targetRowsToSave(
        editable.map((r) => ({ id: key(r), value: edits[key(r)] ?? "", touched: edits[key(r)] !== undefined, zeroConfirmed: zeroOk })),
      );
      const firstErr = Object.values(errors)[0];
      if (firstErr) throw new Error(`Check the targets: ${firstErr}`);
      const byKey = new Map(editable.map((r) => [key(r), r]));
      const payload = rows.map(({ id, value }) => {
        const r = byKey.get(id)!;
        return {
          client_pipeline_id: r.client_pipeline_id, kpi_definition_id: r.kpi_definition_id, month,
          target: value, suggested: r.suggested, status: isManager ? "approved" : "provisional",
        };
      });
      if (!payload.length) throw new Error("Nothing to save — type a target first");
      const { error } = await supabase.from("client_kpi_targets").upsert(payload, { onConflict: "client_pipeline_id,kpi_definition_id,month" });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(isManager ? `${n} target(s) saved as approved` : `${n} target(s) proposed — provisional until management approves`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["targets-due", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("approve_kpi_targets", { _ids: ids });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`${n} target(s) approved`);
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["targets-due", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Targets"
        description="Pipeline heads propose targets for their hotels; management approves and can edit any target. Suggested values: last month's actual + 10% (higher is better) or the same as last month (lower is better). A hotel or pipeline with no previous actual is a baseline month — no target, not scored."
        actions={
          <Select value={month} onValueChange={(v) => { setMonth(v); setEdits({}); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[-1, 0, 1, 2].map((n) => addMonths(monthKey(), n)).map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      {selectedPipeline ? (
        <SegmentedPill
          ariaLabel="Pipeline"
          value={selectedPipeline}
          items={pipelines.map((item) => ({ value: item.code, label: item.name }))}
          onChange={(value) => {
            setPicked(new Set());
            void navigate({ search: (previous: Record<string, unknown>) => ({ ...previous, pipeline: value }), replace: true });
          }}
        />
      ) : null}

      <MetricGrid className="lg:grid-cols-3">
        <MetricCard label="Targets due" value={due} />
        <MetricCard label="Awaiting approval" value={queue.length} />
        <MetricCard label="Baseline (no target)" value={scopedRows.filter((r) => r.baseline).length} />
      </MetricGrid>

      {isManager && queue.length ? (
        <div className="rounded-xl border border-gold/50 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-section-title font-semibold">Approval queue · {monthLabel(month)}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPicked(new Set(queue.map((r) => r.target_id!)))}>Select all</Button>
              <Button size="sm" disabled={!pickedInQueue.length || approve.isPending} onClick={() => approve.mutate(pickedInQueue)}>Approve {pickedInQueue.length || ""}</Button>
            </div>
          </div>
          <DataTable<(typeof queue)[number]>
            className="mt-3 rounded-none border-0 bg-transparent shadow-none"
            rows={queue}
            rowKey={(r) => r.target_id!}
            columns={[
              {
                key: "pick",
                header: "",
                render: (r) => (
                  <Checkbox checked={picked.has(r.target_id!)} onCheckedChange={(v) => {
                    const s = new Set(picked); if (v) s.add(r.target_id!); else s.delete(r.target_id!); setPicked(s);
                  }} />
                ),
              },
              { key: "hotel", header: "Hotel", render: (r) => <>{r.client_code ? <span className="mr-1 text-muted-foreground">{r.client_code}</span> : null}{r.hotel_name}</> },
              { key: "pipeline", header: "Pipeline", render: (r) => r.pipeline_name },
              { key: "kpi", header: "KPI", render: (r) => r.kpi_name },
              { key: "last", header: "Last actual", align: "right", render: (r) => fmt(r.prev_actual) },
              { key: "proposed", header: "Proposed", align: "right", render: (r) => <span className="font-medium">{fmt(r.target)}</span> },
            ]}
          />
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && !groups.length ? (
        <p className="card-surface p-6 text-sm text-muted-foreground">
          No hotels to set targets for. This list shows the hotels in the pipelines you head (management sees all).
        </p>
      ) : null}

      <DepartmentScorecards month={month} />
      {groups.map((g) => {
        const f = g[0]!;
        return (
          <div key={f.client_pipeline_id} className="card-surface overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
              <p className="font-medium">
                {f.client_code ? <span className="mr-2 text-xs text-muted-foreground">{f.client_code}</span> : null}
                {f.hotel_name} · <span className="text-muted-foreground">{f.pipeline_name}</span>
              </p>
              <Button size="sm" variant="outline" disabled={save.isPending || g.every((r) => r.baseline)} onClick={() => save.mutate(g)}>
                {isManager ? "Save as approved" : "Propose targets"}
              </Button>
            </div>
            <DataTable<(typeof g)[number]>
              className="mt-2 rounded-none border-0 bg-transparent shadow-none"
              rows={g}
              rowKey={(r) => key(r)}
              columns={[
                {
                  key: "kpi",
                  header: "KPI",
                  render: (r) => (
                    <>
                      {r.kpi_name}
                      <span className="block text-label text-muted-foreground">
                        {r.direction === "lower_better" ? "Lower is better" : r.direction === "within_budget" ? "Within budget" : "Higher is better"}
                        {r.unit ? ` · ${r.unit}` : ""}
                      </span>
                    </>
                  ),
                },
                { key: "last", header: "Last month", align: "right", render: (r) => fmt(r.prev_actual) },
                { key: "suggested", header: "Suggested", align: "right", render: (r) => fmt(r.suggested) },
                {
                  key: "target",
                  header: `Target for ${monthLabel(month)}`,
                  render: (r) => {
                    const locked = r.baseline || (!isManager && r.status === "approved");
                    return r.baseline ? (
                      <span className="text-label text-muted-foreground">Baseline month — no target</span>
                    ) : (
                      <Input className="h-8 w-32 text-right" type="number" min={0} disabled={locked}
                        value={edits[key(r)] ?? (r.target ?? r.suggested ?? "").toString()}
                        onChange={(e) => setEdits({ ...edits, [key(r)]: e.target.value })} />
                    );
                  },
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) =>
                    r.status === "approved" ? <StatusBadge status="approved" label="Approved" />
                      : r.status === "provisional" ? <StatusBadge status="provisional" label="Provisional — not scored yet" />
                      : r.baseline ? <StatusBadge status="baseline" label="Baseline" />
                      : <StatusBadge status="due" label="Due" />,
                },
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}
