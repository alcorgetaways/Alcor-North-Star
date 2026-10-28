import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Layers, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { PlanProposalButton } from "@/components/PlanProposalButton";
import { WhoPays, PlanToolsCheckbox } from "@/components/WhoPays";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Plans — Alcor North Star" },
      { name: "description", content: "Standard membership plans, their commercial terms and services, the add-ons catalogue, and custom plans." },
      { property: "og:title", content: "Plans — Alcor North Star" },
      { property: "og:description", content: "Standard plans, terms, services, add-ons and custom plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansPage,
});

type PlanVersion = Database["public"]["Tables"]["plan_versions"]["Row"];
type PlanService = Database["public"]["Tables"]["plan_services"]["Row"];
type Addon = Database["public"]["Tables"]["addons_catalogue"]["Row"];
type CustomPlan = Database["public"]["Tables"]["custom_plans"]["Row"];
type CustomService = Database["public"]["Tables"]["custom_plan_services"]["Row"];

const PLAN_ORDER = ["gmb_seo", "diamond_start", "diamond_grow", "diamond_scale"];

const COMMISSION_CHANNELS = [
  { key: "commission_direct_pct", label: "Direct" },
  { key: "commission_ota_pct", label: "OTA" },
  { key: "commission_weddings_pct", label: "Weddings / events" },
  { key: "commission_other_pct", label: "Other" },
] as const;

const PAYMENT_CYCLES = ["monthly", "quarterly", "annual", "milestone"] as const;

function inr(v: number | null | undefined) {
  return v == null ? "—" : `₹${Number(v).toLocaleString("en-IN")}`;
}

function TermsGrid({ v }: { v: PlanVersion }) {
  const rows: Array<[string, string]> = [
    ["Monthly retainer", `${inr(v.monthly_retainer_inr)} + GST`],
    ["Billing basis", v.billing_basis],
    ["Invoice day / due day", `${v.invoice_day} / ${v.due_day}`],
    ["Notice period", `${v.notice_days} days`],
    ["Minimum term", v.min_term_months ? `${v.min_term_months} months` : "None"],
    ["Late interest", v.late_interest_pct ? `${v.late_interest_pct}% p.a.` : "None"],
    ["Annual revision", `${v.annual_revision_pct}%`],
    ["Auto-renew", v.auto_renew ? "Monthly" : "No"],
    ["Team incentive", v.team_incentive_pct ? `${v.team_incentive_pct}% of Alcor-generated revenue` : "None"],
    ["Third-party costs", v.third_party_costs],
  ];
  return (
    <>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {rows.map(([k, val]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{val}</dd>
        </div>
      ))}
    </dl>
    <p className="mt-1 text-xs text-muted-foreground">Third-party costs cover: {v.third_party_cost_items.join(", ")}.</p>
    </>
  );
}

function ServicesTable({ services }: { services: Array<Pick<PlanService, "service_name" | "scope" | "frequency" | "pipeline_code" | "included">> }) {
  return (
    <DataTable
      className="rounded-none border-0 bg-transparent shadow-none"
      rows={services}
      rowKey={(s) => s.service_name}
      columns={[
        { key: "service", header: "Service", render: (s) => <span className={cn("font-medium", !s.included && "opacity-50 line-through")}>{s.service_name}</span> },
        { key: "scope", header: "Scope", render: (s) => <span className={cn("text-muted-foreground", !s.included && "opacity-50 line-through")}>{s.scope ?? "—"}</span> },
        { key: "frequency", header: "Frequency", render: (s) => <span className={cn(!s.included && "opacity-50 line-through")}>{s.frequency ?? "—"}</span> },
        { key: "pipeline", header: "Pipeline", render: (s) => <span className={cn(!s.included && "opacity-50 line-through")}>{s.pipeline_code ?? "—"}</span> },
      ]}
    />
  );
}

type ServiceDraft = { service_name: string; scope: string; frequency: string; pipeline_code: string; included: boolean; fromBase: boolean };

type CustomDraft = {
  id: string | null;
  base_plan_version_id: string;
  name: string;
  monthly_retainer_inr: string;
  commission_direct_pct: string;
  commission_ota_pct: string;
  commission_weddings_pct: string;
  commission_other_pct: string;
  setup_fee_inr: string;
  addon_ids: string[];
  contract_start: string;
  contract_end: string;
  payment_cycle: string;
  notice_days: string;
  termination_terms: string;
  services: ServiceDraft[];
};

function emptyDraft(baseId: string): CustomDraft {
  return {
    id: null,
    base_plan_version_id: baseId,
    name: "",
    monthly_retainer_inr: "",
    commission_direct_pct: "",
    commission_ota_pct: "",
    commission_weddings_pct: "",
    commission_other_pct: "0",
    setup_fee_inr: "",
    addon_ids: [],
    contract_start: "",
    contract_end: "",
    payment_cycle: "monthly",
    notice_days: "",
    termination_terms: "",
    services: [],
  };
}

/** Human-readable differences between a custom plan and its base plan version. */
function planDiffs(
  cp: Pick<CustomPlan, "monthly_retainer_inr" | "commission_direct_pct" | "commission_ota_pct" | "commission_weddings_pct" | "commission_other_pct" | "setup_fee_inr" | "payment_cycle" | "notice_days" | "termination_terms" | "addon_ids">,
  base: PlanVersion | undefined,
  addons: Addon[],
  services: Array<Pick<CustomService, "service_name" | "included">>,
  baseServices: Array<Pick<PlanService, "service_name">>,
): string[] {
  if (!base) return [];
  const d: string[] = [];
  if (cp.monthly_retainer_inr != null && Number(cp.monthly_retainer_inr) !== Number(base.monthly_retainer_inr))
    d.push(`Retainer ${inr(base.monthly_retainer_inr)} → ${inr(cp.monthly_retainer_inr)}`);
  for (const c of COMMISSION_CHANNELS) {
    const v = Number(cp[c.key] ?? 0);
    if (v > 0) d.push(`${c.label} commission ${v}%`);
  }
  if (Number(cp.setup_fee_inr ?? 0) > 0) d.push(`Setup fee ${inr(cp.setup_fee_inr)}`);
  if (cp.payment_cycle !== "monthly") d.push(`Payment cycle: ${cp.payment_cycle}`);
  if (cp.notice_days != null && cp.notice_days !== base.notice_days) d.push(`Notice ${base.notice_days} → ${cp.notice_days} days`);
  if (cp.termination_terms) d.push("Custom termination terms");
  const names = (cp.addon_ids ?? []).map((id) => addons.find((a) => a.id === id)?.name).filter(Boolean);
  if (names.length) d.push(`Add-ons: ${names.join(", ")}`);
  const baseNames = new Set(baseServices.map((s) => s.service_name));
  for (const s of services) {
    if (!baseNames.has(s.service_name)) d.push(`Service added: ${s.service_name}`);
    else if (!s.included) d.push(`Service removed: ${s.service_name}`);
  }
  return d;
}

function PlansPage() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<CustomDraft | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const versions = useQuery({
    queryKey: ["plan-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_versions")
        .select("*, plans(sort_order), plan_services(*)")
        .order("version");
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<PlanVersion & { plans: { sort_order: number } | null; plan_services: PlanService[] }>;
      return rows.sort((a, b) => (a.plans?.sort_order ?? 99) - (b.plans?.sort_order ?? 99));
    },
  });

  const addons = useQuery({
    queryKey: ["addons-catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("addons_catalogue").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Addon[];
    },
  });

  const customPlans = useQuery({
    queryKey: ["custom-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_plans")
        .select("*, custom_plan_services(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<CustomPlan & { custom_plan_services: CustomService[] }>;
    },
  });

  const activeVersions = useMemo(
    () => (versions.data ?? []).filter((v) => v.status === "active"),
    [versions.data],
  );

  function openNew() {
    const base = activeVersions[0];
    if (!base) return;
    const d = emptyDraft(base.id);
    d.monthly_retainer_inr = String(base.monthly_retainer_inr);
    d.notice_days = String(base.notice_days);
    d.services = servicesForBase(base.id);
    setDraft(d);
    setDialogOpen(true);
  }

  function openEdit(cp: CustomPlan & { custom_plan_services: CustomService[] }) {
    const d = emptyDraft(cp.base_plan_version_id);
    d.id = cp.id;
    d.name = cp.name;
    d.monthly_retainer_inr = cp.monthly_retainer_inr != null ? String(cp.monthly_retainer_inr) : "";
    d.commission_direct_pct = cp.commission_direct_pct != null ? String(cp.commission_direct_pct) : "";
    d.commission_ota_pct = cp.commission_ota_pct != null ? String(cp.commission_ota_pct) : "";
    d.commission_weddings_pct = cp.commission_weddings_pct != null ? String(cp.commission_weddings_pct) : "";
    d.commission_other_pct = String(cp.commission_other_pct ?? 0);
    d.setup_fee_inr = cp.setup_fee_inr != null ? String(cp.setup_fee_inr) : "";
    d.addon_ids = cp.addon_ids ?? [];
    d.contract_start = cp.contract_start ?? "";
    d.contract_end = cp.contract_end ?? "";
    d.payment_cycle = cp.payment_cycle;
    d.notice_days = cp.notice_days != null ? String(cp.notice_days) : "";
    d.termination_terms = cp.termination_terms ?? "";
    const baseNames = new Set(servicesForBase(cp.base_plan_version_id).map((s) => s.service_name));
    d.services = cp.custom_plan_services
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        service_name: s.service_name,
        scope: s.scope ?? "",
        frequency: s.frequency ?? "",
        pipeline_code: s.pipeline_code ?? "",
        included: s.included,
        fromBase: baseNames.has(s.service_name),
      }));
    setDraft(d);
    setDialogOpen(true);
  }

  function servicesForBase(versionId: string): ServiceDraft[] {
    const v = (versions.data ?? []).find((x) => x.id === versionId);
    return (v?.plan_services ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        service_name: s.service_name,
        scope: s.scope ?? "",
        frequency: s.frequency ?? "",
        pipeline_code: s.pipeline_code ?? "",
        included: true,
        fromBase: true,
      }));
  }

  function changeBase(versionId: string) {
    if (!draft) return;
    const base = activeVersions.find((v) => v.id === versionId);
    setDraft({
      ...draft,
      base_plan_version_id: versionId,
      monthly_retainer_inr: base ? String(base.monthly_retainer_inr) : draft.monthly_retainer_inr,
      notice_days: base ? String(base.notice_days) : draft.notice_days,
      services: servicesForBase(versionId),
    });
  }

  const save = useMutation({
    mutationFn: async (d: CustomDraft) => {
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const payload = {
        base_plan_version_id: d.base_plan_version_id,
        name: d.name.trim(),
        monthly_retainer_inr: num(d.monthly_retainer_inr),
        commission_direct_pct: num(d.commission_direct_pct),
        commission_ota_pct: num(d.commission_ota_pct),
        commission_weddings_pct: num(d.commission_weddings_pct),
        commission_other_pct: Number(d.commission_other_pct || 0),
        setup_fee_inr: num(d.setup_fee_inr),
        addon_ids: d.addon_ids,
        contract_start: d.contract_start || null,
        contract_end: d.contract_end || null,
        payment_cycle: d.payment_cycle,
        notice_days: num(d.notice_days),
        termination_terms: d.termination_terms.trim() || null,
      };
      let planId = d.id;
      if (planId) {
        const { error } = await supabase.from("custom_plans").update(payload).eq("id", planId);
        if (error) throw error;
        const { error: delErr } = await supabase.from("custom_plan_services").delete().eq("custom_plan_id", planId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from("custom_plans")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        planId = data.id;
      }
      if (d.services.length) {
        const { error } = await supabase.from("custom_plan_services").insert(
          d.services.map((s, i) => ({
            custom_plan_id: planId!,
            service_name: s.service_name.trim(),
            scope: s.scope.trim() || null,
            frequency: s.frequency.trim() || null,
            pipeline_code: s.pipeline_code.trim() || null,
            included: s.included,
            sort_order: i,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Custom plan saved");
      setDialogOpen(false);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["custom-plans"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: "approved" | "rejected"; reason?: string }) => {
      const { error } = await supabase
        .from("custom_plans")
        .update({ approval_status: status, rejection_reason: reason ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decision saved");
      setRejectId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["custom-plans"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save decision"),
  });

  const approvalBadge = (s: string) => (
    <StatusBadge
      status={s}
      label={s === "approved" ? "Approved" : s === "rejected" ? "Rejected" : s === "draft" ? "Draft" : "Pending approval"}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans"
        description="The four signed standard plans with their commercial terms and services, the add-ons catalogue, and custom plans drafted from a standard plan."
        actions={
          <Button onClick={openNew} disabled={!activeVersions.length}>
            <Plus className="mr-2 h-4 w-4" /> New custom plan
          </Button>
        }
      />

      {/* Standard plans */}
      <section className="space-y-4">
        <h2 className="text-card-title font-semibold">Standard plans</h2>
        {versions.isLoading ? <p className="text-sm text-muted-foreground">Loading plans…</p> : null}
        <div className="grid gap-5 lg:grid-cols-2">
          {activeVersions.map((v) => (
            <div key={v.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-section-title font-semibold">{v.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{v.version} · {v.status}</Badge>
                  <PlanProposalButton plan={{
                    planName: v.name, retainerInr: v.monthly_retainer_inr,
                    commission: { direct: null, ota: null, weddings: null }, teamIncentivePct: v.team_incentive_pct,
                    services: v.plan_services.filter((x) => x.included).sort((a, b) => a.sort_order - b.sort_order)
                      .map((x) => ({ name: x.service_name, scope: x.scope, frequency: x.frequency })),
                    thirdPartyCosts: v.third_party_costs, thirdPartyItems: v.third_party_cost_items,
                    payment: { billingBasis: v.billing_basis, invoiceDay: v.invoice_day, dueDay: v.due_day, lateInterestPct: v.late_interest_pct, cycle: "monthly" },
                    noticeDays: v.notice_days, minTermMonths: v.min_term_months, annualRevisionPct: v.annual_revision_pct,
                  }} />
                </div>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Effective from {v.effective_from}{v.effective_to ? ` to ${v.effective_to}` : " · ongoing"}
              </p>
              <div className="mt-4"><TermsGrid v={v} /></div>
              <PlanToolsCheckbox id={v.id} included={v.includes_reservations_sales_tools} />
              <WhoPays versionId={v.id} />
              <p className="mt-4 mb-1 text-label-muted">Included services</p>
              <ServicesTable services={[...v.plan_services].sort((a, b) => a.sort_order - b.sort_order)} />
            </div>
          ))}
        </div>
      </section>

      {/* Add-ons catalogue */}
      <section className="space-y-3">
        <h2 className="text-card-title font-semibold">Add-ons catalogue</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(addons.data ?? []).map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium">{a.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
              <p className="mt-2 text-sm font-medium">
                {a.price_type === "vendor"
                  ? "Vendor-priced — paid directly to the vendor"
                  : `${a.price_type === "from" ? "From " : ""}${inr(a.price_inr)}${a.billing === "one_time" ? " · one-time" : ""}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Custom plans */}
      <section className="space-y-3">
        <h2 className="text-card-title font-semibold">Custom plans</h2>
        <p className="text-sm text-muted-foreground">
          A custom plan starts from a standard plan and never changes the base template. Any discount, commission or term
          different from the base needs management approval.
        </p>
        {!customPlans.data?.length && !customPlans.isLoading ? (
          <p className="text-sm text-muted-foreground">No custom plans yet.</p>
        ) : null}
        <div className="space-y-4">
          {(customPlans.data ?? []).map((cp) => {
            const base = (versions.data ?? []).find((v) => v.id === cp.base_plan_version_id);
            const diffs = planDiffs(cp, base, addons.data ?? [], cp.custom_plan_services, base?.plan_services ?? []);
            const canEdit = isManager || (cp.created_by === user?.id && cp.approval_status !== "approved");
            return (
              <div key={cp.id} className="rounded-xl border border-border bg-card p-5">
                <PlanToolsCheckbox id={cp.id} custom included={cp.includes_reservations_sales_tools} />
                <WhoPays customId={cp.id} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-section-title font-semibold">{cp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Based on {base?.name ?? "standard plan"} v{base?.version ?? "?"}
                      {cp.contract_start ? ` · ${cp.contract_start} → ${cp.contract_end ?? "open"}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {approvalBadge(cp.approval_status)}
                    {canEdit ? (
                      <Button size="sm" variant="outline" onClick={() => openEdit(cp)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                      </Button>
                    ) : null}
                    {isManager && cp.approval_status === "pending" ? (
                      <>
                        <Button size="sm" onClick={() => decide.mutate({ id: cp.id, status: "approved" })}>
                          <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectId(cp.id)}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                  <div><span className="text-muted-foreground">Retainer: </span>{inr(cp.monthly_retainer_inr)} + GST</div>
                  <div><span className="text-muted-foreground">Setup fee: </span>{inr(cp.setup_fee_inr)}</div>
                  <div><span className="text-muted-foreground">Cycle: </span>{cp.payment_cycle}</div>
                  <div><span className="text-muted-foreground">Notice: </span>{cp.notice_days ?? "—"} days</div>
                </div>
                {cp.approval_status === "rejected" && cp.rejection_reason ? (
                  <p className="mt-2 text-sm text-destructive">Rejected: {cp.rejection_reason}</p>
                ) : null}
                <p className="mt-3 text-label-muted">
                  Differences from {base?.name ?? "base plan"}
                </p>
                {diffs.length ? (
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {diffs.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">None — same terms and services as the base plan.</p>
                )}
                <div className="mt-3">
                  <ServicesTable services={cp.custom_plan_services} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit custom plan" : "New custom plan"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Plan name</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Diamond Grow — Lakeview special" />
                </div>
                <div className="space-y-1.5">
                  <Label>Base plan</Label>
                  <Select value={draft.base_plan_version_id} onValueChange={changeBase} disabled={!!draft.id}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeVersions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} (v{v.version})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly retainer (₹, GST extra)</Label>
                  <Input type="number" value={draft.monthly_retainer_inr} onChange={(e) => setDraft({ ...draft, monthly_retainer_inr: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Setup fee (₹, one-time)</Label>
                  <Input type="number" value={draft.setup_fee_inr} onChange={(e) => setDraft({ ...draft, setup_fee_inr: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Commission % of Alcor-generated revenue, by channel</Label>
                <div className="mt-1.5 grid gap-3 sm:grid-cols-4">
                  {COMMISSION_CHANNELS.map((c) => (
                    <div key={c.key} className="space-y-1">
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                      <Input type="number" placeholder="Not specified" value={draft[c.key]} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Add-ons</Label>
                <div className="mt-1.5 flex flex-wrap gap-4">
                  {(addons.data ?? []).map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.addon_ids.includes(a.id)}
                        onCheckedChange={(on) =>
                          setDraft({
                            ...draft,
                            addon_ids: on ? [...draft.addon_ids, a.id] : draft.addon_ids.filter((x) => x !== a.id),
                          })
                        }
                      />
                      {a.name}{a.price_inr ? ` (${inr(a.price_inr)}${a.price_type === "from" ? "+" : ""})` : " (vendor-priced)"}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Contract start</Label>
                  <Input type="date" value={draft.contract_start} onChange={(e) => setDraft({ ...draft, contract_start: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contract end</Label>
                  <Input type="date" value={draft.contract_end} onChange={(e) => setDraft({ ...draft, contract_end: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment cycle</Label>
                  <Select value={draft.payment_cycle} onValueChange={(v) => setDraft({ ...draft, payment_cycle: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_CYCLES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Notice days</Label>
                  <Input type="number" value={draft.notice_days} onChange={(e) => setDraft({ ...draft, notice_days: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Termination terms</Label>
                <Textarea value={draft.termination_terms} onChange={(e) => setDraft({ ...draft, termination_terms: e.target.value })} placeholder="Leave blank to keep the base plan's standard terms" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Services</Label>
                  <Button
                    type="button" size="sm" variant="outline"
                    onClick={() => setDraft({ ...draft, services: [...draft.services, { service_name: "", scope: "", frequency: "monthly", pipeline_code: "", included: true, fromBase: false }] })}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add service
                  </Button>
                </div>
                <div className="space-y-2">
                  {draft.services.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2">
                      <input
                        type="checkbox"
                        checked={s.included}
                        onChange={(e) => setDraft({ ...draft, services: draft.services.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)) })}
                        aria-label={`Include ${s.service_name || "service"}`}
                      />
                      {s.fromBase ? (
                        <span className={cn("min-w-40 text-sm font-medium", !s.included && "line-through opacity-60")}>{s.service_name}</span>
                      ) : (
                        <Input className="min-w-40 flex-1" placeholder="Service name" value={s.service_name}
                          onChange={(e) => setDraft({ ...draft, services: draft.services.map((x, j) => (j === i ? { ...x, service_name: e.target.value } : x)) })} />
                      )}
                      <Input className="w-36" placeholder="Frequency" value={s.frequency}
                        onChange={(e) => setDraft({ ...draft, services: draft.services.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)) })} />
                      <Input className="w-36" placeholder="Pipeline code" value={s.pipeline_code}
                        onChange={(e) => setDraft({ ...draft, services: draft.services.map((x, j) => (j === i ? { ...x, pipeline_code: e.target.value } : x)) })} />
                      {!s.fromBase ? (
                        <Button type="button" size="sm" variant="ghost"
                          onClick={() => setDraft({ ...draft, services: draft.services.filter((_, j) => j !== i) })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Untick a base service to remove it from this custom plan.</p>
              </div>

              {(() => {
                const base = activeVersions.find((v) => v.id === draft.base_plan_version_id);
                const diffs = planDiffs(
                  {
                    monthly_retainer_inr: draft.monthly_retainer_inr ? Number(draft.monthly_retainer_inr) : null,
                    commission_direct_pct: draft.commission_direct_pct.trim() === "" ? null : Number(draft.commission_direct_pct),
                    commission_ota_pct: draft.commission_ota_pct.trim() === "" ? null : Number(draft.commission_ota_pct),
                    commission_weddings_pct: draft.commission_weddings_pct.trim() === "" ? null : Number(draft.commission_weddings_pct),
                    commission_other_pct: Number(draft.commission_other_pct || 0),
                    setup_fee_inr: draft.setup_fee_inr ? Number(draft.setup_fee_inr) : null,
                    payment_cycle: draft.payment_cycle,
                    notice_days: draft.notice_days ? Number(draft.notice_days) : null,
                    termination_terms: draft.termination_terms || null,
                    addon_ids: draft.addon_ids,
                  },
                  base,
                  addons.data ?? [],
                  draft.services,
                  base?.plan_services ?? [],
                );
                return diffs.length ? (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-small text-warning-foreground">
                    <p className="font-medium">Different from the base plan — needs management approval:</p>
                    <ul className="mt-1 list-inside list-disc">{diffs.map((d) => <li key={d}>{d}</li>)}</ul>
                  </div>
                ) : null;
              })()}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={save.isPending || !draft?.name.trim() || !draft.base_plan_version_id}
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending ? "Saving…" : "Save custom plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject custom plan</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={decide.isPending || !rejectReason.trim()}
              onClick={() => rejectId && decide.mutate({ id: rejectId, status: "rejected", reason: rejectReason.trim() })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
