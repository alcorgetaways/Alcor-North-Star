import { MainKpis, useMainKpis } from "@/components/MainKpis";
import { useState } from "react";
import { useSeedWhenClean } from "@/hooks/use-seed-when-clean";
import { retryUnless4xx } from "@/lib/form-rules";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Save, Send, CheckCircle2, RotateCcw, RefreshCw, MoreHorizontal } from "lucide-react";
import { ProgressRing } from "@/components/ProgressRing";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveStaff } from "@/lib/staff";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/FormSection";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { REPORT_STATUS_LABELS } from "@/lib/constants";
import { average, formatValue, growth, monthLabel } from "@/lib/kpi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadReportPdf } from "@/lib/report-pdf";
import { PipelineBaselines } from "@/components/PipelineBaselines";

export const Route = createFileRoute("/_authenticated/reports/$reportId")({
  head: () => ({
    meta: [
      { title: "Monthly Report — Alcor North Star" },
      {
        name: "description",
        content: "Review KPI performance against management targets, add highlights and submit for approval.",
      },
      { property: "og:title", content: "Monthly Report — Alcor North Star" },
      { property: "og:description", content: "KPI performance, highlights and approvals." },
    ],
  }),
  component: ReportDetail,
});

type Entry = {
  id: string;
  kpi_definition_id: string;
  target: number | null;
  target_status: string | null;
  provisional_target: number | null;
  actual: number | null;
  text_value: string | null;
  comment: string | null;
  achievement_pct: number | null;
  red_reason: string | null;
  corrective_action: string | null;
  action_owner_id: string | null;
  action_deadline: string | null;
  kpi_definitions: {
    name: string;
    kpi_type: string;
    unit: string | null;
    direction: string;
    source_key: string | null;
    definition: string | null;
  } | null;
};

/** Where the actual number comes from / who sets the target. */
function sourceLabel(sk: string | null | undefined): string {
  if (!sk) return "";
  if (sk.startsWith("weekly.")) return "from the Weekly ads page";
  if (sk.startsWith("social.")) return "from the Social page";
  if (sk.startsWith("gbp.")) return "from the GBP page";
  if (sk.startsWith("ota.")) return "from the OTA page";
  if (sk.startsWith("pke.")) return "from the pipeline page";
  return "";
}

const isRed = (e: Entry) => e.achievement_pct !== null && e.achievement_pct < 70;
const missingPlan = (e: Entry) =>
  isRed(e) &&
  (!e.red_reason?.trim() || !e.corrective_action?.trim() || !e.action_owner_id || !e.action_deadline);

function ReportDetail() {
  const { reportId } = Route.useParams();
  const qc = useQueryClient();
  const { isManager, profile } = useAuth();

  const reportQ = useQuery({
    retry: retryUnless4xx,
    queryKey: ["report", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select(
          "*, clients(hotel_name, client_code, property_type), client_pipelines(weight, pipelines(name, code)), kpi_entries(id, kpi_definition_id, target, target_status, provisional_target, actual, text_value, comment, achievement_pct, red_reason, corrective_action, action_owner_id, action_deadline, kpi_definitions(name, kpi_type, unit, direction, source_key, definition))",
        )
        .eq("id", reportId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as {
        id: string;
        month: string;
        status: string;
        client_pipeline_id: string;
        challenges: string | null;
        next_month_action: string | null;
        manager_comments: string | null;
        highlights: string[];
        work_items: string[];
        am_review_comment: string | null;
        clients: { hotel_name: string; client_code: string | null; property_type: string | null } | null;
        client_pipelines: { pipelines: { name: string; code: string } | null } | null;
        kpi_entries: Entry[];
      } | null;
    },
  });
  const report = reportQ.data ?? undefined;
  const mainQ = useMainKpis(report?.client_pipeline_id ?? "", report?.month ?? "2000-01-01");

  const { data: prev } = useQuery({
    queryKey: ["report-prev", reportId, report?.client_pipeline_id, report?.month],
    enabled: !!report,
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_reports")
        .select("month, kpi_entries(kpi_definition_id, actual)")
        .eq("client_pipeline_id", report!.client_pipeline_id)
        .eq("status", "approved")
        .lt("month", report!.month)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { month: string; kpi_entries: Array<{ kpi_definition_id: string; actual: number | null }> } | null;
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-mini"],
    queryFn: fetchActiveStaff,
  });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [narrative, setNarrative] = useState({
    highlights: "",
    work_items: "",
    challenges: "",
    next_month_action: "",
    manager_comments: "",
  });

  useSeedWhenClean(report, dirty, (r) => {
    setEntries(
      [...r.kpi_entries].sort((a, b) =>
        (a.kpi_definitions?.name ?? "").localeCompare(b.kpi_definitions?.name ?? ""),
      ),
    );
    setNarrative({
      highlights: (r.highlights ?? []).join("\n"),
      work_items: (r.work_items ?? []).join("\n"),
      challenges: r.challenges ?? "",
      next_month_action: r.next_month_action ?? "",
      manager_comments: r.manager_comments ?? "",
    });
    setDirty(false);
  });

  // Approved reports are read-only for everyone; management reopens instead.
  const locked = report ? report.status === "approved" : false;
  const editable = report ? report.status === "draft" || report.status === "submitted" || report.status === "review" : false;
  const score = average(entries.map((e) => e.achievement_pct));

  const refreshNumbers = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("refresh_report_kpis", { _report_id: reportId });
      if (error) throw error;
    },
    onSuccess: (_v) => {
      toast.success("Numbers refreshed from the pipeline pages");
      void qc.invalidateQueries({ queryKey: ["report", reportId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("monthly_reports")
        .update({
          highlights: narrative.highlights.split("\n").filter(Boolean),
          work_items: narrative.work_items.split("\n").filter(Boolean),
          challenges: narrative.challenges || null,
          next_month_action: narrative.next_month_action || null,
          ...(isManager ? { manager_comments: narrative.manager_comments || null } : {}),
        })
        .eq("id", reportId);
      if (error) throw error;

      for (const e of entries) {
        // Target and actual are set by the database from the pipeline pages —
        // the report screen never writes them.
        const { error: e2 } = await supabase
          .from("kpi_entries")
          .update({
            text_value: e.text_value,
            comment: e.comment,
            red_reason: isRed(e) ? e.red_reason : null,
            corrective_action: isRed(e) ? e.corrective_action : null,
            action_owner_id: isRed(e) ? e.action_owner_id : null,
            action_deadline: isRed(e) ? e.action_deadline : null,
          })
          .eq("id", e.id);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      setDirty(false);
      toast.success("Report saved");
      void qc.invalidateQueries({ queryKey: ["report", reportId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "draft" | "submitted" | "approved") => {
      const patch: Record<string, unknown> = { status };
      if (status === "submitted") patch["submitted_at"] = new Date().toISOString();
      if (status === "approved") {
        patch["approved_at"] = new Date().toISOString();
        patch["approved_by"] = profile?.id ?? null;
      }
      const { error } = await supabase
        .from("monthly_reports")
        .update(patch as never)
        .eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      void qc.invalidateQueries({ queryKey: ["report", reportId] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateEntry(id: string, patch: Partial<Entry>) {
    setDirty(true);
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        return { ...e, ...patch };
      }),
    );
  }

  function editNarrative(patch: Partial<typeof narrative>) {
    setDirty(true);
    setNarrative((n) => ({ ...n, ...patch }));
  }

  function exportPdf(clientSafe: boolean) {
    if (!report) return;
    downloadReportPdf({
      clientSafe,
      hotelName: report.clients?.hotel_name ?? "Hotel",
      propertyType: report.clients?.property_type ?? null,
      clientCode: report.clients?.client_code ?? null,
      pipelineName: report.client_pipelines?.pipelines?.name ?? "Pipeline",
      month: report.month,
      score,
      mainKpis: mainQ.data?.map((k) => ({ name: k.name, actual: k.value == null ? "Not tracked yet" : formatValue(k.value, k.kpi_type) })),
      kpis: entries.map((e) => ({
        name: e.kpi_definitions?.name ?? "KPI",
        target: formatValue(e.target, e.kpi_definitions?.kpi_type ?? "number"),
        actual:
          e.kpi_definitions?.kpi_type === "text"
            ? (e.text_value ?? "—")
            : formatValue(e.actual, e.kpi_definitions?.kpi_type ?? "number"),
        achievement: e.achievement_pct,
      })),
      highlights: narrative.highlights.split("\n").filter(Boolean),
      workItems: narrative.work_items.split("\n").filter(Boolean),
      challenges: clientSafe ? null : narrative.challenges,
      nextMonthAction: narrative.next_month_action,
      managerComments: clientSafe ? null : narrative.manager_comments,
    });
  }

  const prevActual = new Map(
    (prev?.kpi_entries ?? []).map((k) => [k.kpi_definition_id, k.actual]),
  );

  if (reportQ.isError) {
    return <p role="alert" className="text-sm text-destructive">This report couldn't be loaded: {(reportQ.error as Error).message}. Check the link or go back to Reports.</p>;
  }
  if (reportQ.data === null) {
    return <p role="alert" className="text-sm text-muted-foreground">Report not found, or you don't have access to it.</p>;
  }
  if (!report) {
    return <p className="text-sm text-muted-foreground">Loading report…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/reports"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All reports
      </Link>

      <div className="flex items-start gap-4">
        <ProgressRing value={score} size="medium" label="report score" className="mt-1" />
        <div className="min-w-0 flex-1">
      <PageHeader
        title={`${report.clients?.hotel_name ?? "Report"} — ${report.client_pipelines?.pipelines?.name ?? ""}`}
        description={`${monthLabel(report.month)} · ${REPORT_STATUS_LABELS[report.status] ?? report.status}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={score} />
            {report.status === "draft" ? (
              <ConfirmButton
                size="sm"
                doneLabel="Submitted"
                onConfirm={async () => {
                  if (entries.some(missingPlan)) {
                    toast.error("Every red KPI needs what went wrong, corrective action, owner and deadline");
                    return false;
                  }
                  await save.mutateAsync();
                  // No actual figures at all: the database asks for an explicit "no data" reason.
                  if (entries.length && entries.every((e) => e.actual == null)) {
                    const reason = window.prompt("No actual figures are entered. Why is there no data this month?")?.trim();
                    if (!reason) return false;
                    const { error } = await supabase.from("monthly_reports").update({ no_data_reason: reason } as never).eq("id", reportId);
                    if (error) { toast.error(error.message); return false; }
                  }
                  return setStatus.mutateAsync("submitted");
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Submit
              </ConfirmButton>
            ) : null}
            {isManager && report.status === "submitted" ? (
              <ConfirmButton
                size="sm"
                doneLabel="Approved"
                onConfirm={() => setStatus.mutateAsync("approved")}
                disabled={dirty}
                title={dirty ? "Save your changes before approving" : undefined}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </ConfirmButton>
            ) : null}
            <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><MoreHorizontal className="mr-2 h-4 w-4" /> More</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!locked && editable ? (
                    <DropdownMenuItem onSelect={() => save.mutate()} disabled={save.isPending}>
                      <Save className="mr-2 h-4 w-4" /> Save
                    </DropdownMenuItem>
                  ) : null}
                  {!locked ? (
                    <DropdownMenuItem onSelect={() => refreshNumbers.mutate()} disabled={refreshNumbers.isPending || dirty} title={dirty ? "Save your changes before refreshing numbers" : "Re-read the numbers from the weekly, social, GBP, OTA and pipeline pages"}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${refreshNumbers.isPending ? "animate-spin" : ""}`} /> Refresh numbers
                    </DropdownMenuItem>
                  ) : null}
                  {isManager && report.status !== "draft" ? (
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem><RotateCcw className="mr-2 h-4 w-4" /> Reopen</DropdownMenuItem>
                    </AlertDialogTrigger>
                  ) : null}
                  <DropdownMenuItem onSelect={() => exportPdf(false)}><Download className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportPdf(true)}><Download className="mr-2 h-4 w-4" /> Client copy</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reopen this report?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The report goes back to draft so the numbers and text can be changed again.
                    The hotel stops seeing it until it is approved once more.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it approved</AlertDialogCancel>
                  <AlertDialogAction onClick={() => setStatus.mutate("draft")}>Reopen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />
        </div>
      </div>

      {locked ? (
        <p className="rounded-lg border border-border/70 bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          This report is approved and read-only. Management can reopen it to make changes.
        </p>
      ) : null}
      <MainKpis clientPipelineId={report.client_pipeline_id} month={report.month} />
      <h2 className="text-section-title font-semibold">All KPIs</h2>
      <PipelineBaselines pipelineId={report.client_pipeline_id} />
      <section className="space-y-2"><h2 className="text-section-title font-semibold">Account Manager review · optional</h2><Textarea defaultValue={report.am_review_comment??""} disabled={locked} onBlur={async(e)=>{if(e.target.value===(report.am_review_comment??""))return;const {error}=await supabase.from("monthly_reports").update({am_review_comment:e.target.value||null}).eq("id",reportId);if(error)toast.error(error.message);else toast.success("Review comment saved");}}/></section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title font-semibold">KPI performance</h2>
          <Badge variant="outline">{entries.length} KPIs</Badge>
        </div>
        <DataTable<Entry>
          rows={entries}
          rowKey={(e) => e.id}
          emptyMessage="No KPIs configured for this pipeline yet."
          expandedContent={(e) =>
            isRed(e) ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="mb-2 text-label font-medium text-destructive">
                  Red KPI · recovery plan required (creates an action item)
                </p>
                <div className="grid gap-2 md:grid-cols-4">
                  <Input
                    className="h-8"
                    disabled={locked}
                    placeholder="What went wrong"
                    value={e.red_reason ?? ""}
                    onChange={(ev) => updateEntry(e.id, { red_reason: ev.target.value })}
                  />
                  <Input
                    className="h-8"
                    disabled={locked}
                    placeholder="Corrective action"
                    value={e.corrective_action ?? ""}
                    onChange={(ev) => updateEntry(e.id, { corrective_action: ev.target.value })}
                  />
                  <Select
                    disabled={locked}
                    value={e.action_owner_id ?? ""}
                    onValueChange={(v) => updateEntry(e.id, { action_owner_id: v })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8"
                    type="date"
                    disabled={locked}
                    value={e.action_deadline ?? ""}
                    onChange={(ev) =>
                      updateEntry(e.id, { action_deadline: ev.target.value || null })
                    }
                  />
                </div>
              </div>
            ) : null
          }
          columns={[
            {
              key: "kpi",
              header: "KPI",
              render: (e) => {
                const isText = e.kpi_definitions?.kpi_type === "text";
                const src = sourceLabel(e.kpi_definitions?.source_key);
                return (
                  <>
                    <p className="font-medium" title={e.kpi_definitions?.definition ?? undefined}>
                      {e.kpi_definitions?.name}
                    </p>
                    <p className="text-label text-muted-foreground">
                      {e.kpi_definitions?.unit ? `${e.kpi_definitions.unit} · ` : ""}
                      {src || (isText ? "" : "target set by management")}
                    </p>
                  </>
                );
              },
            },
            {
              key: "target",
              header: "Target",
              render: (e) => {
                const isText = e.kpi_definitions?.kpi_type === "text";
                const fmt = e.kpi_definitions?.kpi_type ?? "number";
                return (
                  <span className="text-muted-foreground" title="Targets are set by management on the client's Targets tab">
                    {isText ? "—" : e.target_status === "provisional"
                      ? <>{formatValue(e.provisional_target, fmt)} <span className="block text-label text-warning-foreground">Provisional — not scored yet</span></>
                      : e.target_status === "baseline"
                        ? <span className="text-label">Baseline month — no target</span>
                        : e.target_status === "missing"
                          ? <span className="text-label text-destructive">No target yet</span>
                          : formatValue(e.target, fmt)}
                  </span>
                );
              },
            },
            {
              key: "actual",
              header: "Actual",
              render: (e) => {
                const isText = e.kpi_definitions?.kpi_type === "text";
                const src = sourceLabel(e.kpi_definitions?.source_key);
                const fmt = e.kpi_definitions?.kpi_type ?? "number";
                return isText ? (
                  <Input
                    className="h-8 w-40"
                    disabled={locked}
                    value={e.text_value ?? ""}
                    onChange={(ev) => updateEntry(e.id, { text_value: ev.target.value })}
                  />
                ) : (
                  <span className="text-muted-foreground" title={src ? `Filled automatically ${src}` : undefined}>
                    {formatValue(e.actual, fmt)}
                  </span>
                );
              },
            },
            {
              key: "prev",
              header: prev ? `Prev (${monthLabel(prev.month)})` : "Prev",
              render: (e) => {
                const isText = e.kpi_definitions?.kpi_type === "text";
                const fmt = e.kpi_definitions?.kpi_type ?? "number";
                return (
                  <span className="text-muted-foreground">
                    {isText ? "—" : formatValue(prevActual.get(e.kpi_definition_id) ?? null, fmt)}
                  </span>
                );
              },
            },
            {
              key: "mom",
              header: "MoM",
              render: (e) => {
                const isText = e.kpi_definitions?.kpi_type === "text";
                const p = prevActual.get(e.kpi_definition_id) ?? null;
                const mom = isText ? null : growth(e.actual, p);
                const lowerBetter = e.kpi_definitions?.direction === "lower_better";
                const withinBudget = e.kpi_definitions?.direction === "within_budget";
                const good = mom === null ? null : lowerBetter || withinBudget ? mom <= 0 : mom >= 0;
                return mom === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={good ? "font-medium text-success" : "font-medium text-destructive"}>
                    {mom > 0 ? "+" : ""}
                    {mom.toFixed(1)}%
                  </span>
                );
              },
            },
            {
              key: "achievement",
              header: "Achievement",
              render: (e) => <StatusPill value={e.achievement_pct} />,
            },
            {
              key: "comment",
              header: "Comment",
              render: (e) => (
                <Input
                  className="h-8"
                  disabled={locked}
                  value={e.comment ?? ""}
                  onChange={(ev) => updateEntry(e.id, { comment: ev.target.value })}
                  placeholder="Optional note"
                />
              ),
            },
          ]}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <FormSection title="Highlights" description="One per line.">
          <Textarea
            rows={5}
            disabled={locked}
            value={narrative.highlights}
            onChange={(e) => editNarrative({ highlights: e.target.value })}
          />
        </FormSection>
        <FormSection title="Work completed" description="One per line.">
          <Textarea
            rows={5}
            disabled={locked}
            value={narrative.work_items}
            onChange={(e) => editNarrative({ work_items: e.target.value })}
          />
        </FormSection>
        <FormSection title="Challenges">
          <Textarea
            rows={4}
            disabled={locked}
            value={narrative.challenges}
            onChange={(e) => editNarrative({ challenges: e.target.value })}
          />
        </FormSection>
        <FormSection title="Next month's focus">
          <Textarea
            rows={4}
            disabled={locked}
            value={narrative.next_month_action}
            onChange={(e) => editNarrative({ next_month_action: e.target.value })}
          />
        </FormSection>
        {isManager ? (
          <FormSection
            title="Management comments"
            description="Internal — never shown to the hotel or included in the client copy."
            className="lg:col-span-2"
          >
            <Textarea
              rows={3}
              disabled={locked}
              value={narrative.manager_comments}
              onChange={(e) => editNarrative({ manager_comments: e.target.value })}
            />
          </FormSection>
        ) : null}
      </section>
    </div>
  );
}
