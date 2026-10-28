import { useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FETCHED_QUERY_PREFIXES, fetchedRowOpen } from "@/lib/kpi-review";
type Fetched = { id: string; source: string; month: string; fetched_at: string; fetched_values: Record<string, number | null>; corrected_values: Record<string, number | null> | null; status: string; kpi_source_mappings?: { external_name: string } | null };
export function FetchedKpiReview({ cp, month }: { cp: string; month: string }) {
  const { isManager } = useAuth(); const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ["fetched-kpis", cp, month], enabled: !!cp, queryFn: async () => {
    const { data, error } = await supabase.from("kpi_fetched_values").select("*, kpi_source_mappings(external_name)").eq("client_pipeline_id", cp).eq("month", month).eq("is_partial", false); if (error) throw error; return data as unknown as Fetched[];
  } });
  const { data: startDate } = useQuery({ queryKey: ["cp-start", cp], enabled: !!cp, queryFn: async () => {
    const { data, error } = await supabase.from("client_pipelines").select("start_date").eq("id", cp).single(); if (error) throw error; return String(data.start_date ?? "").slice(0, 7);
  } });
  return <div className="space-y-4">{rows.map((row) => <FetchedRow key={row.id} row={row} isManager={isManager} beforeAlcor={!!startDate && row.month.slice(0, 7) < startDate} refresh={() => { for (const k of FETCHED_QUERY_PREFIXES) void qc.invalidateQueries({ queryKey: [...k] }); }} />)}</div>;
}
function FetchedRow({ row, isManager, beforeAlcor, refresh }: { row: Fetched; isManager: boolean; beforeAlcor: boolean; refresh: () => void }) {
  const [edits, setEdits] = useState<Record<string,string>>({}); const [busy, setBusy] = useState(false);
  const open = fetchedRowOpen(row as { month: string; is_partial?: boolean | null }, new Date());
  async function save(action: "save" | "confirm" | "approve"): Promise<boolean> {
    setBusy(true);
    try {
      const current = { ...row.fetched_values, ...row.corrected_values }; for (const [k,v] of Object.entries(edits)) current[k] = v === "" ? null : Number(v);
      const { error } = action === "approve" ? await supabase.rpc("approve_fetched_kpis", { _id: row.id }) : await supabase.rpc("review_fetched_kpis", { _id: row.id, _values: current, _confirm: action === "confirm" });
      if (error) throw error; toast.success("Source review updated"); refresh(); return true;
    } catch(e) { toast.error(e instanceof Error ? e.message : "Review failed"); return false; } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-y border-border py-4"><h3 className="font-semibold">Fetched from {row.source}{row.kpi_source_mappings?.external_name ? ` · ${row.kpi_source_mappings.external_name}` : ""} · {row.status}</h3>{beforeAlcor && <p className="text-xs font-medium text-amber-700">Before Alcor — historic context; does not count toward targets or scorecards</p>}<p className="text-xs text-muted-foreground">Fetched {new Date(row.fetched_at).toLocaleString("en-IN")} · review 1st–3rd IST</p>
    <div className="grid gap-3 sm:grid-cols-3">{Object.entries(row.fetched_values).map(([key,value]) => <div key={key}><Label>{key.replaceAll("_", " ")}</Label><p className="text-xs text-muted-foreground">Fetched: {value ?? "Not available"}</p><Input type="number" value={edits[key] ?? String(row.corrected_values?.[key] ?? value ?? "")} onChange={(e) => setEdits((v) => ({ ...v, [key]: e.target.value }))} disabled={!open || row.status === "approved" || isManager} /></div>)}</div>
    <div className="flex gap-2">{!isManager && <><Button variant="outline" disabled={!open || busy || row.status === "approved"} onClick={() => save("save")}>Save corrections</Button><ConfirmButton doneLabel="Confirmed" disabled={!open || busy || row.status === "approved"} onConfirm={() => save("confirm")}>Confirm previous month</ConfirmButton></>}{isManager && row.status === "confirmed" && <ConfirmButton doneLabel="Approved" disabled={busy} onConfirm={() => save("approve")}>Approve source values</ConfirmButton>}</div>
  </section>;
}