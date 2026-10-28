import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/lib/launch";

export function PrelaunchHistory({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [pipeline, setPipeline] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: pipelines = [] } = useQuery({ queryKey: ["history-pipelines", clientId], queryFn: async () => {
    const { data, error } = await supabase.from("client_pipelines").select("pipeline_id,pipelines(name)").eq("client_id", clientId);
    if (error) throw error;
    return data;
  }});
  const { data: rows = [] } = useQuery({ queryKey: ["prelaunch-history", clientId], queryFn: async () => {
    const { data, error } = await supabase.from("prelaunch_work_history").select("*,pipelines(name),profiles:entered_by(full_name)").eq("client_id", clientId).order("work_date", { ascending: false });
    if (error) throw error;
    return data;
  }});
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("record_prelaunch_work", { _client: clientId, _pipeline: pipeline, _date: date, _description: description, ...(evidence ? { _evidence: evidence } : {}) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setDescription(""); setEvidence("");
    qc.invalidateQueries({ queryKey: ["prelaunch-history", clientId] });
    toast.success("Work history recorded");
  }
  return <section className="space-y-4">
    <h2 className="text-section-title font-semibold">Pre-launch work history</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="space-y-1"><Label>Pipeline</Label><Select value={pipeline} onValueChange={setPipeline}><SelectTrigger><SelectValue placeholder="Select pipeline" /></SelectTrigger><SelectContent>{pipelines.map(p => <SelectItem key={p.pipeline_id} value={p.pipeline_id}>{p.pipelines?.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1 sm:col-span-2"><Label>What was done</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>Evidence link (optional)</Label><Input value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="https://…" /></div>
    </div>
    <Button onClick={save} disabled={busy || !date || !pipeline || !description.trim()}>Record work</Button>
    <DataTable rows={rows} rowKey={r => r.id} columns={[
      {key:"date",header:"Date",render:r=>fmtDate(r.work_date)},
      {key:"pipeline",header:"Pipeline",render:r=>r.pipelines?.name},
      {key:"work",header:"What was done",render:r=>r.description},
      {key:"evidence",header:"Evidence",render:r=>r.evidence_url?<a className="text-primary underline" href={r.evidence_url} target="_blank" rel="noopener noreferrer">Open evidence</a>:"—"},
      {key:"author",header:"Entered by",render:r=>r.profiles?.full_name??"—"},
    ]} />
  </section>;
}