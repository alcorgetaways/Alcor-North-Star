import { ProgressRing } from "@/components/ProgressRing";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { FormSection } from "@/components/FormSection";
import { KpiCard, KpiStrip } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { departmentMetricValue, useDepartmentScorecards, useSaveDepartmentMonth, useSaveDepartmentTarget, type DepartmentScorecard, type DepartmentMetric } from "@/lib/department-scorecards";

function TargetField({ card, metric }: { card: DepartmentScorecard; metric: DepartmentMetric }) {
  const [target, setTarget] = useState(String(metric.target ?? metric.suggested ?? ""));
  const save = useSaveDepartmentTarget();
  useEffect(() => { setTarget(String(metric.target ?? metric.suggested ?? "")); }, [metric.target, metric.suggested, card.month]);
  if (metric.target_status === "baseline") return <StatusBadge status="baseline" label="Baseline · no target" />;
  if (!card.can_edit) return <span>{metric.target == null ? "—" : departmentMetricValue(metric.target, metric.source_key)}</span>;
  const submit = (approve: boolean) => save.mutate({ pipeline: card.id, definition: metric.id, month: card.month, target: Number(target), approve }, {
    onSuccess: () => toast.success(approve ? "Target approved" : "Target proposed"), onError: (e) => toast.error(e.message),
  });
  return <div className="flex flex-wrap items-center gap-2">
    <Input className="w-28" type="number" min={0} step="any" value={target} aria-label={`${metric.name} target`} onChange={(e) => setTarget(e.target.value)} disabled={metric.target_status === "approved" && !card.can_approve} />
    <Button size="sm" variant="outline" disabled={!target || save.isPending || (metric.target_status === "approved" && !card.can_approve)} onClick={() => submit(false)}>Propose</Button>
    {card.can_approve ? <Button size="sm" disabled={!target || save.isPending} onClick={() => submit(true)}>Approve</Button> : null}
  </div>;
}

function DepartmentCard({ card, readOnly }: { card: DepartmentScorecard; readOnly: boolean }) {
  const [outside, setOutside] = useState("");
  const [meetings, setMeetings] = useState("");
  const save = useSaveDepartmentMonth();
  useEffect(() => { setOutside(String(card.manual?.outside_proposals ?? "")); setMeetings(String(card.manual?.meetings ?? "")); }, [card.manual?.outside_proposals, card.manual?.meetings, card.month]);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-section-title font-semibold">{card.name}</h2><p className="text-small text-muted-foreground">{card.manager} · Pipeline Manager</p></div><StatusBadge status={card.score == null ? "provisional" : "approved"} label={card.score == null ? "Not scored yet" : `${card.score}%`} /></div>
    <KpiStrip>{card.metrics.map((m) => <KpiCard key={m.id} label={m.name} value={departmentMetricValue(m.actual, m.source_key)} />)}</KpiStrip>
    <DataTable rows={card.metrics} rowKey={(m) => m.id} columns={[
      { key: "metric", header: "KPI", render: (m) => m.name },
      { key: "target", header: "Target", render: (m) => <TargetField card={readOnly ? { ...card, can_edit: false, can_approve: false } : card} metric={m} /> },
      { key: "status", header: "Approval", render: (m) => <StatusBadge status={m.target_status} label={m.target_status === "missing" ? "Target due" : m.target_status === "baseline" ? "Baseline" : m.target_status === "approved" ? "Approved" : "Provisional"} /> },
      { key: "score", header: "Achievement", align: "right", render: (m) => <ProgressRing size="small" value={m.achievement} label={`${m.name} achievement`} /> },
    ]} />
    {!readOnly && card.can_edit && card.code === "business_development" ? <FormSection title="Monthly activity">
      <div className="space-y-2"><Label htmlFor={`outside-${card.id}`}>Proposals sent outside North Star</Label><Input id={`outside-${card.id}`} type="number" min={0} step={1} value={outside} onChange={(e) => setOutside(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor={`meetings-${card.id}`}>Meetings held</Label><Input id={`meetings-${card.id}`} type="number" min={0} step={1} value={meetings} onChange={(e) => setMeetings(e.target.value)} /></div>
      <div><Button disabled={save.isPending} onClick={() => save.mutate({ pipeline: card.id, month: card.month, outside: outside === "" ? null : Number(outside), meetings: meetings === "" ? null : Number(meetings) }, { onSuccess: () => toast.success("Monthly activity saved"), onError: (e) => toast.error(e.message) })}>Save activity</Button></div>
    </FormSection> : null}
    {card.people.length > 0 ? <DataTable toolbar={<span className="text-card-title font-semibold">Per-person completion</span>} rows={card.people} rowKey={(p) => p.user_id} columns={[
      { key: "person", header: "Person", render: (p) => p.name },
      { key: "due", header: "Tasks due", align: "right", render: (p) => p.due },
      { key: "done", header: "Completed on time", align: "right", render: (p) => p.on_time },
      { key: "rate", header: "On time", align: "right", render: (p) => p.pct == null ? "No data yet" : `${p.pct}%` },
    ]} /> : null}
  </section>;
}

export function DepartmentScorecards({ month, code, readOnly = false }: { month: string; code?: string; readOnly?: boolean }) {
  const { data = [], error } = useDepartmentScorecards(month);
  if (error) return <p className="text-small text-destructive">{error.message}</p>;
  return <div className="space-y-6">{data.filter((c) => !code || c.code === code).map((c) => <DepartmentCard key={`${c.id}-${month}`} card={c} readOnly={readOnly} />)}</div>;
}