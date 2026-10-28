import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { SourceClientDashboard } from "@/components/SourcePerformance";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/social_/performance/$clientPipelineId")({
  head: () => ({
    meta: [
      { title: "Social Performance dashboard — Alcor North Star" },
      { name: "description", content: "One client's posts per platform from Metricool by month, quarter and year." },
      { property: "og:title", content: "Social Performance dashboard — Alcor North Star" },
      { property: "og:description", content: "Client-level social media analytics from Metricool." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { clientPipelineId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["cp-name", clientPipelineId],
    queryFn: async () => {
      const { data } = await supabase.from("client_pipelines").select("client_id, clients(hotel_name, city)").eq("id", clientPipelineId).maybeSingle();
      return data as unknown as { client_id: string; clients: { hotel_name: string } | null } | null;
    },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Social Performance", to: "/social" }, { label: data?.clients?.hotel_name ?? "Client" }]}
        title={`${data?.clients?.hotel_name ?? "Client"} — Social Performance`}
        description="Posts per platform from Metricool. Pick a tab to drive the chart."
        actions={data ? <Button asChild variant="outline"><Link to="/clients/$clientId" params={{ clientId: data.client_id }}>Open client record</Link></Button> : null}
      />
      <SourceClientDashboard source="metricool" clientPipelineId={clientPipelineId} />
    </div>
  );
}
