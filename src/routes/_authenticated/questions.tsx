import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { QuestionsPanel } from "@/components/QuestionsPanel";

export const Route = createFileRoute("/_authenticated/questions")({
  head: () => ({
    meta: [
      { title: "Client Questions — Alcor North Star" },
      {
        name: "description",
        content:
          "Questions raised by hotels from their dashboards, routed to the pipeline manager, BD and management.",
      },
      { property: "og:title", content: "Client Questions — Alcor North Star" },
      {
        property: "og:description",
        content: "Answer hotel questions per pipeline across the portfolio.",
      },
    ],
  }),
  component: QuestionsPage,
});

function QuestionsPage() {
  const [pipelineId, setPipelineId] = useState<string>("");

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client questions"
        description="Questions hotels raise from MY GROWTH, grouped by pipeline. Answer here and the hotel sees it instantly."
      />

      <div className="flex flex-wrap gap-2">
        {[{ id: "", name: "All pipelines" }, ...pipelines].map((p) => (
          <button
            key={p.id || "all"}
            type="button"
            onClick={() => setPipelineId(p.id)}
            className={`rounded-full border px-3 py-1 text-label transition ${
              pipelineId === p.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <QuestionsPanel showHotel pipelineId={pipelineId || undefined} />
    </div>
  );
}
