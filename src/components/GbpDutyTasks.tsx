import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { monthKey } from "@/lib/kpi";
import { useActivityWorkspace, useActivityMutation } from "@/lib/activity-plans";
import { RecurringTasks } from "@/components/RecurringTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FREQUENCIES = [
  { value: "one_off", label: "One-off" },
  { value: "daily", label: "Daily (Mon–Sat)" },
  { value: "weekly", label: "Weekly (due Saturday)" },
  { value: "twice_monthly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
  { value: "ongoing", label: "On-going (no fixed deadline)" },
] as const;

/**
 * Duty tasks for one client pipeline: staff create tasks (one-off or recurring,
 * Mon–Sat calendar) and log progress. Uses the Q33 activity-plan model — tasks
 * are generated from duty templates into recurring_tasks, never a parallel system.
 */
export function GbpDutyTasks({
  clientPipelineId,
  clientId,
  pipelineId,
  code,
}: {
  clientPipelineId: string;
  clientId: string;
  pipelineId: string;
  code: string;
}) {
  const month = monthKey();
  const { data: ws } = useActivityWorkspace(month, clientId, code);
  const mutation = useActivityMutation();
  const [form, setForm] = useState({
    title: "",
    details: "",
    owner_id: "",
    backup_id: "",
    frequency: "one_off",
    due_date: "",
    count_target: "",
  });

  const people =
    ws?.pipelines.find((p) => p.id === clientPipelineId)?.people ??
    ws?.pipelines.flatMap((p) => p.people) ??
    [];

  const create = () =>
    mutation.mutate(
      async () => {
        if (!form.title.trim()) throw new Error("Give the task a title");
        if (!form.owner_id) throw new Error("Choose an owner");
        const { error } = await supabase.from("staff_duty_templates").insert({
          pipeline_id: pipelineId,
          anchor_client_pipeline_id: clientPipelineId,
          owner_id: form.owner_id,
          backup_id: form.backup_id || null,
          title: form.title.trim(),
          details: form.details.trim() || null,
          frequency: form.frequency,
          due_date: form.frequency === "one_off" && form.due_date ? form.due_date : null,
          count_target: form.count_target ? Number(form.count_target) : null,
        });
        if (error) return { error };
        // Materialise the first occurrence(s) straight away (current month, or the due month for one-off tasks).
        const genMonth =
          form.frequency === "one_off" && form.due_date
            ? `${form.due_date.slice(0, 7)}-01`
            : month;
        return supabase.rpc("generate_staff_duties", { _month: genMonth });
      },
      {
        onSuccess: () => {
          toast.success("Task created");
          setForm({ title: "", details: "", owner_id: "", backup_id: "", frequency: "one_off", due_date: "", count_target: "" });
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <section className="card-surface space-y-5 p-5">
      <div>
        <h2 className="text-section-title font-semibold">GMB SEO tasks</h2>
        <p className="text-label text-muted-foreground">
          Create one-off or repeating tasks and log progress. Repeating tasks follow the Mon–Sat working calendar; the hotel owner never sees these.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="duty-title">Task title</Label>
          <Input
            id="duty-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Reply to all new reviews"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Frequency</Label>
          <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Owner</Label>
          <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Choose owner" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Backup</Label>
          <Select value={form.backup_id} onValueChange={(v) => setForm({ ...form, backup_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.frequency === "one_off" ? (
          <div className="space-y-1.5">
            <Label htmlFor="duty-due">Due date</Label>
            <Input
              id="duty-due"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="duty-count">Count target (optional)</Label>
            <Input
              id="duty-count"
              inputMode="numeric"
              value={form.count_target}
              onChange={(e) => setForm({ ...form, count_target: e.target.value })}
              placeholder="e.g. 4 per profile"
            />
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="duty-details">Details (optional)</Label>
          <Textarea
            id="duty-details"
            rows={2}
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
          />
        </div>
      </div>
      <Button onClick={create} disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : "Create task"}
      </Button>

      {ws && ws.tasks.length > 0 ? <RecurringTasks tasks={ws.tasks} /> : null}
    </section>
  );
}
