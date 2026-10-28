import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";

type BdTarget = {
  id: string; bd_user_id: string; bd_name: string; kind: "monthly_retainer" | "new_clients"; plan_code: string | null;
  plan_name: string | null; target: number; actual: number; period_start: string | null; due_date: string | null; past: boolean; notes: string | null;
};
const fmtD = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

/** BD targets (from the BD tracker "Target" tab, then set by management) with actuals from launches. */
export function BdTargetsPanel({ isManager }: { isManager: boolean }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["bd-targets"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bd_target_progress");
      if (error) throw error;
      return data as unknown as BdTarget[];
    },
  });
  const { data: bds = [] } = useQuery({
    queryKey: ["bd-people"],
    enabled: isManager,
    queryFn: async () => {
      // user_roles has no foreign key to profiles, so read the two tables separately.
      const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "bd_manager");
      if (error) throw error;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profs, error: pErr } = await supabase.from("profiles").select("id, full_name, status").in("id", ids);
      if (pErr) throw pErr;
      return (profs ?? [])
        .filter((p) => p.status === "active")
        .map((p) => ({ user_id: p.id, profiles: { full_name: p.full_name ?? "", status: p.status ?? "" } }));
    },
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["plans-basic"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("code, name").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState({ bd: "", kind: "new_clients", plan: "", value: "", start: "", due: "" });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bd_targets").insert({
        bd_user_id: f.bd, kind: f.kind, plan_code: f.kind === "new_clients" ? f.plan : null, target_value: Number(f.value),
        period_start: f.start || null, due_date: f.due || null, source: "Set by management in North Star",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BD target added");
      setF({ bd: "", kind: "new_clients", plan: "", value: "", start: "", due: "" });
      qc.invalidateQueries({ queryKey: ["bd-targets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data.length && !isManager) return null;
  return (
    <section className="card-surface p-5">
      <h2 className="text-section-title font-semibold">BD targets</h2>
      <p className="text-xs text-muted-foreground">Retainer achieved = active monthly retainers. New clients = first launches on that plan with a contract start in the period.</p>
      <DataTable<BdTarget>
        className="mt-3 rounded-none border-0 bg-transparent shadow-none"
        rows={data}
        rowKey={(t) => t.id}
        emptyMessage="No BD targets yet."
        columns={[
          { key: "bd", header: "BD", render: (t) => t.bd_name },
          { key: "target", header: "Target", render: (t) => (t.kind === "monthly_retainer" ? "Monthly signed retainer" : `New clients · ${t.plan_name ?? t.plan_code}`) },
          {
            key: "period",
            header: "Period",
            render: (t) => (
              <span className="text-label text-muted-foreground">
                {t.kind === "monthly_retainer" ? "Every month" : `${fmtD(t.period_start)} → ${fmtD(t.due_date)}`}
              </span>
            ),
          },
          { key: "goal", header: "Goal", align: "right", render: (t) => (t.kind === "monthly_retainer" ? currency(t.target) : t.target) },
          { key: "actual", header: "Actual", align: "right", render: (t) => (t.kind === "monthly_retainer" ? currency(t.actual) : t.actual) },
          {
            key: "pct",
            header: "%",
            align: "right",
            render: (t) => {
              const p = t.target ? Math.round((Number(t.actual) / Number(t.target)) * 100) : null;
              return p == null ? "—" : `${p}%`;
            },
          },
          { key: "state", header: "", render: (t) => (t.past ? <StatusBadge status="completed" label="Past target" /> : null) },
        ]}
      />
      {isManager ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/60 pt-4 text-sm">
          <Select value={f.bd} onValueChange={(v) => setF({ ...f, bd: v })}>
            <SelectTrigger className="w-44"><SelectValue placeholder="BD person" /></SelectTrigger>
            <SelectContent>{bds.map((b) => <SelectItem key={b.user_id} value={b.user_id}>{b.profiles.full_name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new_clients">New clients on a plan</SelectItem>
              <SelectItem value="monthly_retainer">Monthly retainer goal (₹)</SelectItem>
            </SelectContent>
          </Select>
          {f.kind === "new_clients" ? (
            <Select value={f.plan} onValueChange={(v) => setF({ ...f, plan: v })}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>{plans.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
          <Input className="w-32" type="number" min={0} placeholder={f.kind === "new_clients" ? "Clients" : "₹ / month"} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <label className="text-xs text-muted-foreground">From<Input type="date" className="w-40" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">By<Input type="date" className="w-40" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
          <Button size="sm" disabled={!f.bd || !f.value || (f.kind === "new_clients" && !f.plan) || add.isPending} onClick={() => add.mutate()}>Add target</Button>
        </div>
      ) : null}
    </section>
  );
}

type Issue = {
  id: string; issue_no: number; raised_on: string | null; category: string | null; issue: string; action_taken: string | null;
  status: string; raised_by: string | null; owner_name: string | null; candidate_client_ids: string[]; client_id: string | null;
  action_item_id: string | null; flag: string | null;
};

/** Issues imported from the BD tracker "Issue Logs" tab that still need a client before they become action items. */
export function ImportedIssuesPanel({ isManager }: { isManager: boolean }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["imported-issues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("imported_issues").select("*").order("issue_no");
      if (error) throw error;
      return data as unknown as Issue[];
    },
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-basic"],
    enabled: isManager && data.some((i) => !i.action_item_id),
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, hotel_name").eq("is_test", false).order("hotel_name");
      if (error) throw error;
      return data;
    },
  });
  const [pick, setPick] = useState<Record<string, string>>({});
  const assign = useMutation({
    mutationFn: async (v: { id: string; client: string }) => {
      const { error } = await supabase.rpc("assign_imported_issue", { _issue_id: v.id, _client_id: v.client });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to the Action Tracker");
      qc.invalidateQueries({ queryKey: ["imported-issues"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = data.filter((i) => !i.action_item_id);
  if (!open.length) return null;
  return (
    <section className="rounded-xl border border-warning/50 bg-warning/5 p-5 text-sm">
      <h2 className="text-section-title font-semibold">Imported issues needing a client</h2>
      <p className="text-xs text-muted-foreground">From the BD tracker "Issue Logs" tab. Choose the client to add each one to the Action Tracker (resolved ones go in as closed history).</p>
      <ul className="mt-3 space-y-3">
        {open.map((i) => {
          const options = i.candidate_client_ids.length ? clients.filter((c) => i.candidate_client_ids.includes(c.id)) : clients;
          return (
            <li key={i.id} className="rounded-lg border border-border/70 bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">#{i.issue_no} · {i.category}</span>
                <Badge variant={i.status.toLowerCase().startsWith("resolved") ? "secondary" : "default"}>{i.status}</Badge>
                {i.flag ? <Badge variant="outline" className="border-warning text-warning-foreground">{i.flag}</Badge> : null}
              </div>
              <p className="mt-1">{i.issue}</p>
              <p className="text-xs text-muted-foreground">
                {i.raised_on ? `${fmtD(i.raised_on)} · ` : ""}Raised by {i.raised_by ?? "—"} · Owner {i.owner_name ?? "—"} · Action: {i.action_taken ?? "—"}
              </p>
              {isManager ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Select value={pick[i.id] ?? ""} onValueChange={(v) => setPick({ ...pick, [i.id]: v })}>
                    <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Choose client" /></SelectTrigger>
                    <SelectContent>{options.map((c) => <SelectItem key={c.id} value={c.id}>{c.hotel_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" disabled={!pick[i.id] || assign.isPending} onClick={() => assign.mutate({ id: i.id, client: pick[i.id]! })}>Add to Action Tracker</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
