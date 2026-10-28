import { quickStatusError } from "@/lib/form-rules";
import { isGateLocked } from "@/lib/task-locks";
import { useActivityWorkspace } from "@/lib/activity-plans";
import { RecurringTasks } from "@/components/RecurringTasks";
import { BlockedTasks } from "@/components/BlockedTasks";
import { InfluencerPrograms } from "@/components/InfluencerPrograms";
import { monthKey } from "@/lib/kpi";
import { demoIn } from "@/lib/demo";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveStaff } from "@/lib/staff";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskSheet, type BoardTask } from "@/components/TaskSheet";
import { TASK_CHIP, TASK_STATUSES, TASK_STATUS_LABEL, fmtDate, isOverdue } from "@/lib/launch";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/MetricCard";
import { SegmentedPill } from "@/components/SegmentedPill";
import { CardSkeleton, QueryError } from "@/components/Skeletons";
import { Board, BoardColumn, Chip, Legend, ProgressBar, TaskCard, type ColumnTone } from "@/components/tasks/TaskBoard";
import { useViewPref } from "@/hooks/use-view-pref";
import { shareOf } from "@/lib/task-board";

export const Route = createFileRoute("/_authenticated/my-tasks")({
  head: () => ({
    meta: [
      { title: "My Tasks — Alcor North Star" },
      { name: "description", content: "Your launch tasks across every hotel — overdue, this week, waiting on client and done." },
      { property: "og:title", content: "My Tasks — Alcor North Star" },
      { property: "og:description", content: "Your launch tasks across every hotel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyTasks,
});

type Row = BoardTask & {
  locked: boolean;
  client_launches: { status: string; clients: { hotel_name: string } | null } | null;
};

function MyTasks() {
  const { user } = useAuth();
  const activity = useActivityWorkspace(monthKey(), undefined, undefined, true);
  const qc = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [openDone, setOpenDone] = useState(false);
  const [focus, setFocus] = useState<"all" | GroupKey>("all");
  const [showAllDone, setShowAllDone] = useState(false);
  const [view, setView] = useViewPref("my-tasks");
  const show = (k: GroupKey) => focus === "all" || focus === k;

  const tasks = useQuery({
    queryKey: ["my-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("client_tasks")
        .select("id, launch_id, module_code, code, name, standard, week_label, week_due, due_date, status, assignee_id, backup_id, evidence_url, notes, blocker_reason, blocker_impact, escalation_level, requires_client_approval, client_approved_at, carried_from_task_id, phase_code, client_launches!inner(status, clients(hotel_name))").not("client_id", "in", demoIn())
        .or(`assignee_id.eq.${user.id},backup_id.eq.${user.id}`)
        .in("client_launches.status", ["active", "live", "offboarding"])
        .order("due_date");
      if (error) throw error;
      const list = data as unknown as Row[];
      if (!list.length) return [];
      // QA-10: one call for every task's Gate A lock; a failure keeps the list (shown unlocked-unknown → locked for safety).
      const { data: locks, error: lockErr } = await supabase.rpc("tasks_gate_a_locked", { _tasks: list.map((t) => t.id) });
      const lockMap = new Map((locks ?? []).map((l: { task_id: string; locked: boolean }) => [l.task_id, l.locked]));
      return list.map((task) => ({ ...task, locked: isGateLocked(lockMap, task.id, Boolean(lockErr)) }));
    },
  });

  const staff = useQuery({
    queryKey: ["staff-names"],
    queryFn: fetchActiveStaff,
  });

  const phases = useQuery({
    queryKey: ["launch-phases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("launch_phases").select("code, name");
      if (error) throw error;
      return new Map(data.map((p) => [p.code, `${p.code} · ${p.name}`]));
    },
  });
  const phaseName = (code: string | null | undefined) => (code ? phases.data?.get(code) : undefined);

  const rows = tasks.data ?? [];
  const open = rows.filter((t) => t.status !== "done" && t.status !== "not_applicable");
  // A task appears in exactly one group: waiting-on-client wins over the due-date groups.
  const actionable = open.filter((t) => t.status !== "waiting_client");
  const groups = {
    overdue: actionable.filter((t) => isOverdue(t)),
    thisWeek: actionable.filter((t) => !isOverdue(t) && t.due_date <= plusDays(7)),
    waiting: open.filter((t) => t.status === "waiting_client"),
    later: actionable.filter((t) => t.due_date > plusDays(7)),
    done: rows.filter((t) => t.status === "done" || t.status === "not_applicable"),
  };
  const openTask = rows.find((t) => t.id === taskId) ?? null;

  async function setStatus(t: Row, status: string) {
    const rule = quickStatusError(t, status);
    if (rule) {
      toast.error(rule);
      return;
    }
    const { error } = await supabase.from("client_tasks").update({ status }).eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${t.code}: ${TASK_STATUS_LABEL[status]}`);
    qc.invalidateQueries({ queryKey: ["my-tasks"] });
    qc.invalidateQueries({ queryKey: ["launch-tasks", t.launch_id] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" description="Everything assigned to you across live launches." />
      {tasks.error ? <QueryError error={tasks.error} what="your tasks" /> : null}
      {tasks.isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : rows.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {COUNT_CARDS.map((c) => {
            const n = c.key === "all" ? rows.length : groups[c.key].length;
            const active = c.key !== "all" && focus === c.key;
            return (
              <button key={c.key} type="button" onClick={() => setFocus(active ? "all" : c.key)} aria-pressed={active} className={cn("rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring", active && "ring-2 ring-gold")}>
                <MetricCard id={`mytasks-${c.key}`} className="h-full" label={c.label} value={n} tone={c.tone} footer={c.key === "all" ? "Across your hotels" : `${shareOf(n, rows.length)}% of your tasks`} />
              </button>
            );
          })}
        </div>
      ) : null}
      {!tasks.isLoading && !rows.length ? (
        <EmptyState title="Nothing assigned to you right now." />
      ) : null}
      {rows.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedPill ariaLabel="Task view" value={view} onChange={setView} items={[{ value: "list", label: "List" }, { value: "board", label: "Board" }]} />
          <SegmentedPill
            ariaLabel="Task group"
            value={focus}
            onChange={(v) => setFocus(focus === v ? "all" : (v as GroupKey))}
            items={BOARD_COLS.map((c) => ({ value: c.key, label: c.label, count: groups[c.key].length }))}
          />
          {focus !== "all" ? <button type="button" className="text-label text-primary hover:underline" onClick={() => setFocus("all")}>Show all groups</button> : null}
        </div>
      ) : null}
      {rows.length && view === "board" ? (
        <>
          <Board>
            {BOARD_COLS.filter((c) => focus === "all" || focus === c.key).map((c) => {
              const list = c.key === "done" ? groups.done.slice(0, showAllDone ? undefined : 5) : groups[c.key];
              return (
                <BoardColumn key={c.key} title={c.label} count={groups[c.key].length} tone={c.tone}
                  footer={c.key === "done" && groups.done.length > 5 ? <button type="button" className="w-full text-center text-label text-primary hover:underline" onClick={() => setShowAllDone((v) => !v)}>{showAllDone ? "Show fewer" : `View all (${groups.done.length})`}</button> : undefined}>
                  {list.map((t) => (
                    <TaskCard key={t.id} code={t.code} title={t.name} subtitle={t.client_launches?.clients?.hotel_name} due={fmtDate(t.due_date)} status={t.status} overdue={c.key === "overdue"} locked={t.locked} onOpen={() => setTaskId(t.id)}
                      chips={<Chip className={TASK_CHIP[t.status]}>{TASK_STATUS_LABEL[t.status] ?? t.status}</Chip>} />
                  ))}
                </BoardColumn>
              );
            })}
          </Board>
          <Legend items={BOARD_COLS.map((c) => ({ label: c.label, tone: c.tone }))} />
        </>
      ) : null}
      {rows.length && view === "list" ? (
        <>
          {show("overdue") ? <Group title="Overdue" rows={groups.overdue} tone="text-destructive" overdue onPick={setTaskId} onStatus={setStatus} phaseName={phaseName} /> : null}
          {show("thisWeek") ? <Group title="This week" rows={groups.thisWeek} onPick={setTaskId} onStatus={setStatus} phaseName={phaseName} /> : null}
          {show("waiting") ? <Group title="Waiting on client" rows={groups.waiting} onPick={setTaskId} onStatus={setStatus} phaseName={phaseName} /> : null}
          {show("later") ? <Group title="Later" rows={groups.later} onPick={setTaskId} onStatus={setStatus} phaseName={phaseName} /> : null}
          {show("done") ? (
            <section className="space-y-2">
              <button onClick={() => setOpenDone((v) => !v)} className="flex items-center gap-1.5 text-section-title font-semibold">
                {openDone || focus === "done" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Done <span className="text-sm text-muted-foreground">({groups.done.length})</span>
              </button>
              {openDone || focus === "done" ? <Group title="" rows={groups.done} onPick={setTaskId} onStatus={setStatus} bare phaseName={phaseName} /> : null}
            </section>
          ) : null}
        </>
      ) : null}
      <BlockedTasks />
      <RecurringTasks tasks={activity.data?.tasks ?? []} />
      <TaskSheet task={openTask} staff={staff.data ?? []} canEditPlan={false} onClose={() => setTaskId(null)} invalidateKeys={[["my-tasks"]]} />
      <InfluencerPrograms mine />
    </div>
  );
}

type GroupKey = "overdue" | "thisWeek" | "waiting" | "later" | "done";
const COUNT_CARDS: Array<{ key: "all" | GroupKey; label: string; tone: "default" | "gold" | "success" | "danger" }> = [
  { key: "all", label: "Total tasks", tone: "default" },
  { key: "overdue", label: "Overdue", tone: "danger" },
  { key: "thisWeek", label: "Due this week", tone: "gold" },
  { key: "waiting", label: "Waiting on client", tone: "default" },
  { key: "done", label: "Done", tone: "success" },
];
const BOARD_COLS: Array<{ key: GroupKey; label: string; tone: ColumnTone }> = [
  { key: "overdue", label: "Overdue", tone: "danger" },
  { key: "thisWeek", label: "This week", tone: "navy" },
  { key: "waiting", label: "Waiting on client", tone: "warning" },
  { key: "later", label: "Later", tone: "muted" },
  { key: "done", label: "Done", tone: "success" },
];

function plusDays(d: number): string {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

type GRow = Row;
function Group({ title, rows, tone, onPick, onStatus, bare, phaseName, overdue = false }: {
  title: string; rows: GRow[]; tone?: string; bare?: boolean; overdue?: boolean;
  onPick: (id: string) => void;
  onStatus: (t: GRow, s: string) => void;
  phaseName: (code: string | null | undefined) => string | undefined;
}) {
  if (!rows.length && !bare) return null;
  return (
    <section className="space-y-2">
      {title ? <h2 className={cn("text-section-title font-semibold", tone)}>{title} <span className="text-small text-muted-foreground">({rows.length})</span></h2> : null}
      {rows.length ? (
        <DataTable<GRow>
          rows={rows}
          rowKey={(t) => t.id}
          columns={[
            {
              key: "hotel",
              header: "Hotel",
              render: (t) => <span className="font-medium">{t.client_launches?.clients?.hotel_name}</span>,
            },
            {
              key: "task",
              header: "Task",
              render: (t) => (
                <>
                  <button onClick={() => onPick(t.id)} className="text-left hover:underline">
                    <span className="text-muted-foreground">{t.code}</span> · {t.name}
                  </button>
                  {t.locked ? <p className="text-label text-warning-foreground">Locked: waiting for Gate A</p> : null}
                  {phaseName(t.phase_code) ? <p className="text-label text-muted-foreground">{phaseName(t.phase_code)}</p> : null}
                </>
              ),
            },
            {
              key: "due",
              header: "Due",
              render: (t) => <span className="whitespace-nowrap text-muted-foreground">{fmtDate(t.due_date)}</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (t) => (
                <Select disabled={t.locked} value={t.status} onValueChange={(v) => onStatus(t, v)}>
                  <SelectTrigger className="h-7 w-40 text-label" aria-label={`Status for ${t.code}`}>
                    <StatusBadge status={t.status} label={TASK_STATUS_LABEL[t.status] ?? t.status} />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ),
            },
            {
              key: "progress",
              header: "Progress",
              render: (t) => <div className="w-32"><ProgressBar status={t.status} overdue={overdue} /></div>,
            },
            {
              key: "board",
              header: "",
              align: "right",
              render: (t) => (
                <Link to="/launches/$launchId" params={{ launchId: t.launch_id }} className="text-label text-primary hover:underline">
                  Launch board
                </Link>
              ),
            },
          ]}
        />
      ) : (
        <p className="text-small text-muted-foreground">Nothing here.</p>
      )}
    </section>
  );
}
