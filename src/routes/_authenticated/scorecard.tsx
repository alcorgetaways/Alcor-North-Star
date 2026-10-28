import { ActivityPersonScorecard } from "@/components/ActivityPersonScorecard";
import { demoIn } from "@/lib/demo";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { DepartmentScorecards } from "@/components/DepartmentScorecards";
import { RdGradesTable } from "@/components/ResDesk";
import { SegmentedPill } from "@/components/SegmentedPill";
import { periodBounds } from "@/lib/rd-periods";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BAND_CLASS,
  BAND_LABEL,
  band,
  useSaveScorecardSettings,
  useScorecardSettings,
  useTeamScorecard,
  type TeamScoreRow,
} from "@/lib/scorecard";
import { monthLabel, monthOptions, previousMonthKey, monthKey } from "@/lib/kpi";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scorecard")({
  head: () => ({
    meta: [
      { title: "Team Scorecard — Alcor North Star" },
      {
        name: "description",
        content: "Monthly scorecard for the team: KPI achievement, on-time reporting, launch discipline and red actions.",
      },
      { property: "og:title", content: "Team Scorecard — Alcor North Star" },
      { property: "og:description", content: "Monthly team performance scorecard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScorecardPage,
});

function NullAware({ value, children }: { value: number | null | undefined; children?: React.ReactNode }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>No data this month</TooltipContent>
      </Tooltip>
    );
  }
  return <>{children}</>;
}

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: settings } = useScorecardSettings(open);
  const [weights, setWeights] = useState({ kpi: 50, on_time: 20, launch: 20, red_actions: 10 });
  const [deadlineDay, setDeadlineDay] = useState(5);
  const [bands, setBands] = useState({green:90,amber:70});
  const save = useSaveScorecardSettings();

  useEffect(() => {
    if (settings && open) {
      setWeights(settings.weights);
      setDeadlineDay(settings.deadlineDay);
      setBands(settings.bands);
    }
  }, [settings, open]);

  const sum = weights.kpi + weights.on_time + weights.launch + weights.red_actions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scoring settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["kpi", "KPI achievement"],
                ["on_time", "On-time reports"],
                ["launch", "Launch discipline"],
                ["red_actions", "Red actions"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={weights[key]}
                  onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <p className={cn("text-xs", sum === 100 ? "text-muted-foreground" : "text-destructive")}>
            Weights must add up to 100 — currently {sum}.
          </p>
          <div className="space-y-1.5">
            <Label>Report deadline day of the month (1–28)</Label>
            <Input
              type="number"
              min={1}
              max={28}
              value={deadlineDay}
              onChange={(e) => setDeadlineDay(Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Green from</Label><Input type="number" min={0} max={100} value={bands.green} onChange={(e)=>setBands({...bands,green:Number(e.target.value)})}/></div><div><Label>Amber from (Red below)</Label><Input type="number" min={0} max={100} value={bands.amber} onChange={(e)=>setBands({...bands,amber:Number(e.target.value)})}/></div></div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              save.mutate(
                { weights, deadlineDay, bands },
                {
                  onSuccess: () => toast.success("Scoring settings saved"),
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
            disabled={save.isPending || sum !== 100 || deadlineDay < 1 || deadlineDay > 28}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberDrilldown({ member, month }: { member: TeamScoreRow; month: string }) {
  const { data: reports = [] } = useQuery({
    queryKey: ["scorecard-member-reports", member.user_id, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("scorecard_member_reports", { _person: member.user_id, _month: month });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        status: string;
        clients: { hotel_name: string } | null;
        client_pipelines: { pipelines: { name: string } | null } | null;
      }>;
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="text-label-muted">
          This month's reports
        </h4>
        {reports.length === 0 ? (
          <p className="mt-2 text-small text-muted-foreground">No reports created by this member.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {reports.map((r) => (
              <li key={r.id} className="text-small">
                <Link
                  to="/reports/$reportId"
                  params={{ reportId: r.id }}
                  className="font-medium hover:underline"
                >
                  {r.clients?.hotel_name}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {r.client_pipelines?.pipelines?.name} · {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-label-muted">Actions</h4>
        <p className="mt-2 text-small text-muted-foreground">
          Open actions: {member.open_actions ?? "—"} · Overdue: {member.overdue_actions ?? "—"} ·
          Red-action score:{" "}
          {member.red_action_score == null ? "—" : `${member.red_action_score}%`}
        </p>
      </div>
    </div>
  );
}

function ScorecardPage() {
  const { isManager, user } = useAuth();
  // Default to last month — the work being scored is finished work.
  const [month, setMonth] = useState(previousMonthKey(monthKey()));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState("team");

  const { data: rows = [], isLoading } = useTeamScorecard(month, true);

  const visible = rows; // The RPC enforces self/head/BD/HR/management scope.

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
      <PageHeader
        title="Team Scorecard"
        description="KPI achievement, on-time reporting, launch discipline and red actions — one score per person."
        actions={
          <div className="flex items-center gap-2">
            {isManager ? (
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" /> Scoring settings
              </Button>
            ) : null}
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-lg border border-border/70 bg-card px-3 text-sm"
            >
              {monthOptions(12).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <SegmentedPill
        ariaLabel="Scorecard section"
        value={section}
        onChange={setSection}
        items={[{ value: "team", label: "Team" }, { value: "departments", label: "Departments" }, { value: "res-desk", label: "Res Desk" }, { value: "activity", label: "Activity" }]}
      />
      <div hidden={section !== "res-desk"}><RdGradesTable {...periodBounds("month", month)} /></div>
      <div hidden={section !== "departments"}><DepartmentScorecards month={month} /></div>
      <div hidden={section !== "activity"}><ActivityPersonScorecard month={month} /></div>
      <div hidden={section !== "team"}>

      <DataTable<TeamScoreRow>
        rows={visible}
        rowKey={(r) => r.user_id}
        loading={isLoading}
        emptyMessage={`No scorecard data for ${monthLabel(month)}.`}
        onRowClick={(r) => setExpanded(expanded === r.user_id ? null : r.user_id)}
        expandedContent={(r) => (expanded === r.user_id ? <MemberDrilldown member={r} month={month} /> : null)}
        columns={[
          {
            key: "person",
            header: "Person",
            render: (r) => (
              <>
                <p className="font-medium">{r.full_name}</p>
                <p className="text-label text-muted-foreground capitalize">{r.role}</p>
              </>
            ),
          },
          {
            key: "overall",
            header: "Overall",
            render: (r) => {
              const b = band(r.overall_score);
              return (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-label font-semibold",
                    BAND_CLASS[b],
                  )}
                >
                  {r.overall_score == null ? "—" : `${Math.round(r.overall_score)}%`} · {BAND_LABEL[b]}
                </span>
              );
            },
          },
          {
            key: "kpi",
            header: "KPI achievement",
            render: (r) => (
              <NullAware value={r.kpi_pct}>
                <span>{r.kpi_pct == null ? "—" : `${Math.round(r.kpi_pct)}%`}</span>
              </NullAware>
            ),
          },
          {
            key: "ontime",
            header: "On-time reporting",
            render: (r) => (
              <NullAware value={r.on_time_pct}>
                <span>
                  {r.on_time_pct == null
                    ? "—"
                    : `${Math.round(r.on_time_pct)}% (${r.reports_on_time}/${r.reports_due})`}
                </span>
              </NullAware>
            ),
          },
          {
            key: "launch",
            header: "Launch discipline",
            render: (r) => (
              <NullAware value={r.launch_pct}>
                <span>
                  {r.launch_pct == null
                    ? "—"
                    : `${Math.round(r.launch_pct)}% (${r.tasks_on_time}/${r.tasks_due})`}
                </span>
              </NullAware>
            ),
          },
          { key: "open", header: "Open red actions", align: "right", render: (r) => r.open_actions ?? 0 },
          {
            key: "overdue",
            header: "Overdue",
            align: "right",
            render: (r) =>
              r.overdue_actions ? (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  {r.overdue_actions}
                </Badge>
              ) : (
                0
              ),
          },
          {
            key: "chevron",
            header: "",
            align: "right",
            render: (r) => (
              <ChevronRight
                className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", expanded === r.user_id && "rotate-90")}
              />
            ),
          },
        ]}
      />
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    </TooltipProvider>
  );
}
