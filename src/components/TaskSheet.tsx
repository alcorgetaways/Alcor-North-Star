import { taskBlockerFields, taskDateError } from "@/lib/form-rules";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FormSection } from "@/components/FormSection";
import { StatusBadge } from "@/components/StatusBadge";
import { escalationLabel } from "@/components/BlockedTasks";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUSES, TASK_STATUS_LABEL, fmtDate, fmtDateTime, isOverdue } from "@/lib/launch";

export type BoardTask = {
  id: string;
  launch_id: string;
  module_code: string;
  code: string;
  name: string;
  standard: string | null;
  week_label: string | null;
  week_due: number;
  due_date: string;
  status: string;
  assignee_id: string | null;
  backup_id: string | null;
  evidence_url: string | null;
  notes: string | null;
  requires_client_approval: boolean;
  client_approved_at: string | null;
  carried_from_task_id: string | null;
  gate_a_override_at?: string | null;
  phase_code?: string | null;
  blocker_reason?: string | null;
  blocker_impact?: string | null;
  escalation_level?: number;
};

type Staff = { id: string; full_name: string };

export function TaskSheet({
  task,
  staff,
  canEditPlan,
  onClose,
  invalidateKeys,
}: {
  task: BoardTask | null;
  staff: Staff[];
  canEditPlan: boolean;
  onClose: () => void;
  invalidateKeys: unknown[][];
}) {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [overrideReason, setOverrideReason] = useState("");
  const lock = useQuery({ queryKey: ["task-lock", task?.id], enabled: Boolean(task), queryFn: async () => {
    if (!task) return false;
    const { data, error } = await supabase.rpc("task_gate_a_locked", { _task: task.id });
    if (error) throw error;
    return data;
  }});
  const locked = lock.data === true;
  async function override() {
    if (!task) return;
    const { error } = await supabase.rpc("override_gate_a_task", { _task: task.id, _reason: overrideReason });
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["task-lock", task.id] });
    for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
    toast.success("Task override recorded");
  }
  const [form, setForm] = useState({ status: "", evidence_url: "", notes: "", assignee_id: "", backup_id: "", due_date: "", blocker_reason: "", blocker_impact: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setForm({
      status: task.status,
      evidence_url: task.evidence_url ?? "",
      notes: task.notes ?? "",
      assignee_id: task.assignee_id ?? "",
      backup_id: task.backup_id ?? "",
      due_date: task.due_date,
      blocker_reason: task.blocker_reason ?? "Other blocker",
      blocker_impact: task.blocker_impact ?? "",
    });
  }, [task]);

  const activity = useQuery({
    queryKey: ["task-activity", task?.id],
    enabled: !!task,
    queryFn: async () => {
      if (!task) return [];
      const { data, error } = await supabase
        .from("task_activity")
        .select("id, user_id, action, from_status, to_status, note, created_at")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const lastChangeRequest = (activity.data ?? []).find((a) => a.action === "client_changes_requested");
  const name = (id: string | null | undefined) => staff.find((s) => s.id === id)?.full_name ?? (id ? "Unknown" : "—");

  async function save() {
    if (!task || locked) return;
    if (
      task.requires_client_approval &&
      form.status === "waiting_client" &&
      task.status !== "waiting_client" &&
      !form.evidence_url.trim()
    ) {
      toast.error("Add the evidence link first — the hotel owner must see the work before approving.");
      return;
    }
    const dateError = taskDateError(canEditPlan, form.due_date);
    if (dateError) { toast.error(dateError); return; }
    setSaving(true);
    const patch = {
      status: form.status as typeof task.status,
      evidence_url: form.evidence_url || null,
      notes: form.notes || null,
      ...taskBlockerFields(form.status, form.blocker_reason, form.blocker_impact),
      ...(canEditPlan
        ? { assignee_id: form.assignee_id || null, backup_id: form.backup_id || null, due_date: form.due_date }
        : {}),
    };
    const { data: updated, error } = await supabase
      .from("client_tasks")
      .update(patch)
      .eq("id", task.id)
      .select("id, status")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!updated || updated.status !== form.status) {
      toast.error("The task update was not confirmed. Check your access, then refresh and try again.");
      return;
    }
    toast.success(`${task.code} saved`);
    for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
    qc.invalidateQueries({ queryKey: ["task-activity", task.id] });
    qc.invalidateQueries({ queryKey: ["my-tasks"] });
    onClose();
  }

  return (
    <Sheet open={!!task} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {task ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-card-title font-semibold">
                <span className="text-muted-foreground">{task.code}</span> · {task.name}
              </SheetTitle>
              <SheetDescription>
                {task.week_label ?? `Week ${task.week_due}`} · due {fmtDate(task.due_date)}
                {isOverdue(task) ? <span className="ml-2 font-medium text-destructive">Overdue</span> : null}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5 px-4 pb-6 text-sm">
              {task.carried_from_task_id ? <Badge variant="outline">Carried over</Badge> : null}
              {task.notes && task.notes.startsWith("Carried over from") ? (
                <p className="rounded-lg border border-gold/40 bg-gold/10 p-2 text-xs">{task.notes}</p>
              ) : null}
              {task.standard ? (
                <div>
                  <p className="text-label-muted">How to do it</p>
                  <p className="mt-1 whitespace-pre-line">{task.standard}</p>
                </div>
              ) : null}

              {task.requires_client_approval ? (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
                  <p className="font-medium">Needs the hotel's approval</p>
                  <p className="text-xs text-muted-foreground">
                    {task.client_approved_at
                      ? `Approved by the owner on ${fmtDateTime(task.client_approved_at)}`
                      : "Not approved yet — set the status to “Waiting on client” to ask the hotel owner (an evidence link is required)."}
                  </p>
                  {!task.client_approved_at && lastChangeRequest ? (
                    <p className="mt-1 text-xs font-medium text-warning-foreground">
                      Owner asked for changes: {lastChangeRequest.note}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {locked ? <div className="space-y-2 border-l-2 border-warning pl-3"><p className="font-medium">Locked: waiting for Gate A</p>{isManager ? <><Label>Override reason</Label><Textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} /><Button variant="outline" onClick={override} disabled={!overrideReason.trim()}>Override this task</Button></> : null}</div> : null}
              <fieldset disabled={locked || lock.isLoading} className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Assignee</Label>
                  {canEditPlan ? (
                    <StaffSelect staff={staff} value={form.assignee_id} onChange={(v) => setForm({ ...form, assignee_id: v })} exclude={form.backup_id} />
                  ) : (
                    <p>{name(task.assignee_id)}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Backup</Label>
                  {canEditPlan ? (
                    <StaffSelect staff={staff} value={form.backup_id} onChange={(v) => setForm({ ...form, backup_id: v })} exclude={form.assignee_id} />
                  ) : (
                    <p>{name(task.backup_id)}</p>
                  )}
                </div>
                {canEditPlan ? (
                  <div className="space-y-1.5">
                    <Label>Due date</Label>
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Evidence link</Label>
                <Input placeholder="https://…" value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value })} />
                <Label htmlFor="task-evidence-file">Upload evidence</Label>
                <Input id="task-evidence-file" type="file" accept="application/pdf,image/png,image/jpeg" disabled={saving} onChange={async e => {
                  const file=e.target.files?.[0];if(!file||!task)return;
                  if(file.size>10*1024*1024){toast.error('Maximum file size is 10 MB');return;}
                  if(!['application/pdf','image/png','image/jpeg'].includes(file.type)){toast.error('Choose a PDF, PNG or JPEG');return;}
                  setSaving(true);
                  // QA-19: any failure (network, storage) must release the sheet.
                  try{
                    const {data:row,error:readError}=await supabase.from('client_tasks').select('client_id').eq('id',task.id).maybeSingle();
                    if(readError||!row){toast.error(readError?.message??'Task not found');return;}
                    const extension=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';
                    const path=`${row.client_id}/task-evidence/${crypto.randomUUID()}.${extension}`;
                    const {error}=await supabase.storage.from('client-files').upload(path,file,{contentType:file.type});
                    if(error)toast.error(error.message);else setForm(prev=>({...prev,evidence_url:path}));
                  }catch(err){toast.error(err instanceof Error?err.message:'Upload failed');}
                  finally{setSaving(false);e.target.value='';}
                }}/>
              </div>
              {['blocked','waiting_client'].includes(form.status) ? <FormSection title="Blocker"><StatusBadge status="blocked" label={escalationLabel(task.escalation_level ?? 0)}/><Label>Reason</Label><Select value={form.status==='waiting_client'?'Waiting on client approval':form.blocker_reason} onValueChange={v=>setForm({...form,blocker_reason:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Other blocker">Other blocker</SelectItem>{task.requires_client_approval?<SelectItem value="Waiting on client approval">Waiting on client approval</SelectItem>:null}</SelectContent></Select><Label>Impact on progress</Label><Textarea value={form.blocker_impact} onChange={e=>setForm({...form,blocker_impact:e.target.value})}/></FormSection>:null}
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save task
              </Button>

              </fieldset>
              <div>
                <p className="text-label-muted">History</p>
                <ul className="mt-2 space-y-2">
                  {(activity.data ?? []).map((a) => (
                    <li key={a.id} className="border-l-2 border-border pl-3">
                      <p>
                        <span className="font-medium">{name(a.user_id) === "—" ? "System" : name(a.user_id)}</span>{" "}
                        {a.action === "status"
                          ? `moved ${TASK_STATUS_LABEL[a.from_status ?? ""] ?? a.from_status ?? "—"} → ${TASK_STATUS_LABEL[a.to_status ?? ""] ?? a.to_status}`
                          : a.action.replace(/_/g, " ")}
                      </p>
                      {a.note ? <p className="text-xs text-muted-foreground">{a.note}</p> : null}
                      <p className="text-label text-muted-foreground">{fmtDateTime(a.created_at)}</p>
                    </li>
                  ))}
                  {activity.data && !activity.data.length ? <li className="text-muted-foreground">No activity yet.</li> : null}
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function StaffSelect({ staff, value, onChange, exclude }: { staff: Staff[]; value: string; onChange: (v: string) => void; exclude?: string }) {
  const options = exclude ? staff.filter((s) => s.id !== exclude) : staff;
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {(value && exclude === value ? staff : options).map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
