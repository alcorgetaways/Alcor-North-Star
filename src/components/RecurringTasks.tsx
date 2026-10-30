import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActivityMutation, type RecurringTask } from "@/lib/activity-plans";
import { escalationLabel } from "@/components/BlockedTasks";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormSection } from "@/components/FormSection";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export function RecurringTasks({ tasks }: { tasks: RecurringTask[] }) {
  const mutation = useActivityMutation();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [review, setReview] = useState<RecurringTask | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [owner, setOwner] = useState("");
  const [backup, setBackup] = useState("");
  // Progress dialog: marking blocked (reason required) or done (evidence link required)
  const [progress, setProgress] = useState<{ task: RecurringTask; status: "blocked" | "done" } | null>(null);
  const [progressText, setProgressText] = useState("");

  const act = (
    t: RecurringTask,
    status: string,
    opts?: { due?: string; reason?: string; evidence?: string },
  ) =>
    mutation.mutate(
      () =>
        supabase.rpc("update_recurring_task", {
          _task: t.id,
          _status: status,
          _due: (opts?.due ?? null) as unknown as string,
          _reason: (opts?.reason ?? null) as unknown as string,
          _evidence: (opts?.evidence ?? null) as unknown as string,
          ...(review ? { _owner: owner || t.owner_id, _backup: backup || t.backup_id } : {}),
        }),
      {
        onSuccess: () => {
          toast.success("Task updated");
          setReview(null);
          setProgress(null);
          setProgressText("");
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const onStatusPick = (t: RecurringTask, status: string) => {
    if (status === "blocked" || status === "done") {
      setProgress({ task: t, status });
      setProgressText("");
      return;
    }
    act(t, status);
  };

  const submitProgress = () => {
    if (!progress) return;
    const text = progressText.trim();
    if (!text) {
      toast.error(progress.status === "blocked" ? "Add the blocker reason first" : "Add the evidence link first");
      return;
    }
    act(progress.task, progress.status, progress.status === "blocked" ? { reason: text } : { evidence: text });
  };

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const dueInPeriod = tasks.filter((task) => {
    if (period === "monthly") return true;
    if (period === "daily") return task.due_date === todayKey;
    const due = new Date(`${task.due_date}T00:00:00`);
    return due >= weekStart && due <= weekEnd;
  });
  const periodLabel = period === "daily" ? "today" : period === "weekly" ? "this week" : "this month";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-section-title font-semibold">Recurring activity tasks</h3>
          <p className="text-label text-muted-foreground">Showing tasks due {periodLabel}.</p>
        </div>
        <div role="group" aria-label="Recurring task due period" className="inline-flex rounded-lg border border-border bg-card p-1">
          {([ ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"] ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`rounded-md px-3 py-1.5 text-label font-medium transition-colors ${period === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <DataTable
        rows={dueInPeriod}
        emptyMessage={`No recurring tasks due ${periodLabel}.`}
        rowKey={(t) => t.id}
        columns={[
          {
            key: "name",
            header: "Task",
            render: (t) => (
              <>
                <span className="font-medium">
                  {t.name} · {t.stage}
                </span>
                <span className="block text-label text-muted-foreground">
                  {t.hotel} · {t.pipeline}
                </span>
              </>
            ),
          },
          {
            key: "due",
            header: "Due",
            render: (t) => (
              <>
                {t.due_date}
                {t.original_due_date !== t.due_date ? (
                  <span className="block text-label text-muted-foreground">Originally {t.original_due_date}</span>
                ) : null}
              </>
            ),
          },
          {
            key: "owner",
            header: "Owner · backup",
            render: (t) => (
              <>
                {t.owner}
                <span className="block text-label text-muted-foreground">Backup: {t.backup}</span>
              </>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (t) =>
              t.can_edit && !["done", "closed", "superseded", "missed_review"].includes(t.status) ? (
                <Select value={t.status} onValueChange={(v) => onStatusPick(t, v)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {t.status === "missed_review" ? <SelectItem value="missed_review">Missed — review</SelectItem> : null}
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    {t.stage === "approval" ? <SelectItem value="waiting_client">Waiting on client approval</SelectItem> : null}
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <StatusBadge
                  status={t.on_hold ? "on_hold" : t.status === "missed_review" ? "overdue" : t.status}
                  label={t.on_hold ? "On hold" : t.status === "missed_review" ? "Missed — review" : t.status.replaceAll("_", " ")}
                />
              ),
          },
          {
            key: "escalation",
            header: "Escalation",
            render: (t) => <StatusBadge status={t.escalation_level ? "overdue" : "draft"} label={escalationLabel(t.escalation_level ?? 0)} />,
          },
          {
            key: "review",
            header: "Review",
            render: (t) =>
              t.can_review && t.can_edit && !["done", "closed", "superseded"].includes(t.status) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReview(t);
                    setReason("");
                    setDate(t.due_date);
                    setOwner(t.owner_id);
                    setBackup(t.backup_id);
                  }}
                >
                  Review
                </Button>
              ) : (
                (t.review_reason ?? "—")
              ),
          },
        ]}
      />

      <Dialog open={!!progress} onOpenChange={(open) => { if (!open) setProgress(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{progress?.status === "blocked" ? "Mark as blocked" : "Mark as done"}</DialogTitle>
          </DialogHeader>
          <FormSection title={progress?.task.name ?? "Task"}>
            <Label htmlFor="progress-text">
              {progress?.status === "blocked" ? "Blocker reason (required)" : "Evidence link (required)"}
            </Label>
            {progress?.status === "blocked" ? (
              <Textarea id="progress-text" value={progressText} onChange={(e) => setProgressText(e.target.value)} placeholder="What is blocking this task?" />
            ) : (
              <Input id="progress-text" value={progressText} onChange={(e) => setProgressText(e.target.value)} placeholder="https://… link to the finished work" />
            )}
            <Button disabled={!progressText.trim() || mutation.isPending} onClick={submitProgress}>
              {progress?.status === "blocked" ? "Save blocker" : "Save and mark done"}
            </Button>
          </FormSection>
        </DialogContent>
      </Dialog>

      <Dialog open={!!review} onOpenChange={(open) => { if (!open) setReview(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{review?.status === "missed_review" ? "Missed — review" : "Task assignments"}</DialogTitle>
          </DialogHeader>
          <FormSection title={review?.name ?? "Task"}>
            <Label htmlFor="recurring-reason">Reason</Label>
            <Textarea id="recurring-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {(["owner", "backup"] as const).map((field) => (
              <div key={field} className="space-y-2">
                <Label>{field === "owner" ? "Owner" : "Backup"}</Label>
                <Select value={field === "owner" ? owner : backup} onValueChange={field === "owner" ? setOwner : setBackup}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {review?.people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Label htmlFor="recurring-date">New due date</Label>
            <Input id="recurring-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex gap-2">
              <Button
                disabled={review?.status !== "missed_review" || !reason.trim() || !date || mutation.isPending}
                onClick={() => {
                  if (review) act(review, "not_started", { due: date, reason });
                }}
              >
                Reschedule
              </Button>
              <Button
                variant="outline"
                disabled={!reason.trim() || mutation.isPending}
                onClick={() => {
                  if (review) act(review, review.status === "missed_review" ? "closed" : review.status, { reason });
                }}
              >
                {review?.status === "missed_review" ? "Close with reason" : "Save assignments"}
              </Button>
            </div>
          </FormSection>
        </DialogContent>
      </Dialog>
    </section>
  );
}
