import { ProgressRing } from "@/components/ProgressRing";
import { MetricCard } from "@/components/MetricCard";
import { istToday } from "@/lib/form-rules";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { PipelineBaselines } from "@/components/PipelineBaselines";
type Coverage = { id: string; hotel: string; pipeline: string; onboarding_date: string | null; months_entered: number | null; months_required: number | null; percent: number | null; date_missing: boolean };
const progress = queryOptions({ queryKey: ["kpi-backentry-progress"], queryFn: async () => { const { data, error } = await supabase.rpc("kpi_backentry_progress", {}); if (error) throw error; return data as unknown as Coverage[]; } });
export const Route = createFileRoute("/_authenticated/kpi-progress")({ loader: ({ context }) => context.queryClient.ensureQueryData(progress), head: () => ({ meta: [{ title: "KPI back-entry — Alcor North Star" }, { name: "description", content: "Hotel and pipeline KPI coverage since onboarding, due 5 November 2026." }, { property: "og:title", content: "KPI back-entry — Alcor North Star" }, { property: "og:description", content: "Monthly KPI coverage and approved baselines." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Progress });
function Progress() {
  const { data } = useSuspenseQuery(progress);
  const sorted = [...data].sort((a,b) => (a.percent ?? -1) - (b.percent ?? -1));
  const complete = data.filter((r) => r.percent != null && r.percent >= 100).length;
  const days = Math.max(0, Math.ceil((Date.parse("2026-11-05") - Date.parse(istToday())) / 86400000));
  return <div className="space-y-6"><PageHeader title="KPI back-entry" description="Deadline: 5 November 2026" /><MetricCard hero label="KPI back-entry" value={complete} format={(n) => `${n} of ${data.length} complete`} footer={`${days} days to 5 Nov`} /><DataTable rows={sorted} rowKey={(r) => r.id} columns={[{ key: "hotel", header: "Hotel", render: (r) => r.hotel }, { key: "pipeline", header: "Pipeline", render: (r) => r.pipeline }, { key: "start", header: "Onboarding", render: (r) => r.onboarding_date ?? "Missing — review needed" }, { key: "entered", header: "Months entered / required", render: (r) => r.date_missing ? "—" : `${r.months_entered} / ${r.months_required}` }, { key: "percent", header: "Complete", render: (r) => <ProgressRing size="small" value={r.percent} label={`${r.hotel} ${r.pipeline} complete`} /> }]} /><PipelineBaselines /></div>;
}