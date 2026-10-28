import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthKey, monthLabel, monthOptions, previousMonthKey } from "@/lib/kpi";
import { DataTable } from "@/components/DataTable";

type Cp = { id: string; pipeline_id: string; pipelines: { name: string } | null };
type Def = { id: string; pipeline_id: string; name: string; unit: string | null; direction: string; default_target: number | null };

export function KpiTargetsTab({ clientId }: { clientId: string }) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthKey());
  const [values, setValues] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["kpi-targets", clientId, month],
    queryFn: async () => {
      const { data: cps, error } = await supabase
        .from("client_pipelines")
        .select("id, pipeline_id, pipelines(name)")
        .eq("client_id", clientId);
      if (error) throw error;
      const list = (cps ?? []) as unknown as Cp[];
      const pipelineIds = list.map((c) => c.pipeline_id);
      const cpIds = list.map((c) => c.id);
      const [{ data: defs }, { data: targets }] = await Promise.all([
        pipelineIds.length
          ? supabase
              .from("kpi_definitions")
              .select("id, pipeline_id, name, unit, direction, default_target, kpi_type")
              .in("pipeline_id", pipelineIds)
              .eq("active", true)
              .neq("kpi_type", "text")
              .order("sort_order")
          : Promise.resolve({ data: [] }),
        cpIds.length
          ? supabase
              .from("client_kpi_targets")
              .select("client_pipeline_id, kpi_definition_id, target, month")
              .in("client_pipeline_id", cpIds)
              .in("month", [month, previousMonthKey(month)])
          : Promise.resolve({ data: [] }),
      ]);
      return {
        cps: list,
        defs: (defs ?? []) as Def[],
        targets: (targets ?? []) as Array<{ client_pipeline_id: string; kpi_definition_id: string; target: number; month: string }>,
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string> = {};
    data.targets
      .filter((t) => t.month === month)
      .forEach((t) => (v[`${t.client_pipeline_id}|${t.kpi_definition_id}`] = String(t.target)));
    setValues(v);
  }, [data, month]);

  const save = useMutation({
    mutationFn: async (rows: Record<string, string>) => {
      const upserts = Object.entries(rows)
        .filter(([, val]) => val !== "" && !Number.isNaN(Number(val)))
        .map(([key, val]) => {
          const [cp, def] = key.split("|");
          return { client_pipeline_id: cp!, kpi_definition_id: def!, month, target: Number(val) };
        });
      if (!upserts.length) return;
      const { error } = await supabase
        .from("client_kpi_targets")
        .upsert(upserts, { onConflict: "client_pipeline_id,kpi_definition_id,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Targets saved");
      qc.invalidateQueries({ queryKey: ["kpi-targets", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copyForward() {
    if (!data) return;
    const prev = data.targets.filter((t) => t.month === previousMonthKey(month));
    if (!prev.length) {
      toast.error(`No targets set for ${monthLabel(previousMonthKey(month))}`);
      return;
    }
    const next = { ...values };
    prev.forEach((t) => (next[`${t.client_pipeline_id}|${t.kpi_definition_id}`] = String(t.target)));
    setValues(next);
    save.mutate(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions(6)
              .reverse()
              .concat(
                Array.from({ length: 6 }, (_, i) => {
                  const d = new Date();
                  const k = monthKey(new Date(d.getFullYear(), d.getMonth() + i + 1, 1));
                  return { value: k, label: monthLabel(k) };
                }),
              )
              .map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {isManager ? (
          <>
            <Button variant="outline" size="sm" onClick={copyForward} disabled={save.isPending}>
              <Copy className="mr-2 h-4 w-4" /> Copy last month's targets
            </Button>
            <Button size="sm" onClick={() => save.mutate(values)} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" /> Save targets
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Only admin and management can edit targets.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        A target applies from this month until changed. Reports cannot be submitted while any KPI has no target.
      </p>

      {!data || data.cps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pipelines allocated yet.</p>
      ) : (
        data.cps.map((cp) => {
          const defs = data.defs.filter((d) => d.pipeline_id === cp.pipeline_id);
          return (
            <section key={cp.id} className="card-surface overflow-hidden">
              <h3 className="border-b border-border/70 px-5 py-3 text-card-title font-semibold">
                {cp.pipelines?.name}
              </h3>
              {defs.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No numeric KPIs configured.</p>
              ) : (
                <DataTable<Def>
                  className="rounded-none border-0 bg-transparent shadow-none"
                  rows={defs}
                  rowKey={(d) => d.id}
                  columns={[
                    {
                      key: "kpi",
                      header: "KPI",
                      render: (d) => (
                        <>
                          <p className="font-medium">{d.name}</p>
                          <p className="text-label text-muted-foreground">
                            {d.direction === "lower_better" ? "Lower is better" : "Higher is better"}
                            {d.unit ? ` · ${d.unit}` : ""}
                          </p>
                        </>
                      ),
                    },
                    {
                      key: "target",
                      header: "Target",
                      align: "right",
                      render: (d) => {
                        const key = `${cp.id}|${d.id}`;
                        return (
                          <Input
                            className="ml-auto h-8 w-32"
                            type="number"
                            disabled={!isManager}
                            placeholder={d.default_target != null ? String(d.default_target) : "—"}
                            value={values[key] ?? ""}
                            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                          />
                        );
                      },
                    },
                  ]}
                />
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
