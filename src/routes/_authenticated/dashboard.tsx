import { marketingSearch } from "@/lib/property-filter";
import { PortfolioMainKpis } from "@/components/MainKpis";
import { BdTargetsPanel } from "@/components/BdPanels";
import { demoIn } from "@/lib/demo";
import { fetchAll } from "@/lib/fetch-all";
import { useTargetsMissing } from "@/lib/targets-missing";
import { hotelScores, isLate, isOverdue, portfolioScore as approvedPortfolioScore, type PipelineScoreRow } from "@/lib/report-scores";
import { useTeamScorecard } from "@/lib/scorecard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  FileCheck2,
  Compass,
  ClipboardList,
  ArrowRight,
  MessageCircleQuestion,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { AlertStack, type AlertItem } from "@/components/AlertStack";
import { MetricCard, MetricGrid } from "@/components/MetricCard";
import { SegmentedPill } from "@/components/SegmentedPill";
import { inr, int, pct as fmtPct } from "@/lib/format";
import { useState } from "react";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusPill } from "@/components/StatusPill";
import { PlanCommissionList } from "@/components/PlanCommissionList";
import type { SocialEntry } from "@/lib/social";
import type { GbpEntry, GbpReport } from "@/lib/gbp";
import {
  average,
  currency,
  monthKey,
  monthLabel,
  northStarScore,
  pct,
  previousMonthKey,
  weekLabel,
  weekStart,
} from "@/lib/kpi";
import { REPORT_STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { MarketingPerformance } from "@/components/SourcePerformance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Dashboard — Alcor North Star" },
      {
        name: "description",
        content:
          "Portfolio health, North Star scores, pending approvals and open actions across every hotel.",
      },
      { property: "og:title", content: "Dashboard — Alcor North Star" },
      { property: "og:description", content: "Portfolio health and North Star performance." },
    ],
  }),
  validateSearch: marketingSearch,
  component: Dashboard,
});

type ReportRow = {
  id: string;
  month: string;
  status: string;
  client_id: string;
  clients: { hotel_name: string } | null;
  client_pipelines: { weight: number; pipelines: { name: string } | null } | null;
  kpi_entries: Array<{ achievement_pct: number | null }>;
};

function Dashboard() {
  const { profile, isManager, isBD } = useAuth();
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const month = monthKey();
  const lastMonth = previousMonthKey(month);
  const { data: myCodes = [] } = useQuery({
    queryKey: ["my-pipeline-codes", profile?.id],
    enabled: !!profile?.id && !isManager && !isBD,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_members").select("pipelines!inner(code)").eq("user_id", profile!.id).eq("active", true);
      if (error) throw error;
      return Array.from(new Set((data as unknown as Array<{ pipelines: { code: string } }>).map((r) => r.pipelines.code)));
    },
  });
  // Staff who only work GBP / Website SEO (or only Social) see their marketing block instead of the ads blocks.
  const marketingOnly: "localo" | "metricool" | null =
    myCodes.length && myCodes.every((c) => c === "gbp" || c === "website_seo") ? "localo" : myCodes.length && myCodes.every((c) => c === "social_media") ? "metricool" : null;

  const { data: teamScores = [] } = useTeamScorecard(lastMonth, true);
  const { data: health } = useQuery({ queryKey: ["portfolio-report-health",lastMonth],enabled:isManager,queryFn:async()=>{const {data,error}=await supabase.rpc("portfolio_report_health",{_month:lastMonth});if(error)throw error;return data as unknown as {top:Array<{id:string;hotel_name:string;score:number}>;bottom:Array<{id:string;hotel_name:string;score:number}>;at_risk:Array<{id:string;hotel_name:string;score:number}>};} });

  const { data: approvedScores = [] } = useQuery({
    queryKey: ["dash-approved-scores", lastMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_pipeline_scores", { _months: [lastMonth, previousMonthKey(lastMonth)] });
      if (error) throw error;
      return (data ?? []) as unknown as PipelineScoreRow[];
    },
  });

  const { data: lastMonthReports = [] } = useQuery({
    queryKey: ["dash-last-month-reports", lastMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("id, month, status, submitted_at, due_date, clients(hotel_name), kpi_entries(achievement_pct)").not("client_id", "in", demoIn())
        .eq("month", lastMonth);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        status: string;
        submitted_at: string | null;
        due_date: string | null;
        clients: { hotel_name: string } | null;
        kpi_entries: Array<{ achievement_pct: number | null }>;
      }>;
    },
  });


  const { data: activeLaunches = [] } = useQuery({
    queryKey: ["dash-active-launches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id, client_id, status").not("client_id", "in", demoIn())
        .in("status", ["active", "live", "offboarding"]);
      if (error) throw error;
      return data as Array<{ id: string; client_id: string; status: string }>;
    },
  });

  const { data: launchCounts } = useQuery({
    queryKey: ["dash-launch-counts"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("launch_reporting_counts");
      if (error) throw error;
      return data as unknown as {
        unique_clients: number;
        active_launches: number;
        closed_launches: number;
        churned_launches: number;
        completed_launches: number;
        cancelled_before_start: number;
        returning_clients: number;
        upgrades: number;
        downgrades: number;
        churned_date_unknown: number;
      };
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["dash-reports", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select(
          "id, month, status, client_id, clients(hotel_name), client_pipelines(weight, pipelines(name)), kpi_entries(achievement_pct)",
        ).not("client_id", "in", demoIn())
        // Running month plus everything awaiting approval — no row cap (a month can hold 150+ reports).
        .or(`month.eq.${month},status.in.(submitted,review)`)
        .order("month", { ascending: false });
      if (error) throw error;
      return data as unknown as ReportRow[];
    },
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["dash-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_items")
        .select("id, issue, status, priority, due_date, client_id, clients(hotel_name)").not("client_id", "in", demoIn())
        .neq("status", "completed")
        .order("due_date", { ascending: true })
        .limit(8);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        issue: string;
        status: string;
        priority: string;
        due_date: string | null;
        client_id: string;
        clients: { hotel_name: string } | null;
      }>;
    },
  });

  const { data: openActionCount = 0 } = useQuery({
    queryKey: ["dash-actions-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("action_items")
        .select("id", { count: "exact", head: true }).not("client_id", "in", demoIn())
        .neq("status", "completed");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: openQuestions = [] } = useQuery({
    queryKey: ["dash-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_questions")
        .select("id").not("client_id", "in", demoIn())
        .neq("status", "closed");
      if (error) throw error;
      return data;
    },
  });

  const thisWeek = weekStart();
  const { data: weekly = [] } = useQuery({
    queryKey: ["weekly-dashboard", thisWeek],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_kpi_entries")
        .select(
          "id, week_start, channel, ad_spend, leads, campaigns_live, cost_per_lead, clients(hotel_name)",
        ).not("client_id", "in", demoIn())
        .eq("week_start", thisWeek)
        .order("ad_spend", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        week_start: string;
        channel: string;
        ad_spend: number;
        leads: number;
        campaigns_live: number;
        cost_per_lead: number | null;
        clients: { hotel_name: string } | null;
      }>;
    },
  });

  const { data: weeklyTrend = [] } = useQuery({
    queryKey: ["weekly-trend"],
    queryFn: async () => {
      // Lifetime totals over the last 52 weeks, paged so nothing is dropped.
      const since = new Date();
      since.setDate(since.getDate() - 7 * 52);
      const data = await fetchAll((f, t) =>
        supabase
          .from("weekly_kpi_entries")
          .select("week_start, channel, ad_spend, leads").not("client_id", "in", demoIn())
          .gte("week_start", since.toISOString().slice(0, 10))
          .order("week_start", { ascending: false })
          .range(f, t),
      );
      return data as unknown as Array<{
        week_start: string;
        channel: string;
        ad_spend: number;
        leads: number;
      }>;
    },
  });

  const twelveMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return monthKey(d);
  })();

  const { data: social = [] } = useQuery({
    queryKey: ["social-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_kpi_entries")
        .select("id, month, platform, posts, followers, content_views, profile_views, engagement, new_followers").not("client_id", "in", demoIn())
        .gte("month", twelveMonthsAgo)
        .order("month", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as unknown as SocialEntry[];
    },
  });

  const { data: gbp = [] } = useQuery({
    queryKey: ["gbp-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_kpi_entries")
        .select(
          "id, month, posts, photos, five_star_reviews, profile_interactions, chat_clicks, calls, website_clicks, views, booking_clicks, direction_requests",
        ).not("client_id", "in", demoIn())
        .gte("month", twelveMonthsAgo)
        .order("month", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as unknown as GbpEntry[];
    },
  });

  const { data: gbpReports = [] } = useQuery({
    queryKey: ["gbp-reports-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_reports")
        .select("id, kind, title, month, file_path, notes, created_at, clients(hotel_name)").not("client_id", "in", demoIn())
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as GbpReport[];
    },
  });

  const { data: targetsMissing = [] } = useTargetsMissing(isManager);

  const lifetime = (ch: string) => {
    const rows = weeklyTrend.filter((w) => (w.channel ?? "google") === ch);
    const spend = rows.reduce((a, w) => a + Number(w.ad_spend || 0), 0);
    const leads = rows.reduce((a, w) => a + Number(w.leads || 0), 0);
    const weeks = new Set(rows.map((w) => w.week_start)).size;
    return { spend, leads, weeks, cpl: leads ? spend / leads : null };
  };

  const cplSeries = (ch: string) => {
    const byWeek = new Map<string, { spend: number; leads: number }>();
    weeklyTrend
      .filter((w) => (w.channel ?? "google") === ch)
      .forEach((w) => {
        const cur = byWeek.get(w.week_start) ?? { spend: 0, leads: 0 };
        cur.spend += Number(w.ad_spend || 0);
        cur.leads += Number(w.leads || 0);
        byWeek.set(w.week_start, cur);
      });
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, v]) => ({
        week_start,
        label: weekLabel(week_start),
        leads: v.leads,
        cost_per_lead: v.leads ? v.spend / v.leads : null,
      }));
  };

  const reportScore = (r: ReportRow) => average(r.kpi_entries.map((e) => e.achievement_pct));
  const thisMonth = reports.filter((r) => r.month === month);
  const portfolioScore = northStarScore(
    thisMonth.map((r) => ({
      achievement: reportScore(r),
      weight: r.client_pipelines?.weight ?? 1,
    })),
  );
  // Hero uses the latest COMPLETE month and approved reports only (same rule as portfolio_report_health).
  const scoreFor = (m: string) => approvedPortfolioScore(approvedScores, m);
  const heroMonth = lastMonth;
  const heroPrev = previousMonthKey(lastMonth);
  const heroScore = scoreFor(heroMonth);
  const heroPrevScore = scoreFor(heroPrev);
  const pendingApproval = reports.filter((r) => r.status === "submitted" || r.status === "review");
  const activeClientIds = new Set(activeLaunches.map((l) => l.client_id));

  // "Last month" summary: team score, late/overdue reports, bottom 3 hotels.
  const teamAvg = average(teamScores.map((s) => s.overall_score));
  const lateCount = lastMonthReports.filter(
    (r) => r.submitted_at && r.due_date && isLate(r.submitted_at, r.due_date),
  ).length;
  const overdueCount = lastMonthReports.filter(
    (r) => !r.submitted_at && r.due_date && isOverdue(r.due_date),
  ).length;
  const bottom3 = hotelScores(approvedScores, lastMonth).slice(0, 3);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${profile?.full_name?.split(" ")[0] ?? "there"}`}
        description={`Portfolio performance for ${monthLabel(month)}.`}
        actions={
          isBD ? (
            <Button asChild size="sm">
              <Link to="/clients/new" search={{}}>Onboard a hotel</Link>
            </Button>
          ) : null
        }
      />

      <AlertStack
        title="Needs you now"
        max={5}
        count={[pendingApproval.length, openQuestions.length, openActionCount, targetsMissing.length].reduce((a, b) => a + b, 0)}
        emptyText="Nothing is waiting on you."
        items={([
          isManager ? { id: "approval", title: `Awaiting approval · ${int(pendingApproval.length)}`, body: "Submitted monthly reports to approve", to: "/reports" } : null,
          { id: "questions", title: `Client questions · ${int(openQuestions.length)}`, body: "Hotel questions awaiting an answer", to: "/questions" },
          { id: "actions", title: `Open actions · ${int(openActionCount)}`, body: "Issues without a resolution", to: "/actions" },
          isManager ? { id: "targets", title: `Targets missing · ${int(targetsMissing.length)}`, body: targetsMissing.length ? `${monthLabel(month)}: ${targetsMissing.slice(0, 4).map((t) => t.hotel).join(", ")}${targetsMissing.length > 4 ? "…" : ""}` : `All set for ${monthLabel(month)}`, to: "/targets" } : null,
          isManager ? { id: "reports", title: `Reports waiting · ${int(lastMonthReports.filter((r) => !r.submitted_at).length)}`, body: `${monthLabel(lastMonth)} reports not yet submitted`, to: "/reports" } : null,
        ].filter(Boolean) as AlertItem[])}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label text-muted-foreground">Period for the marketing block below. Ads charts show the last 52 weeks.</p>
        <SegmentedPill
          ariaLabel="Dashboard period"
          value={period}
          onChange={(v) => setPeriod(v as typeof period)}
          items={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          id={`dash-northstar-${heroMonth}`}
          hero
          tone="gold"
          className="lg:col-span-2"
          label="Portfolio North Star"
          value={heroScore}
          format={(n) => fmtPct(n)}
          delta={{ pct: heroScore != null && heroPrevScore != null ? heroScore - heroPrevScore : null, vs: monthLabel(heroPrev), suffix: " pts" }}
          footer={`${monthLabel(heroMonth)} · latest complete month · weighted achievement`}
        />
        <MetricCard label="Active hotels" value={activeClientIds.size} footer="With an open launch" />
      </div>

      <PortfolioMainKpis month={lastMonth} />
      {isManager || isBD ? <MarketingPerformance granularity={period} /> : marketingOnly ? <MarketingPerformance only={marketingOnly} granularity={period} /> : null}

      {isBD ? <PlanCommissionList /> : null}
      {isBD ? <BdTargetsPanel isManager={isManager} /> : null}

      {isManager && launchCounts ? (
        <section className="card-surface p-5">
          <h2 className="text-section-title font-semibold">Launches &amp; clients</h2>
          <p className="text-xs text-muted-foreground">Each hotel counts once; every purchase is a launch under it.</p>
          <MetricGrid className="mt-4">
            <MetricCard label="Setting up" value={activeLaunches.filter((l) => l.status === "active").length} footer="Onboarding in progress" />
            <MetricCard label="Live" value={activeLaunches.filter((l) => l.status === "live").length} />
            <MetricCard label="Behind schedule" value={null} missing="See Launch overview" footer={<Link to="/launch-overview" className="text-primary hover:underline">Overdue tasks per launch →</Link>} />
            <MetricCard label="Exiting" value={activeLaunches.filter((l) => l.status === "offboarding").length} tone={activeLaunches.some((l) => l.status === "offboarding") ? "danger" : "default"} />
          </MetricGrid>
          <details className="mt-4">
            <summary className="cursor-pointer text-[0.875rem] font-medium text-muted-foreground hover:text-foreground">More launch counts</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Unique clients", launchCounts.unique_clients],
                  ["Active launches", launchCounts.active_launches],
                  ["Closed launches", launchCounts.closed_launches],
                  ["Churned", launchCounts.churned_launches],
                  ["Completed", launchCounts.completed_launches],
                  ["Cancelled before start", launchCounts.cancelled_before_start],
                  ["Returning clients", launchCounts.returning_clients],
                  ["Upgrades", launchCounts.upgrades],
                  ["Downgrades (not churn)", launchCounts.downgrades],
                  ["Churned — exit date unknown", launchCounts.churned_date_unknown],
                ] as Array<[string, number | undefined]>
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                  <p className="text-[1.5rem] font-semibold leading-tight tabular-nums">{value ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}


      {isManager ? (
        <section className="card-surface">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div>
              <h2 className="text-section-title font-semibold">Last month · {monthLabel(lastMonth)}</h2>
              <p className="text-xs text-muted-foreground">Team and hotel performance summary.</p>
            </div>
            <Link
              to="/scorecard"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Team scorecard <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <div>
              <p className="text-label-muted">Team average score</p>
              <p className="text-kpi font-semibold tabular-nums text-gold">{pct(teamAvg)}</p>
            </div>
            <div>
              <p className="text-label-muted">Late reports</p>
              <p className="text-kpi font-semibold tabular-nums">{lateCount}</p>
            </div>
            <div>
              <p className="text-label-muted">Overdue reports</p>
              <p className="text-kpi font-semibold tabular-nums">{overdueCount}</p>
            </div>
          </div>
          {bottom3.length ? (
            <div className="border-t border-border/70 px-5 py-4">
              <p className="text-label-muted">Bottom 3 hotels by score</p>
              <ul className="mt-2 space-y-1.5">
                {bottom3.map((h) => (
                  <li key={h.hotel} className="flex items-center justify-between text-sm">
                    <span>{h.hotel}</span>
                    <StatusPill value={h.score} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid gap-5 border-t border-border px-5 py-4 sm:grid-cols-2">{[{title:"Top 3 hotels",rows:health?.top??[]},{title:"At risk · 2 red months in a row",rows:health?.at_risk??[]}].map((group)=><div key={group.title}><h3 className="font-semibold">{group.title}</h3>{group.rows.length?group.rows.map((h)=><div key={h.id} className="mt-2 flex justify-between text-sm"><span>{h.hotel_name}</span><StatusPill value={h.score}/></div>):<p className="mt-2 text-sm text-muted-foreground">No qualifying approved results.</p>}</div>)}</div>
        </section>
      ) : null}


      {(marketingOnly ? [] : [
        { key: "google", label: "Google Ads" },
        { key: "meta", label: "Meta Ads" },
      ]).map((ch) => {
        const rows = weekly.filter((w) => (w.channel ?? "google") === ch.key);
        const spend = rows.reduce((a, w) => a + Number(w.ad_spend || 0), 0);
        const leads = rows.reduce((a, w) => a + Number(w.leads || 0), 0);
        const camps = rows.reduce((a, w) => a + Number(w.campaigns_live || 0), 0);
        return (
          <section key={ch.key} className="card-surface">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div>
                <h2 className="text-section-title font-semibold">
                  Performance marketing — {ch.label} — weekly leads
                </h2>
                <p className="text-xs text-muted-foreground">{weekLabel(thisWeek)}</p>
              </div>
              <Link
                to="/weekly"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Weekly KPIs <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {(() => {
              const life = lifetime(ch.key);
              const series = cplSeries(ch.key);
              return life.weeks === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">No {ch.label} weeks logged yet.</p>
              ) : (
                <div className="border-b border-border/70 px-5 py-4">
                  <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.875rem]">
                    <span>This week: <b className="tabular-nums">{int(leads)}</b> leads · <b className="tabular-nums">{inr(spend)}</b> spend · CPL <b className="tabular-nums text-gold">{leads ? inr(spend / leads) : "—"}</b> · {int(camps)} campaigns</span>
                    <span className="text-muted-foreground">Last 52 weeks: {int(life.leads)} leads · {inr(life.spend)} · CPL {life.cpl == null ? "—" : inr(life.cpl)}</span>
                  </div>
                  <div className="h-64" role="img" aria-label={`${ch.label}: weekly leads bars and cost per lead line`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={series}>
                        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} minTickGap={32} />
                        <YAxis yAxisId="l" allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} width={36} />
                        <YAxis yAxisId="c" orientation="right" tickFormatter={(v) => inr(Number(v))} stroke="var(--muted-foreground)" fontSize={11} width={64} />
                        <RTooltip
                          formatter={(v, n) => [v == null ? "—" : n === "Cost per lead" ? inr(Number(v)) : int(Number(v)), n]}
                          contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
                        />
                        <Bar yAxisId="l" dataKey="leads" name="Leads" fill="var(--gold)" radius={[3, 3, 0, 0]} />
                        <Line yAxisId="c" dataKey="cost_per_lead" name="Cost per lead" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
            {rows.length ? (
              <details className="px-5 py-3">
                <summary className="cursor-pointer text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground">This week by hotel</summary>
                <DataTable
                  className="mt-2 rounded-none border-0 bg-transparent shadow-none"
                  rows={rows}
                  rowKey={(w) => w.id}
                  columns={[
                    { key: "hotel", header: "Hotel", render: (w) => w.clients?.hotel_name },
                    { key: "spend", header: "Ad spend", align: "right", render: (w) => currency(w.ad_spend) },
                    { key: "leads", header: "Leads", align: "right", render: (w) => w.leads },
                    { key: "cpl", header: "Cost / lead", align: "right", render: (w) => <span className="text-gold">{currency(w.cost_per_lead)}</span> },
                    { key: "camps", header: "Campaigns", align: "right", render: (w) => w.campaigns_live },
                  ]}
                />
              </details>
            ) : null}
          </section>
        );
      })}


      <section>
        <div className="card-surface">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <h2 className="text-section-title font-semibold">This month's pipeline performance</h2>
            <Link
              to="/reports"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All reports <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {thisMonth.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No reports created for {monthLabel(month)} yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {thisMonth.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <Link
                      to="/reports/$reportId"
                      params={{ reportId: r.id }}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {r.clients?.hotel_name}
                    </Link>
                    <p className="flex items-center gap-2 text-label-muted">
                      {r.client_pipelines?.pipelines?.name} ·{" "}
                      <StatusBadge status={r.status} label={REPORT_STATUS_LABELS[r.status] ?? r.status} />
                    </p>
                  </div>
                  <StatusPill value={reportScore(r)} />
                </li>
              ))}
            </ul>
          )}
        </div>

      </section>

    </div>
  );
}
