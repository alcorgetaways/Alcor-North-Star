import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Plans — Alcor North Star" },
      { name: "description", content: "Standard membership plans, commercial terms, add-ons, and onboarding plan approvals." },
      { property: "og:title", content: "Plans — Alcor North Star" },
      { property: "og:description", content: "Standard plans, terms, services, add-ons and onboarding plan approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansPage,
});

type PlanVersion = Database["public"]["Tables"]["plan_versions"]["Row"];
type PlanService = Database["public"]["Tables"]["plan_services"]["Row"];
type Addon = Database["public"]["Tables"]["addons_catalogue"]["Row"];

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

function PlansPage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
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
    queryKey: ["custom-plan-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_plans")
        .select("id, name, base_plan_version_id, approval_status, created_at")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const onboardingClients = useQuery({
    queryKey: ["custom-plan-approval-clients"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_launches")
        .select("custom_plan_id, clients(hotel_name)")
        .not("custom_plan_id", "is", null);
      if (error) throw error;
      return (data ?? []) as Array<{ custom_plan_id: string; clients: { hotel_name: string } | null }>;
    },
  });

  const activeVersions = (versions.data ?? []).filter((version) => version.status === "active");

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
      qc.invalidateQueries({ queryKey: ["custom-plan-approvals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save decision"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans"
        description="The four signed standard plans, their commercial terms and services, the add-ons catalogue, and pending approvals for plans created during onboarding."
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

      {/* Onboarding custom-plan approvals */}
      <section className="space-y-3">
        <h2 className="text-card-title font-semibold">Onboarding plan approvals</h2>
        <p className="text-sm text-muted-foreground">
          Custom plans are created and attached to a client during onboarding. Review requests here; the complete plan remains in the client’s details.
        </p>
        {!customPlans.data?.length && !customPlans.isLoading ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No onboarding plans are waiting for approval.</p>
        ) : null}
        <div className="space-y-2">
          {(customPlans.data ?? []).map((cp) => {
            const base = (versions.data ?? []).find((v) => v.id === cp.base_plan_version_id);
            const clientName = onboardingClients.data?.find((row) => row.custom_plan_id === cp.id)?.clients?.hotel_name;
            return (
              <div key={cp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="font-medium">{clientName ?? "Client onboarding"}</p>
                  <p className="text-sm text-muted-foreground">{cp.name} · Based on {base?.name ?? "standard plan"} · Submitted {new Date(cp.created_at).toLocaleDateString("en-IN")}</p>
                </div>
                {isManager ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => decide.mutate({ id: cp.id, status: "approved" })} disabled={decide.isPending}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectId(cp.id)} disabled={decide.isPending}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                ) : <StatusBadge status="pending" label="Pending approval" />}
              </div>
            );
          })}
        </div>
      </section>

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
