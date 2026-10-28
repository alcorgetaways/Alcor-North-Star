import { HotelMainKpis, MainKpiCards } from "@/components/MainKpis";
import { ownerAdsMain } from "@/lib/main-kpis";
import { useState } from "react";
import { CombinedOwnerReport } from "@/components/CombinedOwnerReport";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { fmtDate } from "@/lib/launch";
import { DataTable } from "@/components/DataTable";
import { OwnerQuestionsPanel } from "@/components/QuestionsPanel";
import { SocialKpiSection } from "@/components/SocialKpiSection";
import { GbpKpiSection } from "@/components/GbpKpiSection";
import { PKE_KEY_LABELS, PIPELINE_TITLES, formatMetric } from "@/lib/pipeline-kpis";
import type { SocialEntry } from "@/lib/social";
import type { GbpEntry, GbpReport } from "@/lib/gbp";
import { currency, monthKey, monthLabel, monthOptions, previousMonthKey } from "@/lib/kpi";
import { inr, int } from "@/lib/format";
import { MetricCard } from "@/components/MetricCard";
import { ProgressRing } from "@/components/ProgressRing";
import { SegmentedPill } from "@/components/SegmentedPill";
import { OwnerAdsChart } from "@/components/OwnerAdsChart";
import { CardSkeleton, QueryError } from "@/components/Skeletons";
import { BAND_CLASS, BAND_LABEL, band, useHotelScorecard } from "@/lib/scorecard";
import { downloadHotelScorecardPdf } from "@/lib/hotel-pdf";
import { useMyHotel } from "@/lib/my-hotel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-growth")({
  head: () => ({
    meta: [
      { title: "MY GROWTH — Alcor North Star" },
      {
        name: "description",
        content: "Your hotel's approved monthly growth performance and North Star Score.",
      },
      { property: "og:title", content: "MY GROWTH" },
      { property: "og:description", content: "Your hotel's monthly growth performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyGrowth,
});

type MyKpis = {
  weekly_ads: Array<{
    week_start: string;
    channel: string;
    ad_spend: number;
    leads: number;
    campaigns_live: number;
    cost_per_lead: number | null;
  }>;
  social: SocialEntry[];
  gbp: GbpEntry[];
  ota: Array<{
    month: string;
    ota_name: string;
    live_channels: number | null;
    ranking: number | null;
    content_score: number | null;
    reputation_score: number | null;
    conversion_rate: number | null;
    bookings: number | null;
    revenue: number | null;
  }>;
  other: Array<{ month: string; pipeline: string; channel: string; metrics: Record<string, number> }>;
};

function MyGrowth() {
  const { profile } = useAuth();
  const month = monthKey();
  const [cardMonth, setCardMonth] = useState(previousMonthKey(monthKey()));

  const { data: hotel } = useMyHotel(profile?.client_id);
  const [tab, setTab] = useState("overview");
  const scoreQ = useHotelScorecard(profile?.client_id ?? "", cardMonth, true);
  const scorecard = scoreQ.data;
  const { data: prevScore } = useHotelScorecard(profile?.client_id ?? "", previousMonthKey(cardMonth), true);

  const { data: launch } = useQuery({
    queryKey: ["my-launch"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_launch");
      if (error) throw error;
      return (data ?? null) as { status: string; exit_date: string | null } | null;
    },
  });

  // The hotel's approved reports (KPI numbers inside are maintained by the team).
  const reportsQ = useQuery({
    queryKey: ["my-growth", profile?.client_id],
    enabled: Boolean(profile?.client_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select(
          "id, month, highlights, work_items, next_month_action, client_pipelines(weight, pipelines(name, code)), kpi_entries(achievement_pct)",
        )
        .eq("status", "approved")
        .order("month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        month: string;
        highlights: string[];
        work_items: string[];
        next_month_action: string | null;
        client_pipelines: { weight: number; pipelines: { name: string; code: string } | null } | null;
        kpi_entries: Array<{ achievement_pct: number | null }>;
      }>;
    },
  });

  // Everything here comes from the one owner-safe RPC: approved data only, no internal notes.
  const kpisQ = useQuery({
    queryKey: ["my-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_kpis", { _from: twelveMonthsAgo() });
      if (error) throw error;
      return (data ?? null) as MyKpis | null;
    },
  });

  const { data: gbpReports = [] } = useQuery({
    queryKey: ["my-growth-gbp-reports", profile?.client_id],
    enabled: Boolean(profile?.client_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_reports")
        .select("id, kind, title, month, file_path, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as GbpReport[];
    },
  });

  const reports = reportsQ.data ?? [];
  const kpis = kpisQ.data;
  const weekly = kpis?.weekly_ads ?? [];
  const social = kpis?.social ?? [];
  const gbp = kpis?.gbp ?? [];
  const ota = kpis?.ota ?? [];
  const other = kpis?.other ?? [];

  // Sections follow the pipelines actually running for this hotel.
  const pipelineCodes = new Set<string>([
    ...(weekly.length ? ["performance_marketing"] : []),
    ...(social.length ? ["social_media"] : []),
    ...(gbp.length || gbpReports.length ? ["gbp"] : []),
    ...(ota.length ? ["ota"] : []),
    ...other.map((o) => o.pipeline),
  ]);

  const latestMonth = reports[0]?.month ?? month;
  const current = reports.filter(
    (r) => r.month === latestMonth && (!r.client_pipelines?.pipelines?.code || pipelineCodes.has(r.client_pipelines.pipelines.code)),
  );

  const otherByPipeline = new Map<string, MyKpis["other"]>();
  other.forEach((o) => {
    const list = otherByPipeline.get(o.pipeline) ?? [];
    list.push(o);
    otherByPipeline.set(o.pipeline, list);
  });

  const prevCardMonth = previousMonthKey(cardMonth);
  const tabs = [
    { value: "overview", label: "Overview" },
    ...(weekly.length ? [{ value: "ads", label: "Ads" }] : []),
    ...(gbp.length || gbpReports.length ? [{ value: "gbp", label: "Google profile" }] : []),
    ...(social.length ? [{ value: "social", label: "Social" }] : []),
    ...(ota.length ? [{ value: "ota", label: "OTA" }] : []),
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "overview";
  const latestGbp = [...gbp].sort((a, b) => b.month.localeCompare(a.month))[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="MY GROWTH"
        description={`Your approved performance for ${monthLabel(scorecard?.month ?? cardMonth)}.`}
        actions={
          <>
            <Select value={cardMonth} onValueChange={setCardMonth}>
              <SelectTrigger className="h-9 w-44" aria-label="Scorecard month">
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
            {scorecard ? (
              <Button variant="outline" size="sm" onClick={() => downloadHotelScorecardPdf(hotel?.hotel_name ?? "MY GROWTH", scorecard, true)}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            ) : null}
          </>
        }
      />

      {!reportsQ.isLoading && current.length === 0 && !scorecard ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Your first monthly growth report will appear here once it is approved.
        </div>
      ) : null}

      {launch?.status === "offboarding" && launch.exit_date ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-medium">Serving notice</span> · exit on {fmtDate(launch.exit_date)}
        </div>
      ) : null}

      <QueryError error={scoreQ.error} what="your scorecard" />
      <QueryError error={kpisQ.error} what="your monthly numbers" />
      <QueryError error={reportsQ.error} what="your reports" />

      {scoreQ.isLoading ? (
        <CardSkeleton className="h-40" />
      ) : scorecard ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <MetricCard
            id={`ns-score-${profile?.client_id}-${scorecard.month}`}
            hero
            label="North Star score"
            value={scorecard.overall == null ? null : Math.round(scorecard.overall)}
            format={(n) => `${n}%`}
            missing="not_approved"
            tone="gold"
            delta={
              scorecard.overall != null && prevScore?.overall != null
                ? { pct: Math.round(scorecard.overall) - Math.round(prevScore.overall), vs: monthLabel(prevCardMonth), suffix: " pts" }
                : undefined
            }
            footer={
              <span className={cn("inline-flex rounded-full border px-2 py-0.5", BAND_CLASS[band(scorecard.overall)])}>
                {BAND_LABEL[band(scorecard.overall)]} · {monthLabel(scorecard.month)}
              </span>
            }
          />
          <div className="card-surface flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
            {scorecard.pipelines.map((p) => (
              <div key={p.code} className="flex min-w-36 items-center gap-3">
                <ProgressRing value={p.score == null ? null : Math.round(p.score)} label={`${p.name} score`} />
                <div className="min-w-0">
                  <p className="truncate text-small font-medium">{p.name}</p>
                  <p className="text-label text-muted-foreground">{p.score == null ? "Not scored yet" : BAND_LABEL[band(p.score)]}</p>
                </div>
              </div>
            ))}
            {!scorecard.pipelines.length ? <p className="text-small text-muted-foreground">Pipeline scores appear once a month is approved.</p> : null}
          </div>
        </section>
      ) : null}

      {tabs.length > 1 ? <SegmentedPill ariaLabel="MY GROWTH sections" items={tabs} value={activeTab} onChange={setTab} /> : null}

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <HotelMainKpis clientId={profile?.client_id ?? ""} month={cardMonth} exclude={["performance_marketing"]} />
          <details><summary className="cursor-pointer text-sm font-medium">More · All KPIs</summary>
          <CombinedOwnerReport clientId={profile?.client_id ?? ""} month={cardMonth} />
          </details>
          {scorecard?.pipelines.some((p) => p.kpis.some((k) => k.achievement != null && k.achievement < 70)) ? (
            <section className="card-surface space-y-2 p-5">
              <h2 className="text-section-title font-semibold">Needs attention</h2>
              <ul className="space-y-2 text-sm">
                {scorecard.pipelines.flatMap((p) =>
                  p.kpis
                    .filter((k) => k.achievement != null && k.achievement < 70)
                    .map((k) => (
                      <li key={`${p.code}-${k.kpi}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="font-medium text-destructive">{p.name} · {k.kpi}</p>
                        <p className="text-muted-foreground">
                          {k.red_reason || "We are reviewing what held this back."}
                          {k.corrective_action ? ` Action: ${k.corrective_action}.` : ""}
                        </p>
                      </li>
                    )),
                )}
              </ul>
            </section>
          ) : null}
          {Array.from(otherByPipeline.entries()).map(([code, rows]) => (
            <section key={code} className="card-surface overflow-hidden">
              <div className="border-b border-border/70 px-5 py-4">
                <h2 className="text-section-title font-semibold">{PIPELINE_TITLES[code] ?? code}</h2>
              </div>
              <DataTable<(typeof rows)[number]>
                className="rounded-none border-0 bg-transparent shadow-none"
                rows={rows}
                rowKey={(r, i) => `${r.month}-${i}`}
                columns={[
                  { key: "month", header: "Month", render: (r) => monthLabel(r.month) },
                  ...Object.keys(rows[0]?.metrics ?? {}).map((k) => ({
                    key: k,
                    header: PKE_KEY_LABELS[k] ?? k,
                    render: (r: (typeof rows)[number]) => formatMetric(r.metrics?.[k] ?? null),
                  })),
                ]}
              />
            </section>
          ))}
        </div>
      ) : null}

      {activeTab === "ads"
        ? [
            { key: "google", label: "Google Ads" },
            { key: "meta", label: "Meta Ads" },
          ].map((ch) => {
            const all = weekly.filter((w) => (w.channel ?? "google") === ch.key);
            if (!all.length) return null;
            const lifeSpend = all.reduce((a, w) => a + Number(w.ad_spend || 0), 0);
            const lifeLeads = all.reduce((a, w) => a + Number(w.leads || 0), 0);
            return (
              <section key={ch.key} className="card-surface">
                <div className="border-b border-border/70 px-5 py-4">
                  <h2 className="text-section-title font-semibold">{ch.label} · weekly leads and cost per lead</h2>
                  <p className="text-label text-muted-foreground">
                    Since start: {inr(lifeSpend)} spent · {int(lifeLeads)} leads · {lifeLeads ? `${inr(lifeSpend / lifeLeads)} per lead` : "no leads yet"} · {all.length} weeks
                  </p>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <h3 className="font-semibold">Main KPIs</h3>
                  <MainKpiCards items={ownerAdsMain(all)} />
                  <h3 className="font-semibold">All KPIs</h3>
                  <OwnerAdsChart weeks={all} />
                </div>
              </section>
            );
          })
        : null}

      {activeTab === "gbp" ? (
        <div className="space-y-6">
          {latestGbp ? <GbpFunnel entry={latestGbp} /> : null}
          <GbpKpiSection
            title="Google Business Profile performance"
            description="Your monthly posts, pictures, 5-star reviews, profile interactions, chat clicks, calls and website clicks, with month-on-month change and your reports."
            entries={gbp}
            reports={gbpReports}
          />
        </div>
      ) : null}

      {activeTab === "social" ? (
        <SocialKpiSection
          title="Social media performance"
          description="Your monthly posts, followers, content views and profile views across Instagram, Facebook, YouTube and LinkedIn, with month-on-month change."
          entries={social}
        />
      ) : null}

      {activeTab === "ota" ? (
        <section className="card-surface overflow-hidden">
          <div className="border-b border-border/70 px-5 py-4">
            <h2 className="text-section-title font-semibold">OTA performance</h2>
            <p className="text-xs text-muted-foreground">Channels, ranking, content and reputation, bookings and revenue by month.</p>
          </div>
          <DataTable<(typeof ota)[number]>
            className="rounded-none border-0 bg-transparent shadow-none"
            rows={ota}
            rowKey={(o, i) => `${o.month}-${o.ota_name}-${i}`}
            columns={[
              { key: "month", header: "Month", render: (o) => monthLabel(o.month) },
              { key: "channel", header: "Channel", render: (o) => <span className="font-medium">{o.ota_name}</span> },
              { key: "live", header: "Live channels", render: (o) => o.live_channels ?? "—" },
              { key: "ranking", header: "Avg ranking", render: (o) => o.ranking ?? "—" },
              { key: "content", header: "Content score", render: (o) => o.content_score ?? "—" },
              { key: "reputation", header: "Reputation", render: (o) => o.reputation_score ?? "—" },
              { key: "conversion", header: "Conversion", render: (o) => (o.conversion_rate == null ? "—" : `${o.conversion_rate}%`) },
              { key: "bookings", header: "Bookings", render: (o) => o.bookings ?? "—" },
              { key: "revenue", header: "Revenue", align: "right", render: (o) => (o.revenue == null ? "—" : currency(o.revenue)) },
            ]}
          />
        </section>
      ) : null}

      {profile?.client_id ? (
        <OwnerQuestionsPanel clientId={profile.client_id} />
      ) : null}
    </div>
  );
}

/** Google profile funnel for the latest approved month. Bookings are never tracked for GBP. */
function GbpFunnel({ entry }: { entry: GbpEntry }) {
  const parts = [entry.calls, entry.website_clicks, entry.direction_requests];
  const anyPart = parts.some((v) => v != null);
  const interactions = entry.profile_interactions ?? (anyPart ? parts.reduce<number>((a, v) => a + Number(v ?? 0), 0) : null);
  const steps: Array<{ label: string; value: string | null; sub?: string }> = [
    { label: "Profile views", value: entry.views == null ? null : int(entry.views) },
    { label: "Interactions", value: interactions == null ? null : int(interactions) },
    {
      label: "Calls + website clicks + directions",
      value: anyPart ? `${int(entry.calls)} + ${int(entry.website_clicks)} + ${entry.direction_requests == null ? "—" : int(entry.direction_requests)}` : null,
    },
    { label: "Bookings", value: null },
  ];
  return (
    <section className="card-surface p-5">
      <h2 className="text-section-title font-semibold">From Google search to your hotel · {monthLabel(entry.month)}</h2>
      <ol className="mt-4 grid gap-3 md:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label} className="relative rounded-lg border border-border/70 p-4" style={{ opacity: 1 - i * 0.06 }}>
            <p className="text-label-muted">{s.label}</p>
            <p className="mt-2 text-card-title font-semibold tabular-nums">{s.value ?? "Not tracked yet"}</p>
            <p className={cn("mt-1 text-label", s.value != null ? "text-success" : "text-muted-foreground")}>
              {s.value != null ? "Measured by Google" : "Not tracked yet"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}


function twelveMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return monthKey(d);
}
