import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { SourceClientDashboard } from "@/components/SourcePerformance";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/gbp_/performance/$clientPipelineId")({
  head: () => ({
    meta: [
      { title: "GBP Performance dashboard — Alcor North Star" },
      { name: "description", content: "One hotel's Google Business Profile views, calls, clicks, directions, reviews and keyword rankings over 18 months." },
      { property: "og:title", content: "GBP Performance dashboard — Alcor North Star" },
      { property: "og:description", content: "Hotel-level Google Business Profile analytics with Before/Since Alcor comparison." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

export function useCpName(id: string) {
  return useQuery({
    queryKey: ["cp-name", id],
    queryFn: async () => {
      const { data } = await supabase.from("client_pipelines").select("client_id, clients(hotel_name, city)").eq("id", id).maybeSingle();
      return data as unknown as { client_id: string; clients: { hotel_name: string; city: string | null } | null } | null;
    },
  });
}

function Page() {
  const { clientPipelineId } = Route.useParams();
  const { data } = useCpName(clientPipelineId);
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "GBP Performance", to: "/gbp" }, { label: data?.clients?.hotel_name ?? "Hotel" }]}
        title={`${data?.clients?.hotel_name ?? "Hotel"} — GBP Performance`}
        description="Pick a KPI tab to drive the chart. Shaded months are before Alcor started and never count toward targets."
        actions={data ? <Button asChild variant="outline"><Link to="/clients/$clientId" params={{ clientId: data.client_id }}>Open client record</Link></Button> : null}
      />
      <SourceClientDashboard source="localo" clientPipelineId={clientPipelineId} />
    </div>
  );
}
