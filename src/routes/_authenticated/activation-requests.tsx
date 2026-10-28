import { ConfirmButton } from "@/components/ConfirmButton";
import { todayIST } from "@/lib/launch";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/launch";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/FormSection";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/activation-requests")({
  head: () => ({
    meta: [
      { title: "Activation Requests — Alcor North Star" },
      { name: "description", content: "Pipeline activation requests from hotel owners." },
      { property: "og:title", content: "Activation Requests — Alcor North Star" },
      { property: "og:description", content: "Pipeline activation requests from hotel owners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivationRequests,
});

type Row = {
  id: string;
  status: string;
  created_at: string;
  follow_up_due: string | null;
  scope_notes: string | null;
  clients: { hotel_name: string } | null;
  pipelines: { name: string } | null;
};

const STATUSES = ["pending", "contacted", "activated", "declined"] as const;

function ActivationRequests() {
  const qc = useQueryClient();
  const [review, setReview] = useState<Row | null>(null);
  const [scope, setScope] = useState("");
  const [onboarded, setOnboarded] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const complete = useMutation({ mutationFn: async () => { if (!review) return; const { error } = await supabase.rpc('complete_activation_followup', { _id: review.id, _scope: scope, _onboarded: onboarded, _assigned: assigned }); if (error) throw error; }, onSuccess: () => { setReview(null); void qc.invalidateQueries({ queryKey: ['activation-requests'] }); toast.success('Follow-up recorded'); }, onError: (e: Error) => toast.error(e.message) });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["activation-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_activation_requests")
        .select("id, status, created_at, follow_up_due, scope_notes, clients(hotel_name), pipelines(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: string }) => {
      const { error } = await supabase
        .from("pipeline_activation_requests")
        .update({ status: v.status })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation-requests"] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activation Requests"
        description="Pipelines hotel owners asked to unlock. Nothing is activated automatically — contact the hotel, then update the status."
      />
      <p className="text-sm font-semibold text-destructive">{rows.filter((r) => r.follow_up_due && r.follow_up_due < todayIST() && r.status === "pending").length} overdue follow-ups</p>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyMessage="No activation requests yet."
        columns={[
          {
            key: "hotel",
            header: "Hotel",
            render: (r) => (
              <>
                <p className="font-medium">{r.clients?.hotel_name ?? "Unknown hotel"}</p>
                <p className="text-label text-muted-foreground">
                  {r.pipelines?.name ?? "Pipeline"} · requested {fmtDate(r.created_at)}
                </p>
              </>
            ),
          },
          {
            key: "followup", header: "Shalini follow-up", render: r => <><span>{r.follow_up_due ? fmtDate(r.follow_up_due) : '—'}</span>{r.follow_up_due && r.follow_up_due < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) && r.status === 'pending' ? <StatusBadge status="overdue" label="Overdue"/> : null}{!['activated','declined'].includes(r.status) ? <Button size="sm" variant="outline" onClick={() => { setReview(r); setScope(r.scope_notes ?? ''); setOnboarded(false); setAssigned(false); }}>Record follow-up</Button> : null}</>
          },

          {
            key: "action",
            header: "",
            align: "right",
            render: (r) => (
              <Select value={r.status} onValueChange={(s) => setStatus.mutate({ id: r.id, status: s })}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} disabled={s==='activated'}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
        ]}
      />
      <Dialog open={!!review} onOpenChange={o=>{if(!o)setReview(null);}}><DialogContent><DialogHeader><DialogTitle>Add-on follow-up</DialogTitle></DialogHeader><FormSection title={review?.clients?.hotel_name ?? 'Add-on'}><Label htmlFor="addon-scope">Confirmed scope</Label><Input id="addon-scope" value={scope} onChange={e=>setScope(e.target.value)}/><Label className="flex gap-2"><Checkbox checked={onboarded} onCheckedChange={v=>setOnboarded(v===true)}/>Add-on onboarding completed</Label><Label className="flex gap-2"><Checkbox checked={assigned} onCheckedChange={v=>setAssigned(v===true)}/>Tasks assigned to the relevant Pipeline Head/team</Label><ConfirmButton doneLabel="Saved" disabled={!scope.trim()||complete.isPending} onConfirm={()=>complete.mutateAsync()}>Save follow-up</ConfirmButton></FormSection></DialogContent></Dialog>
    </div>
  );
}
