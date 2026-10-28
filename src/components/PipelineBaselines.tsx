import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PipelineBaselines({ code, pipelineId }: { code?: string | undefined; pipelineId?: string | undefined }) {
  const { isManager } = useAuth(); const qc = useQueryClient();
  const [chosen, setChosen] = useState(pipelineId ?? ""); const [month, setMonth] = useState("");
  const [values, setValues] = useState<Record<string, string>>({}); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const { data: pipes = [] } = useQuery({ queryKey: ["baseline-pipelines", code, pipelineId], queryFn: async () => {
    let q = supabase.from("client_pipelines").select("id,pipeline_id,clients(hotel_name),pipelines!inner(code,name)").eq("status", "active");
    if (code) q = q.eq("pipelines.code", code); if (pipelineId) q = q.eq("id", pipelineId);
    const { data, error } = await q; if (error) throw error; return data ?? [];
  } });
  const selected = pipes.find((p) => p.id === chosen) ?? pipes[0]; const cp = selected?.id;
  const { data: baseline } = useQuery({ queryKey: ["baseline", cp], enabled: !!cp, queryFn: async () => {
    if (!cp) return null; const { data, error } = await supabase.from("pipeline_baselines").select("*").eq("client_pipeline_id", cp).maybeSingle(); if (error) throw error; return data;
  } });
  const { data: definitions = [] } = useQuery({ queryKey: ["baseline-definitions", selected?.pipeline_id], enabled: !!selected, queryFn: async () => {
    if (!selected) return []; const { data, error } = await supabase.from("kpi_definitions").select("id,name,unit").eq("pipeline_id", selected.pipeline_id).eq("active", true).order("sort_order"); if (error) throw error; return data ?? [];
  } });
  async function action(approve: boolean) {
    if (!cp) return; setBusy(true);
    try {
      const original = baseline?.values as Record<string, number | null> | undefined;
      const numeric = Object.fromEntries(definitions.map((d) => { const v = values[d.id] ?? String(original?.[d.id] ?? ""); return [d.id, v === "" ? null : Number(v)]; }));
      const { error } = approve ? await supabase.rpc("approve_pipeline_baseline", { _cp: cp }) : await supabase.rpc("save_pipeline_baseline", { _cp: cp, _month: month ? `${month}-01` : baseline?.month ?? "", _values: numeric, _submit: true, ...(reason ? { _reason: reason } : {}) });
      if (error) throw error; toast.success(approve ? "Baseline approved" : "Baseline saved"); setValues({}); setMonth(""); void qc.invalidateQueries({ queryKey: ["baseline", cp] });
    } catch(e) { toast.error(e instanceof Error ? e.message : "Could not save baseline"); } finally { setBusy(false); }
  }
  return <section className="space-y-4 border-t border-border pt-5">
    <h2 className="text-section-title font-semibold">Day-0 baseline <span className="text-sm text-muted-foreground">{baseline?.status ?? "Not recorded"}</span></h2>
    {!pipelineId && <Select value={cp ?? ""} onValueChange={(id) => { setChosen(id); setValues({}); setMonth(""); }}><SelectTrigger><SelectValue placeholder="Hotel and pipeline" /></SelectTrigger><SelectContent>{pipes.map((p) => <SelectItem key={p.id} value={p.id}>{p.clients?.hotel_name} · {p.pipelines?.name}</SelectItem>)}</SelectContent></Select>}
    <div className="max-w-xs space-y-1"><Label>First reference month</Label><Input type="month" value={month || baseline?.month.slice(0,7) || ""} onChange={(e) => setMonth(e.target.value)} disabled={baseline?.status === "approved" && !isManager} /></div>
    <div className="grid gap-3 sm:grid-cols-3">{definitions.map((d) => <div key={d.id} className="space-y-1"><Label>{d.name}{d.unit ? ` (${d.unit})` : ""}</Label><Input type="number" value={values[d.id] ?? String((baseline?.values as Record<string, number | null> | undefined)?.[d.id] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [d.id]: e.target.value }))} disabled={baseline?.status === "approved" && !isManager} /></div>)}</div>
    {baseline?.status === "approved" && isManager && <Input placeholder="Reason for approved baseline change" value={reason} onChange={(e) => setReason(e.target.value)} />}
    <div className="flex gap-2"><Button onClick={() => action(false)} disabled={!cp || busy || (baseline?.status === "approved" && !isManager)}> {baseline?.status === "approved" ? "Save audited change" : "Submit baseline"}</Button>{isManager && baseline?.status === "submitted" && <Button variant="outline" onClick={() => action(true)} disabled={busy}>Approve baseline</Button>}</div>
  </section>;
}