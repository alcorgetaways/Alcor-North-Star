import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import sopMarkdown from "@/content/onboarding-sop.md?raw";
import pipelineSopMarkdown from "@/content/pipeline-onboarding-sop.md?raw";
import { PageHeader } from "@/components/PageHeader";
import { MarkdownDoc, splitChapters } from "@/components/MarkdownDoc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/onboarding-sop")({
  head: () => ({
    meta: [
      { title: "Client Onboarding SOP — Alcor North Star" },
      {
        name: "description",
        content:
          "The official Alcor Getaways BD onboarding SOPs: service models, master information, assets, access, and the 9-pipeline activation task library with gates and baselines.",
      },
      { property: "og:title", content: "Client Onboarding SOP — Alcor North Star" },
      {
        property: "og:description",
        content: "Standard operating procedures for onboarding and activating new hotel clients at Alcor Getaways.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingSop,
});

function shortTitle(t: string) {
  const clean = t.replace(/\s+·\s+/g, " · ");
  const m = clean.match(/^(P\d)\s*·?\s*(.*)$/);
  if (!m) return clean;
  const rest = (m[2] ?? "").split("—")[0]!.trim();
  return `${m[1]} · ${rest}`;
}

function OnboardingSop() {
  const chapters = useMemo(() => splitChapters(pipelineSopMarkdown), []);
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Onboarding SOP"
        description="The standard operating procedures the BD team follows for every new hotel — from what the client bought, through activation gates, to internal handover."
      />

      <Tabs defaultValue="pipelines">
        <TabsList>
          <TabsTrigger value="pipelines">9-Pipeline Activation SOP</TabsTrigger>
          <TabsTrigger value="bd">BD Onboarding SOP</TabsTrigger>
        </TabsList>

        <TabsContent value="pipelines" className="mt-4 space-y-6">
          <div className="flex flex-wrap gap-2">
            {chapters.map((c, i) => (
              <Button
                key={c.title}
                size="sm"
                variant={i === active ? "default" : "outline"}
                onClick={() => setActive(i)}
              >
                {shortTitle(c.title)}
              </Button>
            ))}
          </div>
          <article className="card-surface p-6 md:p-8">
            <h2 className="mb-4 text-section-title font-semibold text-foreground">{chapters[active]?.title}</h2>
            <MarkdownDoc source={chapters[active]?.body ?? ""} />
          </article>
        </TabsContent>

        <TabsContent value="bd" className="mt-4">
          <article className="card-surface p-6 md:p-8">
            <MarkdownDoc source={sopMarkdown} />
          </article>
        </TabsContent>
      </Tabs>
    </div>
  );
}
