import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { fmtDate, TASK_STATUS_LABEL } from "@/lib/launch";

type ExitRow = { id: string; launch_id: string; hotel_name: string; code: string; name: string; stage: string | null; owner_side: string | null; due_date: string; status: string; evidence_url: string | null; financial: boolean };

export function ExitChecklist({ launchId }: { launchId?: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ["exit-checklist", launchId ?? "all"], queryFn: async () => {
    const { data, error } = await supabase.rpc("exit_workspace", launchId ? { _launch: launchId } : {});
    if (error) throw error;
    return (data ?? []) as unknown as ExitRow[];
  }});
  async function save(row: ExitRow, status: string) {
    setBusy(row.id);
    try {
      const { error } = await supabase.rpc("update_exit_item", { _task: row.id, _status: status, ...((links[row.id] ?? row.evidence_url) ? { _evidence: links[row.id] ?? row.evidence_url ?? "" } : {}) });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["exit-checklist"] });
      await qc.invalidateQueries({ queryKey: ["launch-exit-tasks"] });
      toast.success("Exit item saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save exit item"); }
    finally { setBusy(null); }
  }
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading exit items…</p>;
  if (!query.data?.length) return null;
  return <section className="space-y-3"><h2 className="text-section-title font-semibold">Exit checklist</h2>
    <DataTable rows={query.data} rowKey={row => row.id} columns={[
      ...(!launchId ? [{ key: "hotel", header: "Property", render: (row: ExitRow) => row.hotel_name }] : []),
      { key: "item", header: "Item", render: row => <div className="max-w-lg"><p className="text-label-muted">{row.stage ?? "Exit"} · {row.owner_side ?? "Alcor"}</p><p>{row.name}</p></div> },
      { key: "due", header: "Due", render: row => fmtDate(row.due_date) },
      { key: "status", header: "Status", render: row => <Select value={row.status} disabled={busy === row.id} onValueChange={value => save(row, value)}><SelectTrigger className="w-36" aria-label={`Status ${row.code}`}><SelectValue /></SelectTrigger><SelectContent>{["not_started", "in_progress", "done"].map(status => <SelectItem key={status} value={status}>{TASK_STATUS_LABEL[status]}</SelectItem>)}{!["not_started", "in_progress", "done"].includes(row.status) ? <SelectItem value={row.status}>{TASK_STATUS_LABEL[row.status] ?? row.status}</SelectItem> : null}</SelectContent></Select> },
      { key: "evidence", header: "Evidence", render: row => <div className="flex min-w-48 gap-2"><Input aria-label={`Evidence ${row.code}`} placeholder="https://" value={links[row.id] ?? row.evidence_url ?? ""} onChange={event => setLinks(old => ({ ...old, [row.id]: event.target.value }))} /><Button variant="outline" size="sm" disabled={busy === row.id} onClick={() => save(row, row.status)}>Save</Button></div> },
    ]} />
  </section>;
}