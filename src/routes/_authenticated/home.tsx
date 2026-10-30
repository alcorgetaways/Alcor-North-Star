import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { downloadCombinedReportPdf } from "@/lib/report-pdf";
import type { CombinedReport } from "@/lib/combined-report";
import { BlockedTasks } from "@/components/BlockedTasks";
import { WhoPays } from "@/components/WhoPays";
import { InfluencerPrograms } from "@/components/InfluencerPrograms";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock3, Download, FileText, Loader2, LockKeyhole, Rocket, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { OwnerQuestionsPanel } from "@/components/QuestionsPanel";
import { Button } from "@/components/ui/button";
import { useMyHotel } from "@/lib/my-hotel";
import { BAND_LABEL, useHotelScorecard } from "@/lib/scorecard";
import { monthKey, monthLabel, previousMonthKey } from "@/lib/kpi";
import { INVOICE_TYPE_LABEL, type InvoiceStatus } from "@/lib/invoices";
import { StatusBadge } from "@/components/finance/Invoices";
import { MetricCard } from "@/components/MetricCard";
import { ProgressRing } from "@/components/ProgressRing";
import { SegmentedPill } from "@/components/SegmentedPill";
import { AlertStack } from "@/components/AlertStack";
import { CardSkeleton, QueryError } from "@/components/Skeletons";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";

type OwnerInvoice = {
  id: string; hotel_name: string; invoice_no: string; invoice_type: keyof typeof INVOICE_TYPE_LABEL; amount_inr: number;
  raised_on: string; due_on: string; status: InvoiceStatus; paid_amount_inr: number; late_interest_pct: number | null;
};

/** Only this hotel's invoices, via my_invoices() — internal notes are never returned. Hidden when there are none. */
function OwnerInvoices() {
  const { data = [] } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_invoices");
      if (error) throw error;
      return data as unknown as OwnerInvoice[];
    },
  });
  if (!data.length) return null;
  const multi = new Set(data.map((i) => i.hotel_name)).size > 1;
  const d = (x: string) => new Date(`${x}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <section>
      <h2 className="mb-3 text-section-title font-semibold">Invoices</h2>
      <ul className="divide-y divide-border/60 card-surface">
        {data.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{i.invoice_no}</span>
            <span className="text-muted-foreground">{INVOICE_TYPE_LABEL[i.invoice_type]}{multi ? ` · ${i.hotel_name}` : ""}</span>
            <span className="text-muted-foreground">Due {d(i.due_on)}</span>
            <span className="ml-auto tabular-nums">₹{Number(i.amount_inr).toLocaleString("en-IN")}</span>
            {i.status === "part_paid" ? <span className="text-xs text-muted-foreground">paid ₹{Number(i.paid_amount_inr).toLocaleString("en-IN")}</span> : null}
            <StatusBadge s={i.status} />
          </li>
        ))}
      </ul>
      {data.some((i) => i.status === "overdue" && i.late_interest_pct) ? (
        <p className="mt-2 text-xs text-muted-foreground">Overdue invoices carry late interest as per your agreement.</p>
      ) : null}
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — Alcor North Star" },
      { name: "description", content: "Your hotel's launch, growth, reports and questions in one place." },
      { property: "og:title", content: "Home — Alcor North Star" },
      { property: "og:description", content: "Your hotel's launch, growth, reports and questions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerHome,
});

type LaunchSummary = {
  plan: string;
  status: string;
  progress_pct: number | null;
  week?: number;
  total_weeks?: number;
  waiting_on_you: unknown[] | null;
} | null;

type PipelineStatus = { code: string; name: string; active: boolean; pending: boolean };

const ROADMAP_STEPS = ["Access", "Inputs", "Activation", "Go-live QC", "Day-0 baseline"];

function OwnerHome() {
  const { profile, loading: authLoading } = useAuth();
  const clientId = profile?.client_id ?? "";
  const { data: hotel } = useMyHotel(clientId);
  const lastMonth = previousMonthKey(monthKey());
  const { data: scorecard } = useHotelScorecard(clientId, lastMonth);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const { data: contact } = useQuery({
    queryKey: ["my-alcor-contact"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_alcor_contact");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
  const { data: team } = useQuery({ queryKey: ["my-alcor-team"], queryFn: async () => { const {data,error}=await supabase.rpc("my_alcor_team"); if(error)throw error; return data as unknown as {account_manager:string|null;heads:Array<{pipeline:string;name:string|null}>}; } });
  const { data: documents = [] } = useQuery({ queryKey: ["my-documents"], queryFn: async () => {const {data,error}=await supabase.rpc("my_documents");if(error)throw error;return data as unknown as Array<{id:string;type:string;file_path:string;status:string}>;} });

  const [tab, setTab] = useState("overview");
  const { data: prevScore } = useHotelScorecard(clientId, previousMonthKey(lastMonth));
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const { data: launch, isLoading: launchLoading, error: launchError } = useQuery({
    queryKey: ["my-launch"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_launch");
      if (error) throw error;
      return (data ?? null) as unknown as LaunchSummary;
    },
  });

  const { data: pipelineStatuses = [] } = useQuery({
    queryKey: ["my-pipeline-status", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_pipeline_status");
      if (error) throw error;
      return (data ?? []) as unknown as PipelineStatus[];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["home-approved-reports", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("id, month, client_pipelines(pipelines(code))")
        .eq("status", "approved")
        .order("month", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as unknown as Array<{ id: string; month: string; client_pipelines: { pipelines: { code: string } | null } | null }>;
    },
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["my-properties", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, hotel_name")
        .eq("parent_client_id", clientId)
        .order("hotel_name");
      if (error) throw error;
      return data as Array<{ id: string; hotel_name: string }>;
    },
  });

  const months = Array.from(new Set(reports.map((r) => r.month))).slice(0, 12);

  async function downloadMonth(m: string) {
    setPdfBusy(m);
    try {
      const { data, error } = await supabase.rpc("combined_monthly_report", { _client: clientId, _month: m });
      if (error) throw error;
      downloadCombinedReportPdf(data as unknown as CombinedReport);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the PDF");
    } finally {
      setPdfBusy(null);
    }
  }

  if (authLoading && !clientId) return <CardSkeleton className="h-72" />;
  if (!clientId) {
    return <ClientDashboardPreview />;
  }

  const waiting = launch?.waiting_on_you?.length ?? 0;
  const showLaunch = !!launch && !["live", "closed"].includes(launch.status);
  const score = scorecard?.overall;

  return (
    <div className="space-y-6">
      <PageHeader
        title={hotel?.hotel_name ?? "Your hotel"}
        description={launch?.plan ? `Plan: ${launch.plan}` : undefined}
        tabs={<SegmentedPill ariaLabel="Home sections" items={[{ value: "overview", label: "Overview" }, { value: "account", label: "Account" }]} value={tab} onChange={setTab} />}
      />
      <div className="pt-2" />
      {tab === "overview" ? (
        <>
          <BlockedTasks owner />
          <QueryError error={launchError} what="your launch" />
          <div className="grid gap-4 lg:grid-cols-3">
            {launchLoading ? (
              <CardSkeleton className="h-52" />
            ) : showLaunch ? (
              <Link to="/my-launch" className="card-surface group flex items-center gap-5 p-5 transition-colors hover:border-gold/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <ProgressRing size="large" value={launch?.progress_pct ?? null} caption={launch?.week ? `Week ${launch.week} of ${launch.total_weeks}` : "Launch progress"} label="of launch steps done" />
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-1.5 text-label-muted"><Rocket className="h-3.5 w-3.5 text-gold" /> My Launch</p>
                  <p className="text-section-title font-semibold">Waiting on you: {waiting}</p>
                  <p className="text-label text-muted-foreground">{waiting ? "Open to approve" : "Nothing needed now"}</p>
                </div>
              </Link>
            ) : null}
            <Link to="/my-growth" className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              <MetricCard
                id={`home-score-${clientId}-${lastMonth}`}
                className="h-full transition-colors hover:border-gold/50"
                label="My Growth score"
                value={score == null ? null : Math.round(score)}
                format={(n) => `${n}%`}
                missing="not_approved"
                tone="gold"
                delta={score != null && prevScore?.overall != null ? { pct: Math.round(score) - Math.round(prevScore.overall), vs: monthLabel(previousMonthKey(lastMonth)), suffix: " pts" } : undefined}
                footer={scorecard && score != null ? `${BAND_LABEL[scorecard.band]} · ${monthLabel(lastMonth)}` : `${monthLabel(lastMonth)} appears once approved`}
              />
            </Link>
            <AlertStack
              title="Notifications"
              allTo="/notifications"
              items={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, to: n.link, at: n.created_at, unread: !n.read_at }))}
            />
          </div>

          <section className="card-surface overflow-hidden">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-section-title font-semibold">Your service roadmaps</h2>
                  <p className="mt-1 text-sm text-muted-foreground">All nine client-facing pipelines are listed. Included services are available; the others stay locked until added to your plan.</p>
                </div>
                <Badge variant="outline" className="border-gold/40">P0 first · pipelines follow</Badge>
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-gold/40 bg-gold/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">P0 · Core onboarding</p>
                  <Badge variant="outline">First 15 days</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Property details, access, plan inputs and baseline setup.</p>
                {launch ? <p className="mt-3 text-xs text-muted-foreground">{launch.progress_pct == null ? "Progress is being prepared" : `${Math.round(launch.progress_pct)}% of onboarding steps complete`}</p> : null}
              </div>
              {pipelineStatuses.map((p) => (
                <div key={p.code} className={`rounded-lg border p-4 ${p.active ? "border-border/70" : "border-border/50 bg-muted/30"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-medium ${!p.active && "text-muted-foreground"}`}>{p.name}</p>
                    {p.active ? <Badge variant="outline">In your plan</Badge> : (
                      <Badge variant={p.pending ? "secondary" : "outline"} className="gap-1">
                        <LockKeyhole className="h-3 w-3" />
                        {p.pending ? "Activation requested" : "Not in plan"}
                      </Badge>
                    )}
                  </div>
                  {p.active ? (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${p.name} roadmap stages`}>
                      {ROADMAP_STEPS.map((step, i) => (
                        <span key={step} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          {i > 0 ? <span aria-hidden="true">›</span> : null}{step}
                        </span>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-sm text-muted-foreground">This pipeline isn’t accessible on the current plan.</p>}
                </div>
              ))}
              {!pipelineStatuses.length ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                  Your pipeline list is loading or is not available for this account yet.
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex items-center gap-3 card-surface p-5 text-sm">
            <UserRound className="h-5 w-5 text-gold" />
            <div>
              <p className="font-medium">My team at Alcor</p>
              <p className="text-muted-foreground">Account Manager · {team?.account_manager ?? "Not assigned"}</p>
              {team?.heads.map((head)=><p key={head.pipeline} className="text-muted-foreground">{head.pipeline} · {head.name ?? "Not assigned"}</p>)}
            </div>
          </div>

          {properties.length ? (
            <div className="card-surface p-5 text-sm">
              <p className="font-medium">Your properties</p>
              <p className="text-muted-foreground">
                {hotel?.hotel_name} · {properties.map((p) => p.hotel_name).join(" · ")}
              </p>
            </div>
          ) : null}

          <section className="card-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold" />
              <h2 className="text-section-title font-semibold">Monthly reports</h2>
            </div>
            {months.length === 0 ? (
              <EmptyState icon={FileText} title="Your reports will appear here" description="We’ll share your monthly reports as soon as they are ready." />
            ) : (
              <ul className="divide-y divide-border/60">
                {months.map((m) => (
                  <li key={m} className="flex items-center justify-between py-2.5 text-sm">
                    <span>{monthLabel(m)}</span>
                    <Button variant="outline" size="sm" disabled={pdfBusy === m} onClick={() => downloadMonth(m)}>
                      {pdfBusy === m ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      PDF
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <MonthlyActivityPlans clientId={clientId} owner />

          <section>
            <h2 className="mb-3 text-section-title font-semibold">Questions for Alcor</h2>
            <OwnerQuestionsPanel clientId={clientId} />
          </section>
        </>
      ) : (
        <>
          <section className="card-surface space-y-1 p-5">
            <h2 className="mb-2 text-section-title font-semibold">My documents</h2>
            {documents.length ? documents.map((doc)=><div key={doc.id} className="flex items-center justify-between border-b border-border/60 py-2 last:border-0"><span className="text-sm">{doc.type}</span><Button variant="outline" size="sm" onClick={async()=>{const {data,error}=await supabase.storage.from("client-files").createSignedUrl(doc.file_path,60);if(error)toast.error(error.message);else if(data)window.open(data.signedUrl,"_blank","noopener,noreferrer");}}><Download className="mr-2 h-4 w-4"/>Download</Button></div>) : <p className="text-sm text-muted-foreground">No agreement files available yet.</p>}
          </section>
          <OwnerInvoices />
          <WhoPays clientId={clientId} />
          <InfluencerPrograms clientId={clientId} />
        </>
      )}
    </div>
  );
}

/** A non-data preview is shown until this login is linked to its hotel; it never reads another client's records. */
function ClientDashboardPreview() {
  const milestones = [
    { title: "Day 0 · Start", detail: "Agreement and advance confirmed; your hotel workspace is connected.", icon: CheckCircle2 },
    { title: "Days 1–15 · P0 Core onboarding", detail: "Confirm hotel details, access, plan inputs and the starting baseline.", icon: Clock3 },
    { title: "Then · Your assigned pipelines", detail: "Each service follows its own roadmap: access, inputs, activation, go-live QC and baseline.", icon: Rocket },
    { title: "Monthly · MY GROWTH", detail: "Approved scorecards and reports appear here when the team shares them.", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Your hotel dashboard" description="Launch progress, your service roadmaps and approved growth reports." />

      <section className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-[#102747] via-[#0b1b33] to-[#0b172b] p-6 text-white shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-1 top-2 h-44 w-44 rounded-full border border-gold/20" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="border-gold/50 bg-white/5 text-gold">Client dashboard preview</Badge>
          <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Everything for your hotel, in one place.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">This login is not linked to a hotel yet, so live launch, pipeline and payment data cannot load. The preview below shows the client workspace structure; it contains no other client’s information.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">
            <LockKeyhole className="h-4 w-4 text-gold" /> Ask your Alcor admin to link this login to the correct hotel in Team.
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[ 
          { label: "Core onboarding", value: "P0 · first 15 days", note: "One-time hotel setup", icon: Clock3 },
          { label: "Service roadmaps", value: "Plan-specific", note: "Only assigned services appear", icon: Rocket },
          { label: "Monthly growth", value: "After approval", note: "Scorecards and reports", icon: FileText },
        ].map(({ label, value, note, icon: Icon }) => (
          <div key={label} className="card-surface flex gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold"><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="card-surface p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-section-title font-semibold">Your client journey</h2>
          <p className="mt-1 text-sm text-muted-foreground">The client view follows the North Star launch sequence.</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {milestones.map(({ title, detail, icon: Icon }, index) => (
            <li key={title} className="flex gap-3 rounded-lg border border-border/70 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold"><Icon className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-medium">{index + 1}. {title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">After your hotel is linked, these cards will show your actual launch tasks, included pipelines, approvals and reports.</p>
          <Link to="/notifications" className="inline-flex items-center gap-1 text-sm font-medium text-gold hover:underline">View notifications <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  );
}
