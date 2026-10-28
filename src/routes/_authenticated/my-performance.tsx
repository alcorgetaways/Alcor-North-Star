import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MetricCard } from "@/components/MetricCard";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { todayIST } from "@/lib/launch";
import { editableLogDates, type RdPeriod } from "@/lib/rd-periods";
import { DailyLogForm, FollowUps, GradeBadge, PacingCard, PeriodPicker, QueryErrorAlert, StatsGrid, useRdPerformance } from "@/components/ResDesk";

export const Route = createFileRoute("/_authenticated/my-performance")({
  head: () => ({
    meta: [
      { title: "My performance — Alcor North Star" },
      { name: "description", content: "Reservation Desk daily log, weekly goal, grade and overdue follow-ups." },
      { property: "og:title", content: "My performance — Alcor North Star" },
      { property: "og:description", content: "Daily activity log, goal pacing, KPIs and grade for Reservation Desk associates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyPerformancePage,
});

function MyPerformancePage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<RdPeriod>("week");
  const { bounds, query } = useRdPerformance(period, user?.id);
  const me = query.data?.[0];
  const year = +todayIST().slice(0, 4);
  if (!user) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="My performance"
        description="Fill in today's log (about a minute). You can change today's or yesterday's log; ask the Reservation Desk head for older days."
        actions={<PeriodPicker value={period} onChange={setPeriod} />}
      />
      <DailyLogForm userId={user.id} dates={editableLogDates(todayIST())} />
      <PacingCard userId={user.id} year={year} />
      {query.isError ? (
        <QueryErrorAlert error={query.error} fallback="Could not load performance figures. Please retry." />
      ) : me ? (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-section-title font-semibold">{bounds.label}</h2>
            <GradeBadge grade={me.grade} total={me.total} flag={me.goal_flag} />
          </div>
          <MetricCard hero id="my-perf-revenue" label="Revenue booked" value={me.revenue_booked} format={inr} footer={me.goal != null ? `Goal ${inr(me.goal)}` : me.goal_flag ?? "No goal"} />
          <StatsGrid s={me} hideRevenue />
        </section>
      ) : null}
      <FollowUps userId={user.id} canAdd />
    </div>
  );
}
