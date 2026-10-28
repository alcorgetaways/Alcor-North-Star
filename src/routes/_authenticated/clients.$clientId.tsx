import { HotelMainKpis } from "@/components/MainKpis";
import { lastCompleteMonthIST } from "@/lib/kpi-sync-plan";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { PrelaunchHistory } from "@/components/PrelaunchHistory";
import { WhoPays } from "@/components/WhoPays";
import { InfluencerPrograms } from "@/components/InfluencerPrograms";
import { BrandRollupCard, OnHoldBanner, PropertyGoalCard, ReportHistoryCard } from "@/components/ClientExtras";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_STATUSES, PROPERTY_TYPES } from "@/lib/constants";
import { getClientLoginStatus, logLaunchEvent, resendClientInvite } from "@/lib/team.functions";
import {
  addClientAssignment,
  recalculateClientAssignments,
  removeClientAssignment,
} from "@/lib/assignments.functions";
import { average, monthLabel } from "@/lib/kpi";
import { StatusPill } from "@/components/StatusPill";
import { RecordLayout, type PropertyGroup } from "@/components/RecordLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtCommission } from "@/lib/commission";
import { KpiTargetsTab } from "@/components/KpiTargetsTab";
import { GbpDutyTasks } from "@/components/GbpDutyTasks";
import { useGbpProfileNames } from "@/lib/gbp-profiles";
import { SourceClientDashboard } from "@/components/SourcePerformance";
import { GbpClientSubTabs } from "@/components/PerformanceTabs";
import { CommercialsSection } from "@/components/CommercialsSection";
import { useHotelScorecard } from "@/lib/scorecard";
import { downloadHotelScorecardPdf } from "@/lib/hotel-pdf";
import { previousMonthKey, monthOptions, monthKey } from "@/lib/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LAUNCH_STATUS_LABEL, fmtDate, launchWeek } from "@/lib/launch";
import { cn } from "@/lib/utils";
import { SegmentedPill } from "@/components/SegmentedPill";

const inrFmt = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`;

/** One Account Manager per client, editable by admin/management only (DB trigger enforces it). */
function AccountManagerCard({ clientId, currentId, isManager }: { clientId: string; currentId: string | null; isManager: boolean }) {
  const qc = useQueryClient();
  const { data: staff = [] } = useQuery({
    queryKey: ["am-staff-list"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .is("client_id", null)
        .order("full_name");
      if (error) throw error;
      return data as Array<{ id: string; full_name: string }>;
    },
  });
  const { data: currentName } = useQuery({
    queryKey: ["am-name", currentId],
    enabled: Boolean(currentId) && !isManager,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", currentId!).maybeSingle();
      return data?.full_name ?? null;
    },
  });
  const save = useMutation({
    mutationFn: async (v: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ account_manager_id: v === "none" ? null : v })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["am-name"] });
      toast.success("Account Manager updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolvedName = isManager
    ? staff.find((s) => s.id === currentId)?.full_name ?? null
    : currentName;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-4 py-3 text-sm">
      <span className="text-muted-foreground">Account Manager:</span>
      {isManager ? (
        <Select value={currentId ?? "none"} onValueChange={(v) => save.mutate(v)} disabled={save.isPending}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder="Not assigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not assigned</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="font-medium">{resolvedName ?? "Not assigned"}</span>
      )}
    </div>
  );
}

type AssignmentRow = {
  id: string;
  role: string;
  source: string;
  matched_service: string | null;
  profiles: { full_name: string } | null;
  pipelines: { name: string } | null;
};

/** Per-client team assignments, grouped by pipeline. Admin/management can add, remove and reset. */
function AssignedTeamCard({ clientId, isManager }: { clientId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [addUser, setAddUser] = useState("");
  const [addPipeline, setAddPipeline] = useState("");
  const [addRole, setAddRole] = useState<"head" | "team_member">("team_member");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-assignments", clientId] });

  const { data: rows = [] } = useQuery({
    queryKey: ["client-assignments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_staff_assignments")
        .select("id, role, source, matched_service, profiles:user_id(full_name), pipelines:pipeline_id(name)")
        .eq("client_id", clientId)
        .eq("excluded", false);
      if (error) throw error;
      return data as unknown as AssignmentRow[];
    },
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["am-staff-list"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .is("client_id", null)
        .order("full_name");
      if (error) throw error;
      return data as Array<{ id: string; full_name: string }>;
    },
  });
  const { data: pipelineOpts = [] } = useQuery({
    queryKey: ["pipeline-options"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () =>
      addClientAssignment({ data: { clientId, userId: addUser, pipelineId: addPipeline, role: addRole } }),
    onSuccess: () => {
      invalidate();
      setAddUser("");
      setAddPipeline("");
      toast.success("Person added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (assignmentId: string) => removeClientAssignment({ data: { assignmentId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Person removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const recalc = useMutation({
    mutationFn: async () => recalculateClientAssignments({ data: { clientId, resetManual: true } }),
    onSuccess: () => {
      invalidate();
      toast.success("Assignments reset to automatic");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byPipeline = new Map<string, AssignmentRow[]>();
  for (const r of rows) {
    const key = r.pipelines?.name ?? "Other";
    byPipeline.set(key, [...(byPipeline.get(key) ?? []), r]);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Assigned team</span>
        {isManager ? (
          <Button
            variant="outline"
            size="sm"
            disabled={recalc.isPending}
            onClick={() => {
              if (window.confirm("Reset this hotel to automatic assignments? Manual corrections will be removed."))
                recalc.mutate();
            }}
          >
            Recalculate
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No active launch — no pipeline assignments.</p>
      ) : (
        [...byPipeline.entries()].map(([name, members]) => (
          <div key={name}>
            <p className="text-label-muted">{name}</p>
            <ul className="mt-1 space-y-1">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <span>{m.profiles?.full_name ?? "Unknown"}</span>
                  <Badge variant="outline" className="text-xs">{m.role === "head" ? "Head" : "Team"}</Badge>
                  <Badge variant={m.source === "manual" ? "secondary" : "outline"} className="text-xs">
                    {m.source === "manual" ? "Manual" : "Auto"}
                  </Badge>
                  {m.matched_service ? (
                    <span className="text-xs text-muted-foreground">{m.matched_service}</span>
                  ) : null}
                  {isManager ? (
                    <button
                      type="button"
                      className="ml-auto text-xs text-destructive hover:underline"
                      onClick={() => remove.mutate(m.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {isManager ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <Select value={addUser} onValueChange={setAddUser}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Person" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={addPipeline} onValueChange={setAddPipeline}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Pipeline" /></SelectTrigger>
            <SelectContent>
              {pipelineOpts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={addRole} onValueChange={(v) => setAddRole(v as "head" | "team_member")}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="team_member">Team</SelectItem>
              <SelectItem value="head">Head</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!addUser || !addPipeline || add.isPending}
            onClick={() => add.mutate()}
          >
            Add person
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LaunchCard({ clientId }: { clientId: string }) {
  const { isManager, isBD, roles } = useAuth();
  const canCommercial = roles.some((r) => ["admin", "management", "bd_manager", "finance"].includes(r));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [relaunchOpen, setRelaunchOpen] = useState(false);
  const [relaunchPlan, setRelaunchPlan] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const closingReasons = useQuery({
    queryKey: ["closing-reasons"],
    enabled: closeOpen,
    queryFn: async () => {
      const { data, error } = await supabase.from("closing_reasons").select("code, label, is_churn, requires_notes").order("sort_order");
      if (error) throw error;
      return data as Array<{ code: string; label: string; is_churn: boolean; requires_notes: boolean }>;
    },
  });
  const launches = useQuery({
    queryKey: ["client-launches", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id, status, day0_date, launch_date, closed_reason, no_launch_checklist, plans(name, duration_weeks, sort_order), client_tasks(id, status), historical_launch_tasks(id, status)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string; status: string; day0_date: string | null; launch_date: string | null; closed_reason: string | null; no_launch_checklist: boolean;
        plans: { name: string; duration_weeks: number; sort_order: number } | null; client_tasks: Array<{ id: string; status: string }>; historical_launch_tasks: Array<{ id: string; status: string }>;
      }>;
    },
  });
  const plans = useQuery({
    queryKey: ["upgrade-plans"],
    enabled: upgradeOpen || relaunchOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, code, name, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as Array<{ id: string; code: string; name: string; sort_order: number }>;
    },
  });

  const login = useQuery({
    queryKey: ["client-login-status", clientId],
    enabled: isManager || isBD,
    queryFn: () => getClientLoginStatus({ data: { client_id: clientId } }),
  });
  const resendLogin = useMutation({
    mutationFn: () => resendClientInvite({ data: { client_id: clientId, origin: window.location.origin } }),
    onSuccess: (r) =>
      toast.success(r.sent === "invite" ? `Invite sent to ${r.email}` : `New set-password link sent to ${r.email}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = launches.data?.[0];
  // Commercial terms come through the security-definer RPC (column-locked in the DB).
  const commercials = useQuery({
    queryKey: ["launch-commercials", latest?.id],
    enabled: canCommercial && Boolean(latest?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("launch_commercials", { _launch_id: latest!.id });
      if (error) throw error;
      return data as {
        retainer_inr?: number | null;
        setup_fee_inr?: number | null;
        deposit_inr?: number | null;
        commission_direct_pct?: number | null;
        commission_ota_pct?: number | null;
        advance_amount?: number | null;
      } | null;
    },
  });
  const upgrade = useMutation({
    mutationFn: async (planCode: string) => {
      if (!latest) throw new Error("No launch to upgrade");
      const { data, error } = await supabase.rpc("start_upgrade", { _from_launch_id: latest.id, _to_plan_code: planCode });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["client-launches", clientId] });
      setUpgradeOpen(false);
      navigate({ to: "/clients/new", search: { clientId, step: 2, launchId: newId as string } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const relaunch = useMutation({
    mutationFn: async (planCode: string) => {
      const { data, error } = await supabase.rpc("relaunch_client", { _client_id: clientId, _plan_code: planCode });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["client-launches", clientId] });
      setRelaunchOpen(false);
      toast.success("Relaunch created — confirm Day 0 with a fresh agreement");
      navigate({ to: "/clients/new", search: { clientId, step: 2, launchId: newId as string } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeLaunch = useMutation({
    mutationFn: async (v: { id: string; reason: string; notes: string | null }) => {
      const { error } = await supabase.rpc("close_launch", {
        _launch_id: v.id,
        _reason_code: v.reason,
        ...(v.notes ? { _notes: v.notes } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-launches", clientId] });
      setCloseOpen(false);
      setCloseReason("");
      setCloseNotes("");
      toast.success("Launch closed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (launches.isLoading) return null;
  if (!latest) {
    // No launch at all — BD / management start one from the wizard's plan step.
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-section-title font-semibold">Launch</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {isManager || isBD ? (
            <Button asChild size="sm">
              <Link to="/clients/new" search={{ clientId, step: 1 }}>Start launch</Link>
            </Button>
          ) : (
            <p className="text-muted-foreground">No launch yet.</p>
          )}
        </CardContent>
      </Card>
    );
  }
  const n = latest.plans?.duration_weeks ?? 0;
  const week = launchWeek(latest.day0_date, n);
  const done = latest.client_tasks.filter((t) => t.status === "done" || t.status === "not_applicable").length;
  const pct = latest.client_tasks.length ? Math.round((done / latest.client_tasks.length) * 100) : 0;
  const history = launches.data!.slice(1);
  const higherPlans = (plans.data ?? []).filter((p) => latest.plans && p.sort_order > latest.plans.sort_order);
  const allClosed = latest.status === "closed";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-section-title font-semibold">
          Launch
          <StatusBadge status={latest.no_launch_checklist && latest.status === "active" ? "live" : latest.status} label={latest.no_launch_checklist && latest.status === "active" ? "Live" : LAUNCH_STATUS_LABEL[latest.status] ?? latest.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {allClosed ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Every launch for this hotel is closed{latest.closed_reason ? ` — ${latest.closed_reason}` : ""}.
            </p>
            {(isManager || isBD) && !relaunchOpen ? (
              <Button size="sm" onClick={() => setRelaunchOpen(true)}>Re-launch</Button>
            ) : null}
            {relaunchOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={relaunchPlan} onValueChange={setRelaunchPlan}>
                  <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>
                    {(plans.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!relaunchPlan || relaunch.isPending} onClick={() => relaunch.mutate(relaunchPlan)}>
                  {relaunch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create relaunch
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRelaunchOpen(false)}>Cancel</Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {latest.no_launch_checklist ? <p className="font-medium">{latest.historical_launch_tasks.length ? `Historical onboarding complete · ${latest.historical_launch_tasks.length} tasks done` : "Live, no checklist"}</p> : <><p>{latest.plans?.name} · {week === null ? "Not started" : `Week ${week} of ${n}`} · {pct}% done</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div></>}
          </>
        )}
        {canCommercial && commercials.data ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-border/70 pt-3 text-xs sm:grid-cols-3">
            {commercials.data.retainer_inr != null ? (
              <p><span className="text-muted-foreground">Retainer: </span>{inrFmt(Number(commercials.data.retainer_inr))} + GST</p>
            ) : null}
            {commercials.data.setup_fee_inr != null && Number(commercials.data.setup_fee_inr) > 0 ? (
              <p><span className="text-muted-foreground">Setup fee: </span>{inrFmt(Number(commercials.data.setup_fee_inr))}</p>
            ) : null}
            {commercials.data.deposit_inr != null && Number(commercials.data.deposit_inr) > 0 ? (
              <p><span className="text-muted-foreground">Deposit: </span>{inrFmt(Number(commercials.data.deposit_inr))}</p>
            ) : null}

            {commercials.data.advance_amount != null ? (
              <p><span className="text-muted-foreground">Advance: </span>{inrFmt(Number(commercials.data.advance_amount))}</p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link
            to="/launches/$launchId"
            params={{ launchId: latest.id }}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-label font-medium text-foreground transition-colors hover:bg-primary/20"
          >
            Open launch board
          </Link>
          <span className="self-center text-xs text-muted-foreground" title="The launch board is the task grid and gates of this launch (one purchase). Closed launches stay in the history below.">
            Tasks &amp; gates for this launch
          </span>
          {latest.status === "live" && (isManager || isBD) ? (
            <Button size="sm" variant="outline" onClick={() => setUpgradeOpen(true)}>Upgrade plan</Button>
          ) : null}
          {!["closed", "completed", "cancelled"].includes(latest.status) && (isManager || isBD) ? (
            <Button size="sm" variant="outline" onClick={() => setCloseOpen(true)}>Close launch</Button>
          ) : null}
        </div>
        {isManager || isBD ? (
          <p className="flex flex-wrap items-center gap-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            Owner login:{" "}
            {login.isLoading
              ? "checking…"
              : login.data?.status === "active"
                ? "Active"
                : login.data?.status === "invited"
                  ? "Invited — waiting for them to set a password"
                  : login.data?.status === "staff"
                    ? `Blocked — ${login.data.email} is used by a staff account`
                    : "None"}
            {login.data?.email ? <span className="font-medium text-foreground">{login.data.email}</span> : null}
            {!login.isLoading && login.data?.status !== "active" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={resendLogin.isPending}
                onClick={() => resendLogin.mutate()}
              >
                {login.data?.status === "none" ? "Send invite" : "Resend invite"}
              </Button>
            ) : null}
          </p>
        ) : null}
        {history.length ? (
          <ul className="space-y-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            {history.map((h) => (
              <li key={h.id}>
                {h.plans?.name} · {LAUNCH_STATUS_LABEL[h.status] ?? h.status}
                {h.closed_reason ? ` — ${h.closed_reason}` : ""} · go-live {fmtDate(h.launch_date)}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <Dialog open={upgradeOpen} onOpenChange={(o) => (!o ? setUpgradeOpen(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-card-title font-semibold">Upgrade plan</DialogTitle>
            <DialogDescription>
              A fresh draft launch is created for the new plan. Departments the plans share carry over to the Team step;
              Day 0 then needs the new agreement {latest.plans?.name.startsWith("Diamond") ? "" : ""}(and NOC for Diamond plans) uploaded fresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {higherPlans.map((p) => (
              <button
                key={p.id}
                disabled={upgrade.isPending}
                onClick={() => upgrade.mutate(p.code)}
                className="flex w-full items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-left transition-colors hover:border-primary/60"
              >
                <span className="font-medium">{p.name}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
              </button>
            ))}
            {plans.data && higherPlans.length === 0 ? (
              <p className="text-muted-foreground">No higher plan is available.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={closeOpen} onOpenChange={(o) => (!o ? setCloseOpen(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-card-title font-semibold">Close launch</DialogTitle>
            <DialogDescription>
              The launch and its terms are preserved. A closing reason is required; churn reporting
              counts only the reasons marked as churn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label>Closing reason</Label>
              <Select value={closeReason} onValueChange={setCloseReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {(closingReasons.data ?? []).map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}{r.is_churn ? " (churn)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>
                Notes{closingReasons.data?.find((r) => r.code === closeReason)?.requires_notes ? " (required)" : ""}
              </Label>
              <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Optional details" />
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={
                !closeReason ||
                closeLaunch.isPending ||
                Boolean(closingReasons.data?.find((r) => r.code === closeReason)?.requires_notes && !closeNotes.trim())
              }
              onClick={() => latest && closeLaunch.mutate({ id: latest.id, reason: closeReason, notes: closeNotes.trim() || null })}
            >
              {closeLaunch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Close launch
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Client profile — Alcor North Star" },
      {
        name: "description",
        content: "Hotel profile, documents, pipelines and monthly performance history.",
      },
      { property: "og:title", content: "Client profile — Alcor North Star" },
      { property: "og:description", content: "Hotel profile, documents and performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientProfile,
});

function ClientProfile() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const { isManager, isBD, roles } = useAuth();
  const canCommercial = roles.some((r) => ["admin", "management", "bd_manager", "finance"].includes(r));
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [pdfMonth, setPdfMonth] = useState(previousMonthKey(monthKey()));
  const { data: pdfCard } = useHotelScorecard(clientId, pdfMonth, Boolean(clientId));
  const { data: gbpProfileNames = {} } = useGbpProfileNames();

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_pipelines(id, pipeline_id, weight, status, monthly_target, pipelines(name, code), profiles:manager_id(full_name))")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as unknown as Record<string, unknown> & {
        hotel_name: string;
        property_type: string | null;
        city: string | null;
        state: string | null;
        onboarding_status: string;
        payment_status: string;
        client_pipelines: Array<{
          id: string;
          pipeline_id: string;
          weight: number;
          status: string;
          monthly_target: string | null;
          pipelines: { name: string; code: string } | null;
          profiles: { full_name: string } | null;
        }>;
      };
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["client-docs", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, doc_type, category, mandatory, status, file_path")
        .eq("client_id", clientId)
        .order("category");
      if (error) throw error;
      return data;
    },
  });

  // Latest launch (any status) — used to log document verifications in the launch history.
  const { data: latestLaunchId } = useQuery({
    queryKey: ["client-latest-launch", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0]?.id ?? null;
    },
  });

  const amId = (client?.["account_manager_id"] as string | null) ?? null;
  const { data: amName } = useQuery({
    queryKey: ["am-name", amId],
    enabled: Boolean(amId),
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", amId!).maybeSingle();
      return data?.full_name ?? null;
    },
  });

  const { data: teamCount = 0 } = useQuery({
    queryKey: ["client-assignments-count", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_staff_assignments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("excluded", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: comm } = useQuery({
    queryKey: ["launch-commercials", latestLaunchId],
    enabled: canCommercial && Boolean(latestLaunchId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("launch_commercials", { _launch_id: latestLaunchId! });
      if (error) throw error;
      return data as {
        retainer_inr?: number | null; setup_fee_inr?: number | null; deposit_inr?: number | null;
        commission_direct_pct?: number | null; commission_ota_pct?: number | null; advance_amount?: number | null;
      } | null;
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["client-reports", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("id, month, status, client_pipelines(pipelines(name)), kpi_entries(achievement_pct)")
        .eq("client_id", clientId)
        .order("month", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        month: string;
        status: string;
        client_pipelines: { pipelines: { name: string } | null } | null;
        kpi_entries: Array<{ achievement_pct: number | null }>;
      }>;
    },
  });

  const setDocStatus = useMutation({
    mutationFn: async (v: { id: string; status: string; doc_type: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ status: v.status as never })
        .eq("id", v.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      toast.success("Document updated");
      qc.invalidateQueries({ queryKey: ["client-docs", clientId] });
      if (v.status === "verified" && latestLaunchId) {
        logLaunchEvent({
          data: { launch_id: latestLaunchId, kind: "document_verified", details: { doc_type: v.doc_type, status: "verified" } },
        })
          .then(() => qc.invalidateQueries({ queryKey: ["launch-events", latestLaunchId] }))
          .catch(() => undefined);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function viewDocFile(path: string) {
    const { data, error } = await supabase.storage.from("client-files").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (!client) return <p className="text-small text-muted-foreground">Loading client…</p>;

  const clientCode = (client["client_code"] as string | null) ?? null;
  const money = (v: number | null | undefined) => (v != null ? inrFmt(Number(v)) : "—");
  const properties: PropertyGroup[] = [
    ...(canCommercial && comm
      ? [
          {
            title: "Contract",
            rows: [
              { label: "Retainer / month", value: comm.retainer_inr != null ? `${money(comm.retainer_inr)} + GST` : "—" },
              { label: "Setup fee", value: money(comm.setup_fee_inr) },
              { label: "Deposit", value: money(comm.deposit_inr) },
              { label: "Advance", value: money(comm.advance_amount) },
            ],
          },
          {
            title: "Commission",
            rows: [
              { label: "Direct", value: fmtCommission(comm.commission_direct_pct ?? null) },
              { label: "OTA", value: fmtCommission(comm.commission_ota_pct ?? null) },
            ],
          },
        ]
      : []),
    {
      title: "Team",
      rows: [
        { label: "Account manager", value: amName ?? "Not assigned" },
        { label: "Assigned people", value: String(teamCount) },
      ],
    },
    {
      title: "Contact",
      rows: [
        { label: "Owner", value: (client["owner_name"] as string | null) ?? "—" },
        { label: "Email", value: (client["email"] as string | null) ?? "—" },
        { label: "Mobile", value: (client["mobile"] as string | null) ?? "—" },
        { label: "WhatsApp", value: (client["whatsapp"] as string | null) ?? "—" },
        { label: "Address", value: [client["address"], client.city, client.state].filter(Boolean).join(", ") || "—" },
        { label: "Website", value: (client["website"] as string | null) ?? "—" },
      ],
    },
  ];

  const gbpCp = client.client_pipelines.find(
    (cp) => cp.status !== "ended" && (cp.pipelines as { name: string; code?: string } | null)?.code === "gbp",
  );
  const socialCp = client.client_pipelines.find(
    (cp) => cp.status !== "ended" && (cp.pipelines as { name: string; code?: string } | null)?.code === "social_media",
  );
  const TABS: Array<{ id: string; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "pipelines", label: "Pipelines" },
    ...(gbpCp ? [{ id: "gbp", label: "GBP" }] : []),
    { id: "commercials", label: "Commercials" },
    { id: "documents", label: "Documents" },
    { id: "performance", label: "Performance" },
    { id: "targets", label: "Targets" },
    { id: "history", label: "History" },
  ];

  return (
    <>
      <RecordLayout
        breadcrumb={[{ label: "Clients", to: "/clients" }, { label: client.hotel_name }]}
        title={client.hotel_name}
        meta={[client.property_type ?? "Property type not set", [client.city, client.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        badges={
          <>
            {clientCode ? (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-label font-medium text-muted-foreground">
                {clientCode}
              </span>
            ) : null}
            <StatusBadge status={client.onboarding_status} label={client.onboarding_status} />
            <StatusBadge status={client.payment_status} label={`Payment: ${client.payment_status}`} />
          </>
        }
        actions={
          <>
            {isManager || isBD ? (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
            ) : null}
            {isManager ? (
              <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>Merge duplicate</Button>
            ) : null}
            {isManager || isBD ? (
              <Select value={pdfMonth} onValueChange={setPdfMonth}>
                <SelectTrigger className="h-8 w-36 text-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions(12).map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {isManager || isBD ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!pdfCard}
                onClick={() => pdfCard && downloadHotelScorecardPdf(client.hotel_name, pdfCard, false, client.property_type, clientCode)}
              >
                Hotel PDF
              </Button>
            ) : null}
          </>
        }
        tabs={
          <SegmentedPill ariaLabel="Client sections" items={TABS.map((t) => ({ value: t.id, label: t.label }))} value={tab} onChange={setTab} />
        }
        properties={properties}
      >
        {tab === "overview" ? (
          <>
            <PropertyGoalCard clientId={clientId} inactive={(client["status"] as string) === "inactive"} />
            <OnHoldBanner clientId={clientId} />
            <MonthlyActivityPlans clientId={clientId} />
            <InfluencerPrograms clientId={clientId} />
            <WhoPays clientId={clientId} />
            <AccountManagerCard clientId={clientId} currentId={amId} isManager={isManager} />
            <AssignedTeamCard clientId={clientId} isManager={isManager} />
            <LaunchCard clientId={clientId} />
          </>
        ) : null}

        {tab === "pipelines" ? (
          client.client_pipelines.filter((cp) => cp.status !== "ended").length === 0 ? (
            <p className="text-small text-muted-foreground">No pipelines allocated yet — the active launch has no services.</p>
          ) : (
            client.client_pipelines.filter((cp) => cp.status !== "ended").map((cp) => (
              <div key={cp.id} className="card-surface flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-medium">{cp.pipelines?.name}</p>
                  <p className="text-label text-muted-foreground">
                    Manager: {cp.profiles?.full_name ?? "Unassigned"} · Weight {cp.weight}
                  </p>
                </div>
                <StatusBadge status={cp.status} label={cp.status} />
              </div>
            ))
          )
        ) : null}

        {tab === "gbp" && gbpCp ? (
          <div className="space-y-4">
            {(() => {
              const names = gbpProfileNames[clientId]?.length
                ? gbpProfileNames[clientId]!
                : (typeof client["gbp_profile_name"] === "string" && client["gbp_profile_name"] ? [String(client["gbp_profile_name"])] : []);
              return names.length ? (
                <div className="card-surface space-y-1 p-4 text-small text-muted-foreground">
                  {names.map((n) => (
                    <p key={n}>Google Business Profile: <span className="font-medium text-foreground">{n}</span></p>
                  ))}
                </div>
              ) : null;
            })()}
            <GbpClientSubTabs
              performance={<div className="card-surface flex flex-wrap items-center justify-between gap-3 p-5"><p className="text-[0.875rem] text-muted-foreground">Localo analytics for this hotel live in the Performance tab.</p><Button type="button" variant="outline" onClick={() => setTab("performance")}>Open Performance</Button></div>}
              tasks={
                <GbpDutyTasks
                  clientPipelineId={gbpCp.id}
                  clientId={clientId}
                  pipelineId={gbpCp.pipeline_id}
                  code="gbp"
                />
              }
            />
          </div>
        ) : null}

        {tab === "commercials" ? <CommercialsSection clientId={clientId} /> : null}

        {tab === "documents" ? (
          <DataTable
            rows={documents}
            rowKey={(d) => d.id}
            emptyMessage="No documents yet."
            columns={[
              {
                key: "doc",
                header: "Document",
                render: (d) => (
                  <>
                    {d.doc_type}
                    {d.mandatory ? <span className="text-destructive"> *</span> : null}
                  </>
                ),
              },
              {
                key: "category",
                header: "Category",
                className: "hidden sm:table-cell",
                headerClassName: "hidden sm:table-cell",
                render: (d) => <span className="capitalize text-muted-foreground">{d.category}</span>,
              },
              {
                key: "file",
                header: "File",
                className: "hidden md:table-cell",
                headerClassName: "hidden md:table-cell",
                render: (d) =>
                  isManager || isBD ? (
                    d.file_path ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-label" onClick={() => viewDocFile(d.file_path!)}>
                        View
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "status",
                header: "Status",
                render: (d) => (
                  <Select
                    value={d.status}
                    onValueChange={(v) => setDocStatus.mutate({ id: d.id, status: v, doc_type: d.doc_type })}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ),
              },
            ]}
          />
        ) : null}

        {tab === "performance" ? <HotelMainKpis clientId={clientId} month={lastCompleteMonthIST(new Date())} exclude={["gbp", "social_media"]} /> : null}
        {tab === "performance" && (gbpCp || socialCp) ? (
          <div className="mb-8 space-y-8">
            {gbpCp ? (
              <div className="space-y-3">
                <h2 className="text-section-title font-semibold">Google Business Profile (Localo)</h2>
                <SourceClientDashboard source="localo" clientPipelineId={gbpCp.id} embedded />
              </div>
            ) : null}
            {socialCp ? (
              <div className="space-y-3">
                <h2 className="text-section-title font-semibold">Social media (Metricool)</h2>
                <SourceClientDashboard source="metricool" clientPipelineId={socialCp.id} embedded />
              </div>
            ) : null}
            <h2 className="text-section-title font-semibold">Monthly reports</h2>
          </div>
        ) : null}
        {tab === "performance" ? (
          reports.length === 0 ? (
            <p className="text-small text-muted-foreground">No monthly reports yet.</p>
          ) : (
            reports.map((r) => (
              <Link
                key={r.id}
                to="/reports/$reportId"
                params={{ reportId: r.id }}
                className="card-surface flex items-center justify-between gap-4 p-5 transition-colors hover:border-primary/40"
              >
                <div>
                  <p className="font-medium">{r.client_pipelines?.pipelines?.name}</p>
                  <p className="text-label text-muted-foreground">
                    {monthLabel(r.month)} · {r.status}
                  </p>
                </div>
                <StatusPill value={average(r.kpi_entries.map((e) => e.achievement_pct))} />
              </Link>
            ))
          )
        ) : null}

        {tab === "targets" ? <KpiTargetsTab clientId={clientId} /> : null}

        {tab === "history" ? (
          <>
            <PrelaunchHistory clientId={clientId} />
            <BrandRollupCard clientId={clientId} />
            <ReportHistoryCard clientId={clientId} />
          </>
        ) : null}
      </RecordLayout>

      <EditBasicsDialog
        clientId={clientId}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client as unknown as Record<string, unknown>}
      />

      <MergeDialog
        survivorId={clientId}
        survivorName={client.hotel_name}
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        onMerged={() => qc.invalidateQueries({ queryKey: ["client", clientId] })}
      />
    </>
  );
}

function EditBasicsDialog({ clientId, open, onClose, client }: {
  clientId: string; open: boolean; onClose: () => void; client: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  type C = Partial<Record<"extra_fields"|"hotel_name"|"owner_name"|"email"|"mobile"|"whatsapp"|"city"|"state"|"address"|"number_of_rooms"|"property_type"|"website", unknown>>;
  const c = client as C;
  const ef = (c.extra_fields ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    hotel_name: (c.hotel_name as string) ?? "",
    legal_name: ef["legal_name"] ?? "",
    owner_name: (c.owner_name as string) ?? "",
    gm_name: ef["gm_name"] ?? "",
    res_contact_name: ef["res_contact_name"] ?? "",
    res_contact_phone: ef["res_contact_phone"] ?? "",
    email: (c.email as string) ?? "",
    mobile: (c.mobile as string) ?? "",
    whatsapp: (c.whatsapp as string) ?? "",
    city: (c.city as string) ?? "",
    state: (c.state as string) ?? "",
    address: (c.address as string) ?? "",
    number_of_rooms: c.number_of_rooms ? String(c.number_of_rooms) : "",
    property_type: (c.property_type as string) ?? "",
    website: (c.website as string) ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    if (!form.hotel_name.trim()) {
      toast.error("Hotel / brand name is required");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          hotel_name: form.hotel_name.trim(),
          owner_name: form.owner_name || null,
          email: form.email || null,
          mobile: form.mobile || null,
          whatsapp: form.whatsapp || null,
          city: form.city || null,
          state: form.state || null,
          address: form.address || null,
          number_of_rooms: form.number_of_rooms ? Number(form.number_of_rooms) : null,
          property_type: form.property_type || null,
          website: form.website || null,
          extra_fields: {
            ...ef,
            legal_name: form.legal_name || null,
            gm_name: form.gm_name || null,
            res_contact_name: form.res_contact_name || null,
            res_contact_phone: form.res_contact_phone || null,
          },
        })
        .eq("id", clientId);
      if (error) throw error;
      toast.success("Hotel details saved");
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const fields: Array<{ k: keyof typeof form; label: string; type?: string }> = [
    { k: "hotel_name", label: "Hotel / brand name" },
    { k: "legal_name", label: "Legal entity name" },
    { k: "owner_name", label: "Owner name" },
    { k: "gm_name", label: "General Manager name" },
    { k: "res_contact_name", label: "Reservations contact name" },
    { k: "res_contact_phone", label: "Reservations phone", type: "tel" },
    { k: "email", label: "Owner email", type: "email" },
    { k: "mobile", label: "Mobile / WhatsApp", type: "tel" },
    { k: "whatsapp", label: "WhatsApp (if different)", type: "tel" },
    { k: "city", label: "City" },
    { k: "state", label: "State" },
    { k: "address", label: "Address" },
    { k: "number_of_rooms", label: "Number of rooms", type: "number" },
    { k: "property_type", label: "Property type" },
    { k: "website", label: "Website" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-card-title font-semibold">Edit hotel basics & contacts</DialogTitle>
          <DialogDescription>Saved to the hotel's profile immediately.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.k} className="space-y-1.5">
              <Label>{f.label}</Label>
              {f.k === "property_type" ? (
                <Select value={form.property_type || "__none"} onValueChange={(v) => setForm({ ...form, property_type: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not set</SelectItem>
                    {PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input type={f.type ?? "text"} value={form[f.k]} onChange={set(f.k)} />
              )}
            </div>
          ))}
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const MERGE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "owner_name", label: "Owner name" },
  { key: "contact_person", label: "Contact person" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "pin_code", label: "PIN code" },
  { key: "website", label: "Website" },
  { key: "gst_number", label: "GSTIN" },
];

type MergeRow = Record<string, string | null> & { id: string; hotel_name: string };

function MergeDialog({
  survivorId,
  survivorName,
  open,
  onClose,
  onMerged,
}: {
  survivorId: string;
  survivorName: string;
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const navigate = useNavigate();
  const [mergedId, setMergedId] = useState("");
  const [choices, setChoices] = useState<Record<string, "survivor" | "merged">>({});
  const [confirm, setConfirm] = useState(false);

  const candidates = useQuery({
    queryKey: ["merge-candidates", survivorId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, hotel_name, city")
        .neq("id", survivorId)
        .neq("status", "merged")
        .order("hotel_name")
        .limit(500);
      if (error) throw error;
      return data as Array<{ id: string; hotel_name: string; city: string | null }>;
    },
  });

  const pair = useQuery({
    queryKey: ["merge-pair", survivorId, mergedId],
    enabled: open && Boolean(mergedId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, hotel_name, owner_name, contact_person, email, mobile, whatsapp, address, city, state, country, pin_code, website, gst_number")
        .in("id", [survivorId, mergedId]);
      if (error) throw error;
      const rows = data as unknown as MergeRow[];
      return {
        survivor: rows.find((r) => r.id === survivorId) ?? null,
        merged: rows.find((r) => r.id === mergedId) ?? null,
      };
    },
  });

  const doMerge = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("merge_clients", {
        _survivor: survivorId,
        _merged: mergedId,
        _field_choices: choices,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clients merged — the duplicate's launches, tasks, documents and KPIs moved here");
      onMerged();
      onClose();
      setMergedId("");
      setChoices({});
      setConfirm(false);
      navigate({ to: "/clients/$clientId", params: { clientId: survivorId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const survivor = pair.data?.survivor;
  const merged = pair.data?.merged;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-card-title font-semibold">Merge a duplicate into {survivorName}</DialogTitle>
          <DialogDescription>
            This record survives. All launches, tasks, documents, payments, notes and KPI rows of the
            duplicate move here. The merge is logged and can be undone from the merge record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>Duplicate record (will be merged away)</Label>
            <Select value={mergedId} onValueChange={(v) => { setMergedId(v); setChoices({}); setConfirm(false); }}>
              <SelectTrigger><SelectValue placeholder="Select the duplicate hotel" /></SelectTrigger>
              <SelectContent>
                {(candidates.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.hotel_name}{c.city ? ` — ${c.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {survivor && merged ? (
            <DataTable
              className="rounded-none bg-transparent shadow-none"
              rows={MERGE_FIELDS}
              rowKey={(f) => f.key}
              columns={[
                {
                  key: "field",
                  header: "Field",
                  render: (f) => (
                    <span className={cn("font-medium", (survivor[f.key] ?? "") !== (merged[f.key] ?? "") && "bg-warning/5")}>{f.label}</span>
                  ),
                },
                {
                  key: "survivor",
                  header: `${survivor.hotel_name} (kept)`,
                  render: (f) => {
                    const a = survivor[f.key] ?? "";
                    const differs = a !== (merged[f.key] ?? "");
                    const choice = choices[f.key] ?? "survivor";
                    return (
                      <label className="flex items-center gap-2">
                        {differs ? (
                          <input type="radio" name={`merge-${f.key}`} checked={choice === "survivor"} onChange={() => setChoices({ ...choices, [f.key]: "survivor" })} />
                        ) : null}
                        <span className={differs && choice !== "survivor" ? "text-muted-foreground line-through" : undefined}>{a || "—"}</span>
                      </label>
                    );
                  },
                },
                {
                  key: "merged",
                  header: `${merged.hotel_name} (merged away)`,
                  render: (f) => {
                    const a = survivor[f.key] ?? "";
                    const b = merged[f.key] ?? "";
                    const differs = a !== b;
                    const choice = choices[f.key] ?? "survivor";
                    return (
                      <label className="flex items-center gap-2">
                        {differs ? (
                          <input type="radio" name={`merge-${f.key}`} checked={choice === "merged"} onChange={() => setChoices({ ...choices, [f.key]: "merged" })} />
                        ) : null}
                        <span className={differs && choice !== "merged" ? "text-muted-foreground line-through" : undefined}>{b || "—"}</span>
                      </label>
                    );
                  },
                },
              ]}
            />
          ) : null}

          {mergedId ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              I understand the duplicate record will be marked as merged and cannot be edited further
            </label>
          ) : null}

          <Button
            variant="destructive"
            disabled={!mergedId || !confirm || doMerge.isPending}
            onClick={() => doMerge.mutate()}
          >
            {doMerge.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Merge into {survivorName}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
