import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { downloadCombinedReportPdf } from "@/lib/report-pdf";
import type { CombinedReport } from "@/lib/combined-report";
import { BlockedTasks } from "@/components/BlockedTasks";
import { WhoPays } from "@/components/WhoPays";
import { InfluencerPrograms } from "@/components/InfluencerPrograms";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, Rocket, UserRound } from "lucide-react";
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

function OwnerHome() {
  const { profile } = useAuth();
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

  if (!clientId) {
    return (
      <EmptyState
        title="Let’s connect your hotel"
        description="Your login is not linked to a hotel yet. Ask your Alcor contact to help."
      />
    );
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
