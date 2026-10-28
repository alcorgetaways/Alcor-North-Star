import { evidenceUrlError } from "@/lib/form-rules";
import { openEvidenceUrl } from "@/lib/evidence";
import { fetchActiveStaff } from "@/lib/staff";
import { ConfirmButton } from "@/components/ConfirmButton";
import { todayIST } from "@/lib/launch";
import { useAuth } from "@/hooks/useAuth";
import { ImportedIssuesPanel } from "@/components/BdPanels";
import { HelpPanel } from "@/components/HelpPanel";
import { demoIn } from "@/lib/demo";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS } from "@/lib/constants";
import { MetricCard } from "@/components/MetricCard";
import { SegmentedPill } from "@/components/SegmentedPill";
import { Board, BoardColumn, Chip, Legend, PRIORITY_CHIP, TaskCard, type ColumnTone } from "@/components/tasks/TaskBoard";
import { useViewPref } from "@/hooks/use-view-pref";
import { actionColumn, actionCounts, completedByMonth, istMonthOf, shareOf, type ActionColumn } from "@/lib/task-board";

export const Route = createFileRoute("/_authenticated/actions")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Action Tracker — Alcor North Star" },
      {
        name: "description",
        content: "Every open issue, owner and due date across the hotel portfolio.",
      },
      { property: "og:title", content: "Action Tracker — Alcor North Star" },
      { property: "og:description", content: "Open issues, owners and due dates." },
    ],
  }),
  component: ActionsPage,
});

const PRIORITY_TONE = PRIORITY_CHIP;
const BOARD_COLS: Array<{ key: ActionColumn; label: string; tone: ColumnTone }> = [
  { key: "high", label: "High priority", tone: "danger" },
  { key: "medium", label: "Medium priority", tone: "warning" },
  { key: "low", label: "Low priority", tone: "success" },
  { key: "completed", label: "Completed", tone: "muted" },
];

type ActionRow = {
  id: string;
  client_id: string;
  pipeline_id: string | null;
  issue: string;
  action_required: string | null;
  comments: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  evidence_url: string | null;
  drop_reason: string | null;
  link_ref: string | null;
  responsible_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  clients: { hotel_name: string } | null;
  pipelines: { name: string } | null;
  profiles: { full_name: string } | null;
};

const EMPTY_CREATE = {
  client_id: "",
  pipeline_id: "",
  issue: "",
  action_required: "",
  responsible_id: "",
  priority: "medium",
  due_date: "",
  link_ref: "",
};

function isOverdue(a: ActionRow): boolean {
  return Boolean(a.due_date) && a.due_date! < todayIST() && !["completed", "dropped"].includes(a.status);
}

function ActionsPage() {
  const { user, isManager: isManagerForIssues } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState(EMPTY_CREATE);
  const [complete, setComplete] = useState<{ id: string; status: "completed" | "dropped" } | null>(null);
  const [completeText, setCompleteText] = useState("");
  const [completeUploaded, setCompleteUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [view, setView] = useViewPref("actions");

  const { data = [] } = useQuery({
    queryKey: ["actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_items")
        .select(
          "id, client_id, pipeline_id, issue, action_required, comments, status, priority, due_date, evidence_url, drop_reason, link_ref, responsible_id, completed_at, completed_by, clients(hotel_name), pipelines(name), profiles:responsible_id(full_name)",
        ).not("client_id", "in", demoIn())
        .order("status")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as unknown as ActionRow[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["actions-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, hotel_name")
        .not("id", "in", demoIn())
        .order("hotel_name");
      if (error) throw error;
      return data as Array<{ id: string; hotel_name: string }>;
    },
  });

  const { data: pipelines = [] } = useQuery({
    queryKey: ["actions-pipelines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["actions-staff"],
    queryFn: fetchActiveStaff,
  });

  const update = useMutation({
    mutationFn: async (v: { id: string; status: string; evidence_url?: string; drop_reason?: string }) => {
      const { error } = await supabase
        .from("action_items")
        .update({
          status: v.status as never,
          ...(v.evidence_url !== undefined ? { evidence_url: v.evidence_url } : {}),
          ...(v.drop_reason !== undefined ? { drop_reason: v.drop_reason } : {}),
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Action updated");
      setComplete(null);
      setCompleteText("");
      qc.invalidateQueries({ queryKey: ["actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!create.client_id) throw new Error("Choose a hotel");
      if (!create.issue.trim()) throw new Error("Describe the issue");
      const { error } = await supabase.from("action_items").insert({
        client_id: create.client_id,
        pipeline_id: create.pipeline_id || null,
        issue: create.issue.trim(),
        action_required: create.action_required.trim() || null,
        responsible_id: create.responsible_id || null,
        priority: create.priority as never,
        due_date: create.due_date || null,
        link_ref: create.link_ref.trim() || null,
        status: "not_started",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Action added");
      setCreateOpen(false);
      setCreate(EMPTY_CREATE);
      qc.invalidateQueries({ queryKey: ["actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onStatusPick = (a: ActionRow, status: string) => {
    if (status === "completed" || status === "dropped") {
      setComplete({ id: a.id, status });
      setCompleteText("");
      setCompleteUploaded(false);
      return;
    }
    update.mutate({ id: a.id, status });
  };

  const uploadEvidence = async (file: File) => {
    if (!complete) return;
    const action = data.find((a) => a.id === complete.id);
    if (!action) { toast.error("Action not found"); return; }
    const extension = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    setUploading(true);
    try {
      const path = `${action.client_id}/action-evidence/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("client-files").upload(path, file, { contentType: file.type });
      if (error) { toast.error(error.message); return; }
      setCompleteText(path);
      setCompleteUploaded(true);
      toast.success("Evidence file attached");
    } finally {
      setUploading(false);
    }
  };

  const openEvidence = async (value: string) => {
    const url = await openEvidenceUrl(value);
    if (!url) { toast.error("Could not open the file"); return; }
    window.open(url, "_blank", "noopener");
  };

  const submitComplete = async () => {
    if (!complete) return false;
    const text = completeText.trim();
    if (!text) {
      toast.error(complete.status === "completed" ? "Add the evidence link or file first" : "Add the drop reason first");
      return false;
    }
    if (complete.status === "completed" && !completeUploaded) { const error = evidenceUrlError(text); if (error) { toast.error(error); return false; } }
    await update.mutateAsync(
      complete.status === "completed"
        ? { id: complete.id, status: "completed", evidence_url: text }
        : { id: complete.id, status: "dropped", drop_reason: text },
    );
    return true;
  };

  const thisMonth = todayIST().slice(0, 7);
  const staffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? "Unknown" : null);
  const completedLine = (a: ActionRow) =>
    a.status !== "completed"
      ? null
      : a.completed_at
        ? `Completed ${new Date(a.completed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}${staffName(a.completed_by) ? ` by ${staffName(a.completed_by)}` : ""}`
        : "Completion date not recorded";
  const ownerOptions = Array.from(new Map(data.filter((a) => a.responsible_id).map((a) => [a.responsible_id!, a.profiles?.full_name ?? "Unknown"])).entries());
  const filtered = data.filter((a) => {
    if (filterOwner !== "all" && a.responsible_id !== filterOwner) return false;
    if (filterClient !== "all" && a.client_id !== filterClient) return false;
    if (filterStatus === "completed_month") return a.status === "completed" && !!a.completed_at && istMonthOf(a.completed_at) === thisMonth;
    if (filterStatus === "open" && ["completed", "dropped"].includes(a.status)) return false;
    if (filterStatus !== "all" && filterStatus !== "open" && a.status !== filterStatus) return false;
    return true;
  });

  const today = todayIST();
  const boardRows = data.filter((a) => (filterOwner === "all" || a.responsible_id === filterOwner) && (filterClient === "all" || a.client_id === filterClient));
  const counts = actionCounts(boardRows, today);
  const monthDone = completedByMonth(boardRows, thisMonth);
  const monthLabel = new Date(`${thisMonth}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action Tracker"
        description="Issues raised in monthly reviews, who owns them and when they are due."
        actions={<Button onClick={() => setCreateOpen(true)}>New action</Button>}
      />


      <p className="text-sm font-semibold text-destructive">{data.filter(isOverdue).length} overdue actions</p>
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="completed_month">Completed this month</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOwner} onValueChange={setFilterOwner}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="All owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {ownerOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder="All hotels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All hotels</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.hotel_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button type="button" className="block w-full text-left" onClick={() => setFilterStatus("completed_month")} aria-label="Show actions completed this month">
        <MetricCard id="act-month" hero label={`Completed in ${monthLabel}`} value={monthDone.current} tone="success"
          footer={`${monthDone.delta >= 0 ? "+" : ""}${monthDone.delta} vs last month (${monthDone.previous}) · IST month`} />
      </button>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard id="act-open" label="Open actions" value={counts.open} footer={`${shareOf(counts.open, counts.total)}% of all`} />
        <MetricCard id="act-high" label="High priority" value={counts.high} tone="danger" footer={`${shareOf(counts.high, counts.open)}% of open`} />
        <MetricCard id="act-overdue" label="Overdue" value={counts.overdue} tone="danger" footer={`${shareOf(counts.overdue, counts.open)}% of open`} />
        <MetricCard id="act-done" label="Completed" value={counts.completed} tone="success" footer={`${shareOf(counts.completed, counts.total)}% of all`} />
        <MetricCard id="act-dropped" label="Dropped" value={counts.dropped} footer="Kept with a reason" />
      </div>

      <SegmentedPill ariaLabel="Action view" value={view} onChange={setView} items={[{ value: "list", label: "List" }, { value: "board", label: "Board" }]} />

      {view === "board" ? (
        <>
          <Board>
            {BOARD_COLS.map((c) => {
              const list = boardRows.filter((a) => actionColumn(a) === c.key);
              return (
                <BoardColumn key={c.key} title={c.label} count={list.length} tone={c.tone}
                  footer={c.key !== "completed" ? <button type="button" className="w-full text-center text-label font-medium text-primary hover:underline" onClick={() => { setCreate({ ...EMPTY_CREATE, priority: c.key }); setCreateOpen(true); }}>+ Add action</button> : undefined}>
                  {list.map((a) => (
                    <TaskCard key={a.id} title={a.issue} subtitle={`${a.clients?.hotel_name ?? ""}${a.pipelines?.name ? ` · ${a.pipelines.name}` : ""}`}
                      due={a.due_date ? new Date(a.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null}
                      status={a.status} overdue={isOverdue(a)} owner={a.profiles?.full_name ?? null}
                      chips={<><Chip className={PRIORITY_CHIP[a.priority]}>{ACTION_PRIORITY_LABELS[a.priority] ?? a.priority}</Chip>{isOverdue(a) ? <Chip className="border-destructive/40 bg-destructive/12 text-destructive">Overdue</Chip> : null}</>}
                      footer={a.status !== "completed" ? (
                        <Select value={a.status} onValueChange={(v) => onStatusPick(a, v)}>
                          <SelectTrigger className="h-7 text-label" aria-label={`Status for ${a.issue}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <div className="space-y-1"><p className="text-label text-muted-foreground">{completedLine(a)}</p>{a.evidence_url ? <button type="button" onClick={() => void openEvidence(a.evidence_url!)} className="text-label text-primary underline">Evidence</button> : null}</div>} />
                  ))}
                </BoardColumn>
              );
            })}
          </Board>
          <Legend items={BOARD_COLS.map((c) => ({ label: c.label, tone: c.tone }))} />
        </>
      ) : null}

      {view === "list" ? <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState title="No actions match these filters." />
        ) : (
          filtered.map((a) => {
            const overdue = isOverdue(a);
            return (
              <div key={a.id} className={`card-surface p-5 ${overdue ? "border-destructive/50" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={PRIORITY_TONE[a.priority]}>
                        {ACTION_PRIORITY_LABELS[a.priority] ?? a.priority}
                      </Badge>
                      {overdue ? (
                        <Badge variant="outline" className="bg-destructive/12 text-destructive border-destructive/30">
                          Overdue
                        </Badge>
                      ) : null}
                      <span className="text-label text-muted-foreground">
                        {a.clients?.hotel_name}
                        {a.pipelines?.name ? ` · ${a.pipelines.name}` : ""}
                      </span>
                    </div>
                    <p className="mt-2 font-medium">{a.issue}</p>
                    {a.action_required ? (
                      <p className="mt-1 text-small text-muted-foreground">{a.action_required}</p>
                    ) : null}
                    {a.link_ref ? (
                      <p className="mt-1 text-label text-muted-foreground">Linked: {a.link_ref}</p>
                    ) : null}
                    {a.evidence_url ? (
                      <p className="mt-1 text-label">
                        Evidence:{" "}
                        <button type="button" onClick={() => void openEvidence(a.evidence_url!)} className="text-primary underline">
                          {/^https?:/i.test(a.evidence_url) ? a.evidence_url : "Open attached file"}
                        </button>
                      </p>
                    ) : null}
                    {completedLine(a) ? <p className="mt-1 text-label text-muted-foreground">{completedLine(a)}</p> : null}
                    {a.drop_reason ? (
                      <p className="mt-1 text-label text-muted-foreground">Dropped: {a.drop_reason}</p>
                    ) : null}
                    <p className="mt-2 text-label text-muted-foreground">
                      Owner: {a.profiles?.full_name ?? "Unassigned"}
                      {a.due_date
                        ? ` · Due ${new Date(a.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                        : ""}
                    </p>
                  </div>
                  <Select value={a.status} onValueChange={(v) => onStatusPick(a, v)}>
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })
        )}
      </div> : null}

      <details><summary className="cursor-pointer text-sm font-medium">Action Tracker help</summary><HelpPanel
        title="How the Action Tracker works"
        lines={[
          "Anything that needs follow-up — a review reply promised to a hotel, a listing fix, a red KPI month — gets one action here with an owner and a due date.",
          "The owner moves it from Not started to In progress, then Completed with an evidence link (screenshot, file or report).",
          "If work stops, mark it Blocked in the task itself; if an action is no longer needed, drop it with a reason — nothing is ever deleted.",
          "Red-bordered rows are overdue. Use the filters to see just your actions or one hotel.",
          "Link an action to a KPI or red month (e.g. \"GBP calls, Sep 2026\") so the review meeting can trace it back.",
        ]}
      /></details>

      <ImportedIssuesPanel isManager={isManagerForIssues} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              <Select value={create.client_id} onValueChange={(v) => setCreate({ ...create, client_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a hotel" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.hotel_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pipeline (optional)</Label>
              <Select value={create.pipeline_id} onValueChange={(v) => setCreate({ ...create, pipeline_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-issue">Issue</Label>
              <Textarea id="na-issue" rows={2} value={create.issue} onChange={(e) => setCreate({ ...create, issue: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-action">Action required (optional)</Label>
              <Textarea id="na-action" rows={2} value={create.action_required} onChange={(e) => setCreate({ ...create, action_required: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={create.responsible_id} onValueChange={(v) => setCreate({ ...create, responsible_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={create.priority} onValueChange={(v) => setCreate({ ...create, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_PRIORITY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="na-due">Due date (optional)</Label>
                <Input id="na-due" type="date" value={create.due_date} onChange={(e) => setCreate({ ...create, due_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="na-link">Linked KPI / red month (optional)</Label>
                <Input id="na-link" value={create.link_ref} onChange={(e) => setCreate({ ...create, link_ref: e.target.value })} placeholder="e.g. GBP calls, Sep 2026" />
              </div>
            </div>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add action"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!complete} onOpenChange={(open) => { if (!open) setComplete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{complete?.status === "completed" ? "Mark as completed" : "Drop this action"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label htmlFor="complete-text">
              {complete?.status === "completed" ? "Evidence link or file (required)" : "Drop reason (required)"}
            </Label>
            {complete?.status === "completed" ? (
              <div className="space-y-2">
                <Input id="complete-text" value={completeText} onChange={(e) => { setCompleteText(e.target.value); setCompleteUploaded(false); }} placeholder="https://… link to proof of the work" />
                <div className="space-y-1.5">
                  <Label htmlFor="complete-file">Or upload proof (image or PDF)</Label>
                  <Input
                    id="complete-file"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    disabled={uploading || update.isPending}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEvidence(f); e.target.value = ""; }}
                  />
                  {completeUploaded ? <p className="text-label text-muted-foreground">File attached — it will be saved as the evidence.</p> : null}
                </div>
              </div>
            ) : (
              <Textarea id="complete-text" rows={2} value={completeText} onChange={(e) => setCompleteText(e.target.value)} placeholder="Why is this action no longer needed?" />
            )}
            <ConfirmButton onConfirm={submitComplete} doneLabel="Saved" disabled={!completeText.trim() || update.isPending}>Save</ConfirmButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
