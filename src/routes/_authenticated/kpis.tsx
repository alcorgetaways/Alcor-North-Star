import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/kpis")({
  head: () => ({
    meta: [
      { title: "KPI Library — Alcor North Star" },
      { name: "description", content: "The controllable KPIs each pipeline is measured on, with definitions and data sources." },
      { property: "og:title", content: "KPI Library — Alcor North Star" },
      { property: "og:description", content: "Pipeline KPIs, definitions and data sources." },
    ],
  }),
  component: KpiLibrary,
});

const DIRECTION_LABEL: Record<string, string> = {
  higher_better: "Higher is better",
  lower_better: "Lower is better",
  within_budget: "Within budget",
};

function sourceText(sk: string | null): string {
  if (!sk) return "Entered in the report";
  const [k] = sk.split(".");
  const map: Record<string, string> = {
    weekly: "Weekly ads page",
    social: "Social page",
    gbp: "GBP page",
    ota: "OTA page",
    pke: "Pipeline page",
  };
  return `${map[k!] ?? k} · ${sk}`;
}

type Kpi = {
  id: string;
  pipeline_id: string;
  name: string;
  definition: string | null;
  unit: string | null;
  direction: string;
  source_key: string | null;
  active: boolean;
};

function KpiLibrary() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [editing, setEditing] = useState<Kpi | null>(null);

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("id, name, code, sort_order").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ["kpi-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, pipeline_id, name, definition, unit, direction, source_key, active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as Kpi[];
    },
  });

  const save = useMutation({
    mutationFn: async (k: Kpi) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ name: k.name.trim(), definition: k.definition?.trim() || null, active: k.active })
        .eq("id", k.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("KPI updated");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["kpi-definitions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Library"
        description="The controllable KPIs every monthly report is scored on. Actual numbers come from each pipeline's data page; management sets the targets."
      />

      <div className="space-y-6">
        {pipelines.map((p) => {
          const rows = kpis.filter((k) => k.pipeline_id === p.id);
          if (!rows.length) return null;
          return (
            <div key={p.id} className="card-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
                <h2 className="text-section-title font-semibold">{p.name}</h2>
                <span className="text-xs text-muted-foreground">{rows.length} KPIs</span>
              </div>
              <DataTable<Kpi>
                className="rounded-none border-0 bg-transparent shadow-none"
                rows={rows}
                rowKey={(k) => k.id}
                columns={[
                  {
                    key: "kpi",
                    header: "KPI",
                    render: (k) => (
                      <div className="min-w-0">
                        <p className="font-medium">{k.name}</p>
                        {k.definition ? <p className="text-label text-muted-foreground">{k.definition}</p> : null}
                        <p className="mt-1 text-label text-muted-foreground">
                          {DIRECTION_LABEL[k.direction] ?? k.direction}
                          {k.unit ? ` · ${k.unit}` : ""} · {sourceText(k.source_key)}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (k) => <StatusBadge status={k.active ? "active" : "inactive"} />,
                  },
                  ...(isManager
                    ? [
                        {
                          key: "actions",
                          header: "",
                          render: (k: Kpi) => (
                            <Button size="icon" variant="ghost" aria-label="Edit KPI" onClick={() => setEditing({ ...k })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit KPI</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Definition (plain English)</Label>
                <Textarea rows={3} value={editing.definition ?? ""} onChange={(e) => setEditing({ ...editing, definition: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Direction ({DIRECTION_LABEL[editing.direction] ?? editing.direction}) and source ({sourceText(editing.source_key)}) are fixed.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.name.trim() || save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
