import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { PageHeader, HeaderTabs } from "@/components/PageHeader";
import { KpiCard, KpiStrip } from "@/components/KpiCard";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressRow } from "@/components/ProgressRow";
import { EmptyState } from "@/components/EmptyState";
import { FormSection } from "@/components/FormSection";
import { GradeChip } from "@/components/GradeChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { MetricCard, MetricGrid } from "@/components/MetricCard";
import { ProgressRing } from "@/components/ProgressRing";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SegmentedPill } from "@/components/SegmentedPill";
import { AlertStack } from "@/components/AlertStack";
import { PageSkeleton } from "@/components/Skeletons";
import { inrShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/styleguide")({
  head: () => ({
    meta: [
      { title: "Styleguide — Alcor North Star" },
      { name: "description", content: "Alcor North Star's internal shared design reference." },
      { property: "og:title", content: "Styleguide — Alcor North Star" },
      { property: "og:description", content: "Internal Alcor North Star design reference." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StyleguidePage,
});

const STATUSES = [
  "active", "approved", "paid", "on time", "verified",
  "pending", "provisional", "proposed", "on hold", "due soon",
  "churned", "overdue", "failed", "missed",
  "draft", "completed", "cancelled", "not specified", "demo",
];

type Row = { hotel: string; plan: string; retainer: number; status: string };
const ROWS: Row[] = [
  { hotel: "Asiatic Lion Lodge", plan: "GMB SEO", retainer: 12000, status: "active" },
  { hotel: "Cabana Affair", plan: "Diamond Grow", retainer: 25000, status: "pending" },
  { hotel: "Hardys Retreat", plan: "Diamond Scale", retainer: 75000, status: "overdue" },
];

function StyleguidePage() {
  const [tab, setTab] = useState("overview");
  const [pill, setPill] = useState("overview");
  const [page, setPage] = useState(1);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Styleguide"
        description="Every shared component and the type scale. Admin only."
        breadcrumb={[{ label: "Settings" }, { label: "Styleguide" }]}
        actions={<Button size="sm">Primary action</Button>}
        tabs={<HeaderTabs value={tab} onChange={setTab} tabs={[{ value: "overview", label: "Overview" }, { value: "history", label: "History" }]} />}
      />

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Type scale</h2>
        <div className="card-surface space-y-3 p-5">
          <p className="font-display text-page-title font-semibold">Page title — Fraunces 28/34 semibold</p>
          <p className="text-section-title font-semibold">Section title — 16/24 semibold</p>
          <p className="text-card-title font-medium">Card title — 14/20 medium</p>
          <p className="text-body">Body — 14/20 regular. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-small">Small and table text — 13/18</p>
          <p className="text-label-muted">Label and overline — 12/16 medium muted, sentence case</p>
          <p className="text-kpi font-semibold tabular-nums">₹6,55,975 — KPI number 28/32</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">KPI cards</h2>
        <KpiStrip>
          <KpiCard label="MRR" value="₹6,55,975" hint="Retainers + recurring add-ons" />
          <KpiCard label="Active launches" value={20} delta={{ direction: "up", text: "2" }} />
          <KpiCard label="Overdue tasks" value={3} tone="danger" delta={{ direction: "down", text: "5" }} />
          <KpiCard label="Deposits held" value="₹2,00,000" hint="Not counted in MRR" />
        </KpiStrip>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Metric cards (one hero number, count-up once per session)</h2>
        <MetricGrid>
          <MetricCard id="sg-mrr" label="Monthly retainer" value={655975} format={inrShort} delta={{ pct: 4.2, vs: "Sep" }} sparkline={[5, 6, 6, 7, 8, 8, 9]} info="Retainers plus recurring add-ons." />
          <MetricCard id="sg-leads" label="Leads this week" value={42} delta={{ pct: -8, vs: "last week" }} />
          <MetricCard label="Cost per lead" value={null} missing="not_tracked" />
          <MetricCard id="sg-score" label="North Star score" value={86} format={(n) => `${n}%`} tone="gold" delta={{ pct: 3, vs: "Sep", suffix: " pts" }} />
        </MetricGrid>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Progress rings</h2>
        <div className="card-surface flex flex-wrap items-center gap-6 p-5">
          <ProgressRing size="large" value={62} caption="Of yearly goal" label="of yearly goal" />
          <ProgressRing size="large" value={104} caption="Goal reached" label="of yearly goal" />
          <ProgressRing value={0} /> <ProgressRing value={62} /> <ProgressRing value={100} /> <ProgressRing value={null} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Confirm buttons, segmented pill, alert stack</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-surface space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <ConfirmButton size="sm" doneLabel="Approved" onConfirm={() => new Promise((r) => setTimeout(r, 600))}>Approve (success)</ConfirmButton>
              <ConfirmButton size="sm" variant="outline" doneLabel="Sent" onConfirm={() => new Promise((_, j) => setTimeout(() => j(new Error("Gate A is not signed yet")), 600))}>Submit (error)</ConfirmButton>
            </div>
            <SegmentedPill ariaLabel="Example" value={pill} onChange={setPill} items={[{ value: "overview", label: "Overview" }, { value: "ads", label: "Ads", count: 3 }, { value: "gbp", label: "Google profile" }]} />
          </div>
          <AlertStack title="Notifications" count={2} items={[
            { id: "1", title: "Gate A ready for your approval", body: "Open My Launch to approve.", at: "2026-10-26", unread: true },
            { id: "2", title: "September report approved", at: "2026-10-03", unread: true },
            { id: "3", title: "Welcome to North Star", at: "2026-09-01" },
          ]} />
        </div>
        <PageSkeleton />
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Status badges</h2>
        <div className="card-surface flex flex-wrap gap-2 p-5">
          {STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Grades</h2>
        <div className="card-surface flex flex-wrap items-center gap-2 p-5">
          <GradeChip grade="A+" points={97} />
          <GradeChip grade="A" points={88} />
          <GradeChip grade="B" points={74} />
          <GradeChip grade="C" points={55} />
          <GradeChip grade="D" points={40} />
          <GradeChip grade={null} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Progress rows</h2>
        <div className="card-surface space-y-4 p-5">
          <ProgressRow label="Shalini — monthly signed retainer" value={647500} goal={1000000} format={(n) => `₹${n.toLocaleString("en-IN")}`} />
          <ProgressRow label="Yadus Jawai — yearly revenue goal" value={1900000} goal={1750000} format={(n) => `₹${n.toLocaleString("en-IN")}`} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Data table</h2>
        <DataTable<Row>
          columns={[
            { key: "hotel", header: "Hotel", render: (r) => <span className="font-medium">{r.hotel}</span> },
            { key: "plan", header: "Plan", render: (r) => r.plan },
            { key: "retainer", header: "Retainer / mo", align: "right", render: (r) => `₹${r.retainer.toLocaleString("en-IN")}` },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={ROWS}
          rowKey={(r) => r.hotel}
          toolbar={<Input placeholder="Search…" className="h-8 w-56" />}
          page={page}
          pageSize={2}
          total={ROWS.length}
          onPageChange={setPage}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Empty state and form section</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-surface">
            <EmptyState icon={Building2} title="No clients yet" description="Start by onboarding your first hotel." action={<Button size="sm">New client</Button>} />
          </div>
          <FormSection title="Form section" description="One-column, labels above. Helper text is 12px muted.">
            <div className="space-y-1.5">
              <Label htmlFor="sg-name">Hotel name</Label>
              <Input id="sg-name" placeholder="e.g. Yadus Jawai" />
              <p className="text-label text-muted-foreground">As it appears on the agreement.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sg-email">Owner email</Label>
              <Input id="sg-email" aria-invalid="true" />
              <p className="text-label text-destructive">Enter a valid email address.</p>
            </div>
          </FormSection>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section-title font-semibold">Buttons</h2>
        <div className="card-surface flex flex-wrap items-center gap-2 p-5">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">Secondary</Button>
          <Button size="sm" variant="outline">Outline</Button>
          <Button size="sm" variant="ghost">Ghost</Button>
          <Button size="sm" variant="destructive">Destructive</Button>
        </div>
      </section>
    </div>
  );
}
