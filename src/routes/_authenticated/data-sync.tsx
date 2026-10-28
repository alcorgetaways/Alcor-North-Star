import { ConfirmButton } from "@/components/ConfirmButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sourceProfiles, syncSourceMonth, syncMappedHistory } from "@/lib/kpi-sync.functions";
import { suggestedMatch } from "@/lib/kpi-review";
import { latestCompleteMonth } from "@/lib/form-rules";
import { historyPlan } from "@/lib/kpi-sync-plan";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
export const Route = createFileRoute("/_authenticated/data-sync")({ head: () => ({ meta: [{ title: "Data sync — Alcor North Star" }, { name: "description", content: "Confirmed Metricool and Localo profile mappings, monthly KPI imports and errors." }, { property: "og:title", content: "Data sync — Alcor North Star" }, { property: "og:description", content: "Read-only KPI source mappings and sync history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: DataSync });
function DataSync() {
  const load = useServerFn(sourceProfiles), sync = useServerFn(syncSourceMonth), qc = useQueryClient();
  const history = useServerFn(syncMappedHistory);
  const [source, setSource] = useState<"metricool" | "localo">("metricool"); const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([]); const [choices, setChoices] = useState<Record<string,string>>({}); const [month,setMonth] = useState(()=>latestCompleteMonth()); const maxMonth = latestCompleteMonth(); const [busy,setBusy] = useState(false); const [confirming,setConfirming] = useState<string|null>(null); const [failure,setFailure] = useState<string | null>(null);
  const { data: pipes = [] } = useQuery({ queryKey: ["sync-pipelines",source], queryFn: async () => { const { data,error } = await supabase.from("client_pipelines").select("id,client_id,clients(hotel_name),pipelines!inner(code)").eq("pipelines.code",source === "metricool" ? "social_media" : "gbp").eq("status","active"); if(error) throw error; return data ?? []; } });
  const { data: mappings = [] } = useQuery({ queryKey: ["sync-mappings"], queryFn: async () => { const { data,error } = await supabase.from("kpi_source_mappings").select("*").eq("active",true); if(error) throw error; return data ?? []; } });
  const { data: runs = [] } = useQuery({ queryKey: ["sync-runs"], queryFn: async () => { const { data,error } = await supabase.from("kpi_sync_runs").select("*").order("created_at",{ascending:false}).limit(100); if(error) throw error; return data ?? []; } });
  async function refresh() { setBusy(true); try { const r = await load({data:{source}}); setProfiles(r.profiles); setFailure(r.error); } catch(e) { setFailure(e instanceof Error ? e.message : "Source unavailable"); } finally {setBusy(false);} }
  async function confirm(p: {id:string;name:string}) { const cp = choices[p.id] ?? suggestedMatch(p.name,pipes.map((v) => ({id:v.id,name:v.clients?.hotel_name ?? ""}))); if(!cp) throw new Error("Choose the hotel for this profile first"); setConfirming(p.id); try { const {error}=await supabase.rpc("confirm_kpi_mapping",{_source:source,_external:p.id,_name:p.name,_cp:cp}); if(error) throw error; else {toast.success("Mapping confirmed");void qc.invalidateQueries({queryKey:["sync-mappings"]});} } finally { setConfirming(null); } }
  const [running, setRunning] = useState<string | null>(null);
  // Honest history progress: expected months computed with the same rules as the runner,
  // done months counted from the sync log written as each month finishes.
  const [histRun, setHistRun] = useState<{ id: string; source: string; startedAt: string; total: number } | null>(null);
  const histProgress = useQuery({
    queryKey: ["sync-progress", histRun?.id, histRun?.startedAt],
    enabled: !!histRun,
    refetchInterval: 2000,
    queryFn: async () => {
      const { data, error } = await supabase.from("kpi_sync_runs").select("id").eq("mapping_id", histRun!.id).gte("created_at", histRun!.startedAt);
      if (error) throw error;
      return (data ?? []).length;
    },
  });
  async function runHistory(m: { id: string; source: string; client_pipeline_id: string }) {
    const now = new Date();
    const { data: cp } = await supabase.from("client_pipelines").select("start_date").eq("id", m.client_pipeline_id).single();
    const { data: rows } = await supabase.from("kpi_fetched_values").select("month, status, is_partial, raw_data").eq("mapping_id", m.id);
    const byMonth = new Map((rows ?? []).map((r) => [r.month, r]));
    const total = historyPlan({ startDate: cp?.start_date, source: m.source, now, existing: byMonth as never }).length;
    setBusy(true);
    setHistRun({ id: m.id, source: m.source, startedAt: new Date(now.getTime() - 5000).toISOString(), total });
    try {
      const r = await history({ data: { mapping: m.id } });
      toast.success(`${r.fetched} months fetched; ${r.failures} errors`);
      void qc.invalidateQueries({ queryKey: ["sync-runs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "History fetch failed");
    } finally {
      setBusy(false);
      setHistRun(null);
    }
  }
  async function run(id:string) {if(month>maxMonth){toast.error("Only complete months can be fetched");return false;}setRunning(id);try {const r=await sync({data:{mapping:id,month:`${month}-01`}});if(r.error) throw new Error(r.error); else toast.success("Monthly values fetched");void qc.invalidateQueries({queryKey:["sync-runs"]});return true;}finally{setRunning(null);}}
  return <div className="space-y-6"><PageHeader title="Data sync" actions={histRun ? <Badge variant="outline" role="status" aria-live="polite">Syncing {histRun.source === "localo" ? "Localo" : "Metricool"}… {Math.min(histProgress.data ?? 0, histRun.total)}/{histRun.total} months</Badge> : busy || running ? <Badge variant="outline" role="status" aria-live="polite">Syncing {source === "localo" ? "Localo" : "Metricool"}…</Badge> : null} /><div className="flex flex-wrap gap-3"><Select value={source} onValueChange={(v)=>{setSource(v as "metricool"|"localo");setProfiles([]);setChoices({});}}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="metricool">Metricool</SelectItem><SelectItem value="localo">Localo</SelectItem></SelectContent></Select><Button variant="outline" onClick={refresh} disabled={busy}><RefreshCw className="mr-2 h-4 w-4"/>Refresh profiles</Button><Input type="month" className="w-44" max={maxMonth} value={month} onChange={(e)=>setMonth(e.target.value && e.target.value<=maxMonth ? e.target.value : maxMonth)}/></div>{failure && <p role="alert" className="text-destructive">{failure}</p>}
    <DataTable rows={profiles} rowKey={(p)=>p.id} emptyMessage="No source profiles loaded." columns={[{key:"name",header:"Source profile",render:(p)=>p.name},{key:"hotel",header:"Hotel",render:(p)=><Select value={choices[p.id]??suggestedMatch(p.name,pipes.map((v)=>({id:v.id,name:v.clients?.hotel_name??""})))} onValueChange={(v)=>setChoices((c)=>({...c,[p.id]:v}))}><SelectTrigger><SelectValue placeholder="Choose hotel"/></SelectTrigger><SelectContent>{pipes.map((v)=><SelectItem key={v.id} value={v.id}>{v.clients?.hotel_name}</SelectItem>)}</SelectContent></Select>},{key:"confirm",header:"Confirmation",render:(p)=><ConfirmButton doneLabel="Confirmed" variant="outline" size="sm" disabled={confirming===p.id || !(choices[p.id]??suggestedMatch(p.name,pipes.map((v)=>({id:v.id,name:v.clients?.hotel_name??""}))))} onConfirm={()=>confirm(p)}><Check className="mr-2 h-4 w-4"/>Confirm mapping</ConfirmButton>}]}/>
    <h2 className="text-section-title font-semibold">Confirmed mappings</h2><DataTable rows={mappings.filter((m)=>m.source===source)} rowKey={(m)=>m.id} columns={[{key:"name",header:"Profile",render:(m)=>m.external_name},{key:"time",header:"Confirmed",render:(m)=>new Date(m.confirmed_at).toLocaleDateString("en-IN")},{key:"fetch",header:"Monthly pull",render:(m)=><div className="flex flex-wrap gap-2"><ConfirmButton variant="outline" size="sm" disabled={!month || running === m.id} doneLabel="Fetched" onConfirm={()=>run(m.id)}>Fetch month</ConfirmButton><Button variant="outline" size="sm" disabled={busy} onClick={()=>runHistory(m)}>Fetch from onboarding</Button></div>}]}/>
    <h2 className="text-section-title font-semibold">Sync history</h2><DataTable rows={runs} rowKey={(r)=>r.id} columns={[{key:"source",header:"Source",render:(r)=>r.source},{key:"month",header:"Month",render:(r)=>r.month??"—"},{key:"status",header:"Status",render:(r)=><StatusBadge status={r.status} label={r.status.replaceAll("_"," ")} />},{key:"detail",header:"Details",render:(r)=>r.detail??"—"}]}/></div>;
}