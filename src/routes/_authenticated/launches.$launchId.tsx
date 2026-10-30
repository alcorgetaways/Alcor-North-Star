import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LockKeyhole, MoreHorizontal } from "lucide-react";
import { SimpleTextDialog } from "@/components/SimpleTextDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProgressRing } from "@/components/ProgressRing";
import { ExitChecklist } from "@/components/ExitChecklist";
import { ExitTemplateEditor } from "@/components/ExitTemplateEditor";
import { HoldLaunchButton, OnHoldBanner } from "@/components/ClientExtras";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveStaff } from "@/lib/staff";
import { launchPhasesQuery } from "@/lib/launch-phases";
import { logLaunchEvent } from "@/lib/team.functions";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard, KpiStrip } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskSheet, type BoardTask } from "@/components/TaskSheet";
import { isGateLocked } from "@/lib/task-locks";
import {
  GATE_CLASS,
  LAUNCH_STATUS_LABEL,
  TASK_CHIP,
  TASK_STATUS_LABEL,
  fmtDate,
  fmtDateTime,
  isOverdue,
  launchWeek,
  roleLabel,
  todayISO,
} from "@/lib/launch";
import { cn } from "@/lib/utils";
import { historicalBoardTask } from "@/lib/historical-checklist";

export const Route = createFileRoute("/_authenticated/launches/$launchId")({
  head: () => ({
    meta: [
      { title: "Launch board — Alcor North Star" },
      { name: "description", content: "Week-by-week launch checklist, gates and task owners for one hotel." },
      { property: "og:title", content: "Launch board — Alcor North Star" },
      { property: "og:description", content: "Run a hotel's launch: gates, weekly tasks and owners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchBoard,
});

type Gate = {
  id: string;
  gate_code: string;
  gate_name: string;
  due_week: number;
  due_date: string;
  signer_role: string;
  status: string;
  criteria: string[];
  signed_by: string | null;
  signed_at: string | null;
  approval_file_path: string | null;
  notes: string | null;
  phase_code: string | null;
  client_approved_at: string | null;
  approval_method: string | null;
};

function LaunchBoard() {
  const { launchId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, isManager, isBD, isAdmin } = useAuth();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [gateId, setGateId] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [planChangeOpen, setPlanChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const launch = useQuery({
    queryKey: ["launch", launchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id, client_id, plan_id, custom_plan_id, status, day0_date, core_onboarding_due_date, core_onboarding_completed_at, launch_date, exit_date, no_launch_checklist, clients(hotel_name, city), plans(name, duration_weeks, final_gate_code)")
        .eq("id", launchId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string; client_id: string; plan_id: string; custom_plan_id: string | null; status: string; day0_date: string | null;
        launch_date: string | null; exit_date: string | null; no_launch_checklist: boolean;
        core_onboarding_due_date: string | null; core_onboarding_completed_at: string | null;
        clients: { hotel_name: string; city: string | null } | null;
        plans: { name: string; duration_weeks: number; final_gate_code: string } | null;
      } | null;
    },
  });

  const allPlans = useQuery({
    queryKey: ["all-active-plans"],
    enabled: planChangeOpen,
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id, code, name").eq("active", true).order("sort_order");
      if (error) throw error;
      return data as Array<{ id: string; code: string; name: string }>;
    },
  });

  const planId = launch.data?.plan_id;
  const modules = useQuery({
    queryKey: ["plan-modules", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_modules")
        .select("module_code, launch_modules(name, owner_role, client_side, phase_code)")
        .eq("plan_id", planId ?? "");
      if (error) throw error;
      return data as unknown as Array<{ module_code: string; launch_modules: { name: string; owner_role: string; client_side: boolean; phase_code: string | null } | null }>;
    },
  });

  const phases = useQuery(launchPhasesQuery());
  // A stale or malformed cached value must never take down the launch page.
  const phaseRows = Array.isArray(phases.data) ? phases.data : [];

  const tasks = useQuery({
    queryKey: ["launch-tasks", launchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("id, launch_id, module_code, code, name, standard, week_label, week_due, due_date, status, assignee_id, backup_id, evidence_url, notes, requires_client_approval, client_approved_at, carried_from_task_id, blocker_reason, blocker_impact, escalation_level, gate_a_override_at, sort_order, phase_code")
        .eq("launch_id", launchId)
        .eq("phase", "onboarding")
        .order("sort_order");
      if (error) throw error;
      return data as BoardTask[];
    },
  });

  const gates = useQuery({
    queryKey: ["launch-gates", launchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_gates").select("*").eq("launch_id", launchId).order("due_week");
      if (error) throw error;
      return data as Gate[];
    },
  });

  const exitTasksQ = useQuery({
    queryKey: ["launch-exit-tasks", launchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("id, launch_id, client_id, module_code, code, name, standard, week_label, week_due, due_date, status, assignee_id, backup_id, evidence_url, notes, requires_client_approval, client_approved_at, carried_from_task_id, blocker_reason, blocker_impact, escalation_level, gate_a_override_at, sort_order, phase_code")
        .eq("launch_id", launchId)
        .eq("phase", "offboarding")
        .eq("exit_withdrawn", false)
        .order("due_date");
      if (error) throw error;
      return data as BoardTask[];
    },
  });

  const assignments = useQuery({
    queryKey: ["launch-assignments", launchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_module_assignments")
        .select("module_code, primary_user_id, backup_user_id")
        .eq("launch_id", launchId);
      if (error) throw error;
      return data;
    },
  });

  const staff = useQuery({
    queryKey: ["staff-names"],
    queryFn: fetchActiveStaff,
  });

  const mine = (assignments.data ?? []).filter((a) => a.primary_user_id === user?.id || a.backup_user_id === user?.id);
  const isAM = mine.some((a) => a.module_code === "AM");
  const canEditPlan = isManager || isAM;
  const ownerRoleOf = (code: string) => modules.data?.find((m) => m.module_code === code)?.launch_modules;
  const canSign = (g: Gate) =>
    g.gate_code === "gate_a" ? isBD : isManager || mine.some((a) => { const lm = ownerRoleOf(a.module_code); return lm?.owner_role === g.signer_role && !lm.client_side; });

  const historicalTasks = useQuery({
    queryKey: ["historical-launch-tasks", launchId],
    enabled: launch.data?.no_launch_checklist === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("historical_launch_tasks").select("*").eq("launch_id", launchId).order("sort_order");
      if (error) throw error;
      return (data ?? []).map(historicalBoardTask);
    },
  });
  const historicalIds = new Set((historicalTasks.data ?? []).map(t => t.id));
  const taskList = useMemo(() => [...(tasks.data ?? []), ...(historicalTasks.data ?? [])], [tasks.data, historicalTasks.data]);
  const taskLocks = useQuery({ queryKey: ["launch-task-locks", launchId, (tasks.data ?? []).map((t) => t.id).join(",")], enabled: (tasks.data ?? []).length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc("tasks_gate_a_locked", { _tasks: (tasks.data ?? []).map((t) => t.id) });
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.task_id, row.locked]));
  }});
  // QA-22: the lock chip comes from the same helper as /my-tasks; a failed check fails closed.
  const taskLocked = (id: string) => !historicalIds.has(id) && isGateLocked(taskLocks.data, id, taskLocks.isError);
  const exitTasks = exitTasksQ.data ?? [];
  const openExitCount = exitTasks.filter((t) => t.status !== "done").length;
  const maxWeek = Math.max(0, ...taskList.map((t) => t.week_due));
  void maxWeek;
  // Onboarding is shown as ordered steps; roadmap week numbers stay on each task.
  const weeks = [...new Set(taskList.map((t) => t.week_due))].sort((a, b) => a - b);
  const done = taskList.filter((t) => t.status === "done" || t.status === "not_applicable").length;
  const pct = taskList.length ? Math.round((done / taskList.length) * 100) : 0;
  const byCell = useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const t of taskList) {
      const ph = t.phase_code ?? modules.data?.find((x) => x.module_code === t.module_code)?.launch_modules?.phase_code ?? "";
      const k = `${ph}:${t.module_code}:${t.week_due}`;
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [taskList, modules.data]);

  // Top grouping P0–P9; rows are (phase, module) pairs so a module whose tasks span
  // two phases (e.g. brand work vs website/CRO) appears under each phase.
  const phaseGroups = useMemo(() => {
    const order = new Map(phaseRows.map((p) => [p.code, p.sort_order]));
    const nameOf = (code: string) => modules.data?.find((m) => m.module_code === code)?.launch_modules?.name ?? code;
    const seen = new Map<string, { phase: string; module: string }>();
    for (const t of taskList) {
      const ph = t.phase_code ?? modules.data?.find((x) => x.module_code === t.module_code)?.launch_modules?.phase_code ?? "";
      const k = `${ph}|${t.module_code}`;
      if (!seen.has(k)) seen.set(k, { phase: ph, module: t.module_code });
    }
    const rows = [...seen.values()].sort((a, b) =>
      (order.get(a.phase) ?? 99) - (order.get(b.phase) ?? 99) || nameOf(a.module).localeCompare(nameOf(b.module)));
    const groups: Array<{ phase: string; rows: string[] }> = [];
    for (const r of rows) {
      const g = groups[groups.length - 1];
      if (g && g.phase === r.phase) g.rows.push(r.module);
      else groups.push({ phase: r.phase, rows: [r.module] });
    }
    return groups;
  }, [taskList, modules.data, phaseRows]);

  const l = launch.data;
  const coreGateSigned = (gates.data ?? []).some((g) => g.gate_code === "gate_a" && g.status === "signed");
  const coreLive = Boolean(l?.no_launch_checklist || l?.core_onboarding_completed_at || coreGateSigned);
  const displayStatus = coreLive && l?.status === "active" ? "live" : l?.status;
  const canNotice = (isManager || isBD || isAM) && (l?.status === "active" || l?.status === "live");
  const canClose = (isManager || isBD || isAM) && l?.status === "offboarding";
  const canCancel = (isManager || isBD) && (l?.status === "draft" || l?.status === "awaiting_day0");
  if (launch.isLoading) return <p className="text-sm text-muted-foreground">Loading launch…</p>;
  if (launch.error) {
    const errorMessage =
      typeof launch.error === "object" && launch.error !== null && "message" in launch.error
        ? String(launch.error.message)
        : String(launch.error);
    return <p className="text-sm text-destructive">Could not load launch: {errorMessage}</p>;
  }
  if (!l) return <p className="text-sm text-muted-foreground">Launch not found, or you don't have access to it.</p>;
  const n = l.plans?.duration_weeks ?? 0;
  const week = launchWeek(l.day0_date, n);
  const phaseLabel = (code: string | null | undefined) => {
    const p = phaseRows.find((x) => x.code === code);
    return p ? `${p.code} · ${p.name}` : "Core";
  };
  const moduleLabel = (code: string) => modules.data?.find((m) => m.module_code === code)?.launch_modules?.name ?? code;
  const sortedGates = [...(gates.data ?? [])].sort((a, b) =>
    (phaseRows.find((p) => p.code === a.phase_code)?.sort_order ?? 99) -
    (phaseRows.find((p) => p.code === b.phase_code)?.sort_order ?? 99) || a.due_week - b.due_week);
  const openTask = [...taskList, ...exitTasks].find((t) => t.id === taskId) ?? null;
  const openGate = (gates.data ?? []).find((g) => g.id === gateId) ?? null;
  const keys = [["launch-tasks", launchId], ["launch-gates", launchId]];
  const settingUp = l.status === "draft" || l.status === "awaiting_day0";

  return (
    <div className="space-y-6">
      <Link to="/clients/$clientId" params={{ clientId: l.client_id }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {l.clients?.hotel_name}
      </Link>
      {l.status === "closed" ? (
        <div role="status" className="rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground">
          <span className="font-semibold">Client closed.</span> This onboarding checklist is read-only.
        </div>
      ) : null}
      <PageHeader
        title={l.clients?.hotel_name ?? "Launch"}
        description={`${l.plans?.name ?? ""}${l.clients?.city ? ` · ${l.clients.city}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {settingUp && (isManager || isBD) ? (
              <Button asChild size="sm">
                <Link
                  to="/clients/new"
                  search={{ clientId: l.client_id, step: l.status === "awaiting_day0" ? 3 : l.day0_date ? 3 : 2, launchId: l.id }}
                >
                  Continue setup
                </Link>
              </Button>
            ) : null}
            {isManager || canCancel || canNotice ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><MoreHorizontal className="mr-1 h-4 w-4" />More</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              {isManager ? <><DropdownMenuItem onSelect={() => setShiftOpen(true)}>Shift Day 0</DropdownMenuItem><DropdownMenuItem onSelect={() => setPlanChangeOpen(true)}>Change plan</DropdownMenuItem></> : null}
              {canCancel ? <DropdownMenuItem onSelect={() => setCancelOpen(true)}>Cancel launch</DropdownMenuItem> : null}
              {canNotice ? <DropdownMenuItem onSelect={() => setNoticeOpen(true)}>Record termination notice</DropdownMenuItem> : null}
            </DropdownMenuContent></DropdownMenu> : null}
            {isManager ? <HoldLaunchButton launchId={l.id} status={l.status} /> : null}
            {isAdmin ? <ExitTemplateEditor planId={l.plan_id} customId={l.custom_plan_id} /> : null}
            <StatusBadge status={displayStatus ?? l.status} label={displayStatus === "live" && l.status === "active" ? "Live" : LAUNCH_STATUS_LABEL[displayStatus ?? l.status] ?? l.status} />
          </div>
        }
      />

      {l.status === "on_hold" ? <OnHoldBanner clientId={l.client_id} /> : null}
      {(historicalTasks.data ?? []).length > 0 ? <p role="status" className="text-sm text-muted-foreground">Historical client — completed before North Star. Completion dates and approval evidence are not on record; these read-only items do not affect scores or gates.</p> : null}
      {historicalTasks.isError ? <p role="alert" className="text-sm text-destructive">Could not load the historical checklist.</p> : null}

      {l.status === "offboarding" && l.exit_date ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-medium">Serving notice</span> · exit on {fmtDate(l.exit_date)}
          {(l as { notice_within_min_term?: boolean }).notice_within_min_term ? (
            <span className="ml-2 font-medium">
              · Notice given within minimum term (ends {fmtDate((l as { min_term_end?: string | null }).min_term_end ?? null)})
            </span>
          ) : null}
        </div>
      ) : null}

      {canClose ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setWithdrawOpen(true)}>Notice withdrawn</Button>
          {isAdmin ? <Button variant="outline" size="sm" onClick={() => setOverrideOpen(true)}>Admin offboarding override</Button> : null}
          <Button variant="destructive" size="sm" disabled={openExitCount > 0 || !exitTasks.length} onClick={() => setCloseOpen(true)}>
            {openExitCount > 0 ? `Close client (${openExitCount} exit task${openExitCount > 1 ? "s" : ""} open)` : "Close client"}
          </Button>
        </div>
      ) : null}

      <KpiStrip className="gap-3 lg:grid-cols-5">
        <KpiCard compact label="Day 0" value={fmtDate(l.day0_date)} />
        <KpiCard compact label="Core onboarding" value={coreLive ? "Live" : `Due ${fmtDate(l.core_onboarding_due_date)}`} />
        <KpiCard compact label="Progress" value={(historicalTasks.data ?? []).length ? "Completed before North Star" : week === null ? "Not started" : `Roadmap week ${week} of ${n}`} />
        <KpiCard compact label="Go-live" value={fmtDate(l.launch_date)} />
        <div className="card-surface flex items-center justify-between gap-2 p-4">
          <div className="min-w-0"><p className="text-xs text-label-muted">Onboarding tasks done</p><p className="mt-1 text-sm font-medium tabular-nums">{done} / {taskList.length} tasks</p></div>
          <ProgressRing size="medium" value={done} goal={taskList.length} label="Tasks done" />
        </div>
      </KpiStrip>
      {coreLive && l.status === "active" ? <p className="text-sm text-muted-foreground">Core onboarding is complete. Assigned pipelines continue through their roadmap gates.</p> : null}

      <section className="space-y-2">
        <h2 className="text-section-title font-semibold">Gates</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {sortedGates.map((g) => (
            <button key={g.id} onClick={() => setGateId(g.id)} className={cn("min-w-[210px] rounded-xl border p-3 text-left transition-colors hover:border-primary/60", GATE_CLASS[g.status])}>
              <p className="text-label-muted">{phaseLabel(g.phase_code)}</p>
              <p className="text-small font-medium text-foreground">{g.gate_name}</p>
              <p className="text-label text-muted-foreground">Due {fmtDate(g.due_date)} · {roleLabel(g.signer_role)}</p>
              <span className="mt-2 inline-block"><StatusBadge status={g.status} label={g.status} /></span>
            </button>
          ))}
        </div>
      </section>

      {l.status === "offboarding" ? <ExitChecklist launchId={l.id} /> : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section-title font-semibold">Onboarding Task List</h2>
          <div className="flex flex-wrap gap-1.5 text-label">
            {Object.keys(TASK_CHIP).map((s) => (
              <span key={s} className={cn("rounded border px-1.5 py-0.5", TASK_CHIP[s])}>{TASK_STATUS_LABEL[s]}</span>
            ))}
          </div>
        </div>
        {settingUp ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            This launch is still being set up — finish the wizard to create its tasks and gates.
          </div>
        ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">Module</th>
                {weeks.map((w) => (
                  <th key={w} className={cn("px-2 py-2 text-left font-medium", week === w && "text-primary")}>{w === 0 ? "Step 1 (Day 0)" : `Step ${weeks.indexOf(w) + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {phaseGroups.map((g) => (
                <Fragment key={g.phase || "core"}>
                  <tr>
                    <td colSpan={weeks.length + 1} className="bg-muted/50 px-3 py-1.5 text-label-muted">
                      {phaseLabel(g.phase)}
                    </td>
                  </tr>
                  {g.rows.map((mc) => (
                <tr key={`${g.phase}:${mc}`}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top font-medium">{moduleLabel(mc)}</td>
                  {weeks.map((w) => (
                    <td key={w} className="px-2 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(byCell.get(`${g.phase}:${mc}:${w}`) ?? []).map((t) => (
                          <button
                            key={t.id}
                            title={`${t.code} · ${t.name} — ${TASK_STATUS_LABEL[t.status]}`}
                            onClick={() => setTaskId(t.id)}
                            className={cn("relative rounded border px-1.5 py-0.5 text-label font-medium", TASK_CHIP[t.status] ?? TASK_CHIP["not_started"])}
                          >
                            {t.code}
                            {taskLocked(t.id) ? <span className="ml-1 text-muted-foreground" title="Locked: waiting for Gate A" aria-label="Locked: waiting for Gate A"><LockKeyhole className="inline h-3 w-3" /></span> : null}
                            {(t.escalation_level ?? 0) > 0 ? <span className="ml-1 text-destructive">Escalation {t.escalation_level}</span> : null}
                            {isOverdue(t) ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" /> : null}
                            {t.carried_from_task_id ? <span className="ml-1 rounded bg-warning/20 px-1 text-label text-warning-foreground">Carried over</span> : null}
                          </button>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <TaskSheet task={openTask && !historicalIds.has(openTask.id) ? openTask : null} staff={staff.data ?? []} canEditPlan={canEditPlan} onClose={() => setTaskId(null)} invalidateKeys={keys} />
      <Dialog open={Boolean(openTask && historicalIds.has(openTask.id))} onOpenChange={open => { if (!open) setTaskId(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{openTask?.code} · {openTask?.name}</DialogTitle><DialogDescription>Completed before North Star · Historical, read-only</DialogDescription></DialogHeader>
          <p className="whitespace-pre-line text-sm">{openTask?.standard}</p>
          <p className="text-sm text-muted-foreground">{openTask?.notes}. Completion date and approval evidence not on record.</p>
        </DialogContent>
      </Dialog>
      <GateSheet key={openGate?.id ?? "closed"} gate={openGate} clientId={l.client_id} isFinal={openGate?.gate_code === l.plans?.final_gate_code} canSign={openGate ? canSign(openGate) : false}
        staff={staff.data ?? []} onClose={() => setGateId(null)} invalidateKeys={[...keys, ["launch", launchId]]} />
      <NoticeDialog launchId={launchId} clientId={l.client_id} open={noticeOpen} onClose={() => setNoticeOpen(false)} invalidateKeys={[...keys, ["launch", launchId], ["launch-exit-tasks", launchId]]} />
      <SimpleTextDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="Notice withdrawn"
        description="The launch goes back to its previous status and open exit tasks are removed."
        confirmLabel="Withdraw notice"
        placeholder="Optional note"
        onSubmit={async (note) => {
          const { error } = await supabase.rpc("withdraw_termination_notice", { _launch_id: launchId, _note: note || (null as unknown as string) });
          if (error) {
            toast.error(error.message);
            throw error;
          }
          toast.success("Notice withdrawn");
          for (const k of keys) qc.invalidateQueries({ queryKey: k });
          qc.invalidateQueries({ queryKey: ["launch", launchId] });
          qc.invalidateQueries({ queryKey: ["launch-exit-tasks", launchId] });
        }}
      />
      <SimpleTextDialog required open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Override offboarding" description="Unfinished exit items remain in history." confirmLabel="Override and close" placeholder="Required reason" onSubmit={async reason => { const { error } = await supabase.rpc("override_offboarding", { _launch_id: launchId, _reason: reason }); if (error) { toast.error(error.message); throw error; } await qc.invalidateQueries({ queryKey: ["launch", launchId] }); await qc.invalidateQueries({ queryKey: ["exit-checklist"] }); toast.success("Admin override recorded"); }} />
      <SimpleTextDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close client"
        description="Every exit item must be Done. Existing launch history is preserved."
        confirmLabel="Close client"
        placeholder="Optional note"
        onSubmit={async (note) => {
          const { error } = await supabase.rpc("complete_offboarding", { _launch_id: launchId });
          if (error) {
            toast.error(error.message);
            throw error;
          }
          try {
            await logLaunchEvent({ data: { launch_id: launchId, kind: "close_note", note } });
          } catch {
            /* the close itself succeeded — the note is best-effort */
          }
          toast.success("Client closed" + (note ? ` · ${note}` : ""));
          for (const k of keys) qc.invalidateQueries({ queryKey: k });
          qc.invalidateQueries({ queryKey: ["launch", launchId] });
          qc.invalidateQueries({ queryKey: ["launch-events", launchId] });
          qc.invalidateQueries({ queryKey: ["launch-exit-tasks", launchId] });
        }}
      />
      <SimpleTextDialog
        required
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel launch"
        description="Only a launch that has not been activated can be cancelled. If this followed a plan change, the previous launch is reopened."
        confirmLabel="Cancel launch"
        placeholder="Reason (required)"
        onSubmit={async (reason) => {
          if (!reason.trim()) {
            toast.error("Give a reason for cancelling");
            throw new Error("reason required");
          }
          const { error } = await supabase.rpc("cancel_launch", { _launch_id: launchId, _reason: reason.trim() });
          if (error) {
            toast.error(error.message);
            throw error;
          }
          toast.success("Launch cancelled");
          qc.invalidateQueries({ queryKey: ["client-launches", l.client_id] });
          qc.invalidateQueries({ queryKey: ["launch-drafts"] });
          navigate({ to: "/clients/$clientId", params: { clientId: l.client_id } });
        }}
      />
      <ShiftDay0Dialog launchId={launchId} open={shiftOpen} onClose={() => setShiftOpen(false)} invalidateKeys={[["launch", launchId], ...keys]} />
      <ChangePlanDialog
        launch={l}
        open={planChangeOpen}
        onClose={() => setPlanChangeOpen(false)}
        plans={(allPlans.data ?? []).filter((p) => p.id !== l.plan_id)}
      />
    </div>
  );
}

export function GateSheet({ gate, clientId, isFinal, canSign, staff, onClose, invalidateKeys }: {
  gate: Gate | null; clientId: string; isFinal: boolean; canSign: boolean;
  staff: Array<{ id: string; full_name: string }>; onClose: () => void; invalidateKeys: unknown[][];
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // QA-23: switching gates must never carry over the previous gate's notes or file.
  const gateId = gate?.id;
  useEffect(() => { setFile(null); setNotes(""); }, [gateId]);

  async function sign() {
    if (!gate) return false;
    if (isFinal && !file && !gate.client_approved_at && !gate.approval_file_path) {
      toast.error("Upload the approval file or ask the owner to Approve in North Star.");
      return false;
    }
    setBusy(true);
    try {
      let path: string | null = null;
      if (file) {
        path = `${clientId}/approvals/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("client-files").upload(path, file);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.rpc("sign_gate", { _gate_id: gate.id, _approval_file_path: path as string, _notes: notes || (null as unknown as string) });
      if (error) throw error;
      toast.success(`${gate.gate_name} signed`);
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      setFile(null); setNotes("");
      onClose();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign gate");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!gate} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {gate ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-card-title font-semibold">{gate.gate_name}</SheetTitle>
              <SheetDescription>Due {fmtDate(gate.due_date)} · signed by {roleLabel(gate.signer_role)} or management</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6 text-sm">
              <Badge variant="outline" className={cn("capitalize", GATE_CLASS[gate.status])}>{gate.status}</Badge>
              <div>
                <p className="text-label-muted">Criteria</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {gate.criteria.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
              {gate.status === "signed" ? (
                <p>Signed by <span className="font-medium">{staff.find((s) => s.id === gate.signed_by)?.full_name ?? "—"}</span> on {fmtDateTime(gate.signed_at)}</p>
              ) : gate.status === "open" ? (
                <p className="text-muted-foreground">Becomes ready to sign once every task it covers is done or not applicable.</p>
              ) : null}
              {gate.status === "ready" && canSign ? (
                <div className="space-y-3 rounded-lg border border-gold/50 bg-gold/5 p-3">
                  {isFinal ? (
                    <div className="space-y-1.5">
                      <Label>Hotel approval file (or owner approval in North Star)</Label>
                      {gate.client_approved_at ? <p className="text-success">Approved in owner login on {fmtDateTime(gate.client_approved_at)}</p> : null}
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span className="truncate">{file?.name ?? "Choose file"}</span>
                        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label>Notes (optional)</Label>
                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <ConfirmButton onConfirm={sign} doneLabel="Signed" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Sign gate
                  </ConfirmButton>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function NoticeDialog({ launchId, clientId, open, onClose, invalidateKeys }: {
  launchId: string; clientId: string; open: boolean; onClose: () => void; invalidateKeys: unknown[][];
}) {
  const qc = useQueryClient();
  const [noticeDate, setNoticeDate] = useState(todayISO());
  const [noticeFrom, setNoticeFrom] = useState("client");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const minTerm = useQuery({
    queryKey: ["min-term-check", launchId, noticeDate],
    enabled: open && Boolean(noticeDate),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("min_term_check", { _launch_id: launchId, _notice_date: noticeDate });
      if (error) throw error;
      return data as { within: boolean; min_term_months: number; min_term_end: string | null; months_remaining: number; days_remaining: number } | null;
    },
  });

  async function submit() {
    setBusy(true);
    try {
      let path: string | null = null;
      if (file) {
        path = `${clientId}/notices/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("client-files").upload(path, file);
        if (upErr) throw upErr;
      }
      const { data: exit, error } = await supabase.rpc("record_termination_notice", {
        _launch_id: launchId,
        _notice_date: noticeDate,
        _notice_from: noticeFrom,
        _reason: reason || (null as unknown as string),
        _notice_file_path: path as string,
      });
      if (error) throw error;
      toast.success(exit ? `Notice recorded · exit on ${fmtDate(exit as unknown as string)}` : "Notice recorded");
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      setFile(null); setReason("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record notice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-card-title font-semibold">Record termination notice</DialogTitle>
          <DialogDescription>The exit date uses your agreed notice period; minimum-term warnings do not delay it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>Notice date</Label>
            <Input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
          </div>
          {minTerm.data?.within ? (
            <div role="alert" className="flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">Warning: this notice is inside the {minTerm.data.min_term_months}-month minimum term.</span>{" "}
                The minimum term ends on {fmtDate(minTerm.data.min_term_end)} —{" "}
                {minTerm.data.months_remaining} month{minTerm.data.months_remaining === 1 ? "" : "s"}
                {minTerm.data.days_remaining ? ` ${minTerm.data.days_remaining} day${minTerm.data.days_remaining === 1 ? "" : "s"}` : ""} remaining.
                You can still record it; it will be marked "notice given within minimum term".
              </p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Notice from</Label>
            <Select value={noticeFrom} onValueChange={setNoticeFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="alcor">Alcor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notice email (optional)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span className="truncate">{file?.name ?? "Choose file"}</span>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Record notice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LaunchRow = { id: string; client_id: string; status: string; plans: { name: string } | null };

function ShiftDay0Dialog({ launchId, open, onClose, invalidateKeys }: {
  launchId: string; open: boolean; onClose: () => void; invalidateKeys: unknown[][];
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!date) {
      toast.error("Pick the new Day 0 date");
      return;
    }
    if (!reason.trim()) {
      toast.error("Give a reason for shifting Day 0");
      return;
    }
    setBusy(true);
    try {
      const { data: delta, error } = await supabase.rpc("shift_day0", {
        _launch_id: launchId,
        _new_day0: date,
        _reason: reason.trim(),
      });
      if (error) throw error;
      toast.success(typeof delta === "number" && delta !== 0 ? `Day 0 shifted by ${delta} day${Math.abs(delta) > 1 ? "s" : ""}` : "Day 0 updated");
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      setDate(""); setReason("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not shift Day 0");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-card-title font-semibold">Shift Day 0</DialogTitle>
          <DialogDescription>
            Open gate and task due dates move with Day 0. Done and not-applicable tasks keep their dates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>New Day 0</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Shift Day 0
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangePlanDialog({ launch, open, onClose, plans }: {
  launch: LaunchRow; open: boolean; onClose: () => void; plans: Array<{ id: string; code: string; name: string }>;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [planCode, setPlanCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!planCode) {
      toast.error("Choose the new plan");
      return;
    }
    if (!reason.trim()) {
      toast.error("Give a reason for the plan change");
      return;
    }
    setBusy(true);
    try {
      const { data: newId, error } = await supabase.rpc("change_plan", {
        _launch_id: launch.id,
        _plan_code: planCode,
        _reason: reason.trim(),
      });
      if (error) throw error;
      const id = newId as string;
      const { data: fresh, error: fe } = await supabase
        .from("client_launches")
        .select("status")
        .eq("id", id)
        .single();
      if (fe) throw fe;
      toast.success("Plan changed — continue the launch setup");
      qc.invalidateQueries({ queryKey: ["client-launches", launch.client_id] });
      qc.invalidateQueries({ queryKey: ["launch-drafts"] });
      // Upgrades create a draft (needs Day 0 again); other changes go straight
      // to the team step since Day 0 is kept.
      const step = fresh?.status === "draft" ? 2 : 3;
      onClose();
      navigate({ to: "/clients/new", search: { clientId: launch.client_id, launchId: id, step } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-card-title font-semibold">Change plan</DialogTitle>
          <DialogDescription>
            Works on any open launch. An upgrade starts a fresh draft (new agreement at Day 0); a sideways change or
            downgrade keeps Day 0 and lands on "Ready to activate".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>New plan</Label>
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Change plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

