import { demoIn } from "@/lib/demo";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard, MetricGrid } from "@/components/MetricCard";
import { ProgressRing } from "@/components/ProgressRing";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { average, monthKey, monthLabel, monthOptions, northStarScore, pct } from "@/lib/kpi";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "North Star Review — Alcor North Star" },
      {
        name: "description",
        content: "The monthly management review: weighted North Star score for every hotel.",
      },
      { property: "og:title", content: "North Star Review — Alcor North Star" },
      { property: "og:description", content: "Monthly weighted performance across the portfolio." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const [month, setMonth] = useState(monthKey());

  const { data: rows = [] } = useQuery({
    queryKey: ["review", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select(
          "id, status, client_id, clients(hotel_name), client_pipelines(weight, pipelines(name)), kpi_entries(achievement_pct)",
        ).not("client_id", "in", demoIn())
        .in("status", ["submitted", "review", "approved"])
        .eq("month", month);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        status: string;
        client_id: string;
        clients: { hotel_name: string } | null;
        client_pipelines: { weight: number; pipelines: { name: string } | null } | null;
        kpi_entries: Array<{ achievement_pct: number | null }>;
      }>;
    },
  });

  const byClient = new Map<
    string,
    { name: string; reports: typeof rows; score: number | null }
  >();
  rows.forEach((r) => {
    const key = r.client_id;
    const entry = byClient.get(key) ?? {
      name: r.clients?.hotel_name ?? "Hotel",
      reports: [] as typeof rows,
      score: null,
    };
    entry.reports.push(r);
    byClient.set(key, entry);
  });
  byClient.forEach((v) => {
    v.score = northStarScore(
      v.reports.map((r) => ({
        achievement: average(r.kpi_entries.map((e) => e.achievement_pct)),
        weight: r.client_pipelines?.weight ?? 1,
      })),
    );
  });
  const clientList = [...byClient.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const portfolio = average(clientList.map((c) => c.score));
  const onTrack = clientList.filter((c) => (c.score ?? 0) >= 90).length;
  const atRisk = clientList.filter((c) => c.score !== null && c.score < 70).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="North Star Monthly Review"
        description="Weighted performance across every pipeline, ranked so the conversation starts where it matters."
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 w-48">
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
        }
      />

      <MetricGrid className="lg:grid-cols-3">
        <MetricCard id={`review-portfolio-${month}`} hero tone="gold" label="Portfolio score" value={portfolio} format={(n) => pct(n)} delta={{ pct: null, vs: "previous month" }} footer={monthLabel(month)} />
        <MetricCard label="Hotels on track" value={onTrack} tone="success" footer="90% achievement or better" />
        <MetricCard label="Hotels at risk" value={atRisk} tone="danger" footer="Below 70% achievement" />
      </MetricGrid>

      <div className="space-y-3">
        {clientList.length === 0 ? (
          <EmptyState title={`No reports for ${monthLabel(month)} yet.`} className="card-surface" />
        ) : (
          clientList.map((c) => (
            <div key={c.name} className="card-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-section-title font-semibold">{c.name}</h2>
                <div className="flex items-center gap-3">
                  <ProgressRing value={c.score} label={`${c.name ?? "hotel"} score`} />
                  <StatusPill value={c.score} />
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {c.reports.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3.5 py-2.5 text-sm"
                  >
                    <Link
                      to="/reports/$reportId"
                      params={{ reportId: r.id }}
                      className="hover:underline"
                    >
                      {r.client_pipelines?.pipelines?.name}
                    </Link>
                    <StatusPill value={average(r.kpi_entries.map((e) => e.achievement_pct))} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
