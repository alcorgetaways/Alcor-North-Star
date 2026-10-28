import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SegmentedPill } from "@/components/SegmentedPill";
import { PageHeader } from "@/components/PageHeader";
import { SourcePortfolio, type SourceKind } from "@/components/SourcePerformance";

/** Performance (default) | KPI entry tabs for the GBP and Social pipeline pages. */
export function PerformanceTabs({ tab, source, title, description, entry }: { tab: string; source: SourceKind; title: string; description: string; entry: ReactNode }) {
  const navigate = useNavigate();
  const current = tab === "entry" ? "entry" : "performance";
  const tabs = [
    { id: "performance", label: "Performance" },
    { id: "entry", label: "KPI entry & review" },
  ];
  return (
    <div className="space-y-6">
      <SegmentedPill ariaLabel="Performance view" value={current} items={tabs.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => void navigate({ to: ".", search: (prev) => ({ ...prev, tab: v }) })} />
      {current === "performance" ? (
        <>
          <PageHeader title={title} description={description} />
          <SourcePortfolio source={source} />
        </>
      ) : (
        entry
      )}
    </div>
  );
}

/** Client record GBP section: Performance (default) | Tasks. */
export function GbpClientSubTabs({ performance, tasks }: { performance: ReactNode; tasks: ReactNode }) {
  const [t, setT] = useState<"performance" | "tasks">("performance");
  return (
    <div className="space-y-4">
      <SegmentedPill ariaLabel="GBP section" value={t} onChange={(v) => setT(v as "performance" | "tasks")} items={[{ value: "performance", label: "Performance" }, { value: "tasks", label: "Tasks" }]} />
      {t === "performance" ? performance : tasks}
    </div>
  );
}
