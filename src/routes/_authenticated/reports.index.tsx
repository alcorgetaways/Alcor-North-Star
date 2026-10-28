import { fetchAll } from "@/lib/fetch-all";
import { Badge } from "@/components/ui/badge";
import { demoIn } from "@/lib/demo";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { HelpPanel } from "@/components/HelpPanel";
import { StatusPill } from "@/components/StatusPill";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORT_STATUS_LABELS } from "@/lib/constants";
import { average, monthKey, monthLabel, monthOptions, previousMonthKey } from "@/lib/kpi";
import { reportTiming, TIMING_LABEL, useCreateMonthlyReports } from "@/lib/scorecard";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Monthly KPI Reports — Alcor North Star" },
      {
        name: "description",
        content: "Draft, submit and approve monthly pipeline performance reports for every hotel.",
      },
      { property: "og:title", content: "Monthly KPI Reports — Alcor North Star" },
      { property: "og:description", content: "Draft, submit and approve monthly reports." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [clientPipelineId, setClientPipelineId] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const data = await fetchAll((from,to) => supabase.from("monthly_reports")
        .select("id, month, status, submitted_at, due_date, clients(hotel_name), client_pipelines(pipelines(name)), kpi_entries(achievement_pct)")
        .not("client_id", "in", demoIn()).order("month", { ascending: false }).order("id").range(from,to));
      return data as unknown as Array<{
        id: string;
        month: string;
        status: string;
        submitted_at: string | null;
        due_date: string | null;
        clients: { hotel_name: string } | null;
        client_pipelines: { pipelines: { name: string } | null } | null;
        kpi_entries: Array<{ achievement_pct: number | null }>;
      }>;
    },
  });

  const { data: clientPipelines = [] } = useQuery({
    queryKey: ["active-client-pipelines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_pipelines")
        .select("id, client_id, pipeline_id, clients(hotel_name), pipelines(name)").not("client_id", "in", demoIn())
        .eq("status", "active");
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        client_id: string;
        pipeline_id: string;
        clients: { hotel_name: string } | null;
        pipelines: { name: string } | null;
      }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const cp = clientPipelines.find((c) => c.id === clientPipelineId);
      if (!cp) throw new Error("Select a hotel pipeline");

      const { data: report, error } = await supabase
        .from("monthly_reports")
        .insert({ client_id: cp.client_id, client_pipeline_id: cp.id, month })
        .select("id")
        .single();
      if (error) throw error;

      // DB trigger auto-creates the KPI entries with targets; no manual insert.
      return report.id;
    },
    onSuccess: (id) => {
      toast.success("Report created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["reports"] });
      navigate({ to: "/reports/$reportId", params: { reportId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createAll = useCreateMonthlyReports();

  const visible = reports.filter((r) => filterMonth === "all" || r.month === filterMonth);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly KPI Reports"
        description="Each pipeline reports monthly. Managers approve before anything reaches a client."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isManager ? (
              <Button
                variant="outline"
                size="sm"
                disabled={createAll.isPending}
                onClick={() =>
                  createAll.mutate(undefined, {
                    onSuccess: (count) =>
                      toast.success(
                        `${count ?? 0} report${count === 1 ? "" : "s"} created for ${monthLabel(previousMonthKey(monthKey()))}`,
                      ),
                    onError: (e: Error) => toast.error(e.message),
                  })
                }
              >
                <CalendarPlus className="mr-2 h-4 w-4" /> Create last month's reports
              </Button>
            ) : null}
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthOptions(12).map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> New report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create monthly report</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Hotel &amp; pipeline</Label>
                    <Select value={clientPipelineId} onValueChange={setClientPipelineId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientPipelines.map((cp) => (
                          <SelectItem key={cp.id} value={cp.id}>
                            {cp.clients?.hotel_name} — {cp.pipelines?.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger>
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
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => create.mutate()}
                    disabled={!clientPipelineId || create.isPending}
                  >
                    Create &amp; open
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <HelpPanel
        title="How monthly KPI reports work"
        lines={[
          "Each pipeline (GMB, Website SEO, social and so on) produces one report per hotel per month; this page lists them all.",
          "Pipeline staff fill in their numbers on their own KPI page; this page is where the reports are reviewed and approved.",
          "Only management and admin can approve a report — the hotel owner sees it on MY GROWTH only after approval.",
          "Use the month filter to check which hotels are still missing a report for the current month.",
        ]}
      />

      <div className="flex flex-wrap gap-2">{["draft","submitted","late","overdue"].map((status) => <Badge key={status} variant="outline">{status.charAt(0).toUpperCase()+status.slice(1)} · {visible.filter((r) => status === "draft" || status === "submitted" ? r.status === status : reportTiming(r) === status).length}</Badge>)}</div>
      <DataTable
        rows={visible.slice(page * pageSize, (page+1) * pageSize)}
        rowKey={(r) => r.id}
        emptyMessage="No reports yet."
        columns={[
          {
            key: "hotel",
            header: "Hotel",
            render: (r) => (
              <Link
                to="/reports/$reportId"
                params={{ reportId: r.id }}
                className="font-medium hover:underline"
              >
                {r.clients?.hotel_name}
              </Link>
            ),
          },
          {
            key: "pipeline",
            header: "Pipeline",
            className: "hidden sm:table-cell",
            headerClassName: "hidden sm:table-cell",
            render: (r) => (
              <span className="text-muted-foreground">{r.client_pipelines?.pipelines?.name}</span>
            ),
          },
          {
            key: "month",
            header: "Month",
            render: (r) => (
              <>
                {monthLabel(r.month)}
                {r.due_date ? (
                  <p className="text-label text-muted-foreground">
                    Due {new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}
                  </p>
                ) : null}
              </>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <StatusBadge status={r.status} label={REPORT_STATUS_LABELS[r.status] ?? r.status} />
            ),
          },
          {
            key: "timing",
            header: "Timing",
            render: (r) => (
              <StatusBadge status={reportTiming(r)} label={TIMING_LABEL[reportTiming(r)]} />
            ),
          },
          {
            key: "achievement",
            header: "Achievement",
            render: (r) => <StatusPill value={average(r.kpi_entries.map((e) => e.achievement_pct))} />,
          },
        ]}
      />
      <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p-1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {page+1} of {Math.max(1,Math.ceil(visible.length/pageSize))} · {visible.length} reports</span><Button variant="outline" size="sm" disabled={(page+1)*pageSize >= visible.length} onClick={() => setPage((p) => p+1)}>Next</Button></div>
    </div>
  );
}
