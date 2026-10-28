import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/MetricCard";
import { int, inr } from "@/lib/format";
import { monthLabel, previousMonthKey } from "@/lib/kpi";
import { orderMainKpis, type MainKpi } from "@/lib/main-kpis";
import { portfolioMainTotals } from "@/lib/main-kpis";

export function useMainKpis(cp: string, month: string) {
  return useQuery({
    queryKey: ["main-kpis", cp, month], enabled: Boolean(cp), staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("main_kpi_values", { _cp: cp, _month: month });
      if (error) throw error;
      return orderMainKpis((data ?? []) as MainKpi[]);
    },
  });
}
export function MainKpiCards({ items, previous = [] }: { items: Array<{ name: string; value: number | null; kpi_type: string; definition_id?: string; direction?: string }>; previous?: MainKpi[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map((k) => {
    const prev = previous.find((p) => p.definition_id === k.definition_id)?.value;
    return <MetricCard key={k.definition_id ?? k.name} label={k.name} value={k.value} missing="not_tracked"
      format={k.kpi_type === "currency" ? inr : k.kpi_type === "percentage" ? (n) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%` : int}
      delta={k.value != null && prev != null && prev !== 0 ? { pct: (k.value - prev) / Math.abs(prev) * 100, vs: "previous month", invert: k.direction === "lower_better" } : undefined} />;
  })}</div>;
}
export function MainKpis({ clientPipelineId, month, title = "Main KPIs" }: { clientPipelineId: string; month: string; title?: string }) {
  const current = useMainKpis(clientPipelineId, month);
  const previous = useMainKpis(clientPipelineId, previousMonthKey(month));
  if (!clientPipelineId) return null;
  return <section className="space-y-3"><h2 className="text-section-title font-semibold">{title} · {monthLabel(month)}</h2>
    {current.error ? <p role="alert" className="text-sm text-destructive">Could not load main KPIs.</p> : current.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <MainKpiCards items={current.data ?? []} previous={previous.data ?? []} />}
  </section>;
}

/** Lists only RLS-visible pipelines. It never expands the caller's read scope. */
export function HotelMainKpis({ clientId, month, exclude = [] }: { clientId: string; month: string; exclude?: string[] }) {
  const { data = [] } = useQuery({ queryKey: ["main-kpi-pipelines", clientId], enabled: Boolean(clientId), queryFn: async () => {
    const { data, error } = await supabase.from("client_pipelines").select("id, pipelines!inner(code,name)").eq("client_id", clientId).neq("status", "ended");
    if (error) throw error;
    return data as unknown as Array<{ id: string; pipelines: { code: string; name: string } }>;
  } });
  return <div className="space-y-6">{data.filter((p) => !exclude.includes(p.pipelines.code)).map((p) => <section key={p.id} className="space-y-3"><MainKpis clientPipelineId={p.id} month={month} title={`${p.pipelines.name} · Main KPIs`} /><details><summary className="cursor-pointer text-sm font-medium">More · All KPIs</summary><AllKpis clientPipelineId={p.id} month={month}/></details></section>)}</div>;
}

export function AllKpis({clientPipelineId,month}:{clientPipelineId:string;month:string}) {
  const {data=[],error}=useQuery({queryKey:["all-kpis",clientPipelineId,month],enabled:Boolean(clientPipelineId),queryFn:async()=>{const {data,error}=await supabase.rpc("all_kpi_values",{_cp:clientPipelineId,_month:month});if(error)throw error;return data;}});
  if(error)return <p role="alert" className="text-sm text-destructive">Could not load all KPIs.</p>;
  return <div className="divide-y divide-border">{data.map((k)=><div key={k.definition_id} className="flex items-center justify-between gap-4 py-2 text-sm"><span>{k.name}</span><span className="font-semibold">{k.value==null?"Not tracked yet":k.kpi_type==="currency"?inr(k.value):`${int(k.value)}${k.kpi_type==="percentage"?"%":""}`}</span></div>)}</div>;
}

export function PortfolioMainKpis({month}:{month:string}) {
  const {data=[],error}=useQuery({queryKey:["portfolio-main-kpis",month],staleTime:60_000,queryFn:async()=>{const {data,error}=await supabase.rpc("portfolio_main_kpi_values",{_month:month});if(error)throw error;return portfolioMainTotals(data as Array<MainKpi & {pipeline_code:string;pipeline_name:string}>);}});
  return <section className="space-y-5"><h2 className="text-section-title font-semibold">Portfolio · Main KPI totals · {monthLabel(month)}</h2>{error?<p role="alert" className="text-sm text-destructive">Could not load portfolio KPIs.</p>:data.map((g)=><div key={g.code} className="space-y-3"><h3 className="font-semibold">{g.name}</h3><MainKpiCards items={g.items}/></div>)}</section>;
}