import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COMMISSION_FIELDS, fmtCommission, parseCommissionInput } from "@/lib/commission";
import { LAUNCH_STATUS_LABEL, fmtDate } from "@/lib/launch";
import { accountManagerContact, generateAndSaveProposal } from "@/lib/proposal-pdf";

const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${new Intl.NumberFormat("en-IN").format(Number(n))}`;

type Terms = {
  retainer_inr?: number | null;
  commission_direct_pct?: number | null;
  commission_ota_pct?: number | null;
  commission_weddings_pct?: number | null;
  setup_fee_inr?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  notice_days?: number | null;
  payment_cycle?: string | null;
  billing_basis?: string | null;
  invoice_day?: number | null;
  due_day?: number | null;
  late_interest_pct?: number | null;
  min_term_months?: number | null;
  annual_revision_applicable?: boolean | null;
  team_incentive_pct?: number | null;
  commission_reconcile_day?: number | null;
  booking_advances_via_alcor?: boolean | null;
  auto_renew?: boolean | null;
  contract_signed_on?: string | null;
  contract_reference?: string | null;
  recurring_fees?: Array<{ name: string; monthly_inr: number; starts_on?: string; ends_on?: string | null }>;
  add_recurring_fee?: { name: string; monthly_inr: number } | null;
  third_party_costs?: string | null;
  third_party_cost_items?: string[] | null;
  annual_revision_pct?: number | null;
};

type PlanHistoryRow = {
  id: string;
  status: string;
  change_kind: string | null;
  plan_name: string | null;
  base_plan_name: string | null;
  contract_start: string | null;
  contract_end: string | null;
  closed_at: string | null;
  closing_reason: string | null;
  is_churn: boolean;
  retainer_inr: number | null;
  commission_direct_pct: number | null;
  commission_ota_pct: number | null;
  commission_weddings_pct: number | null;
  team_incentive_pct: number | null;
  upgraded_from_launch_id?: string | null;
  notice_within_min_term?: boolean;
  min_term_end?: string | null;
  notice_date?: string | null;
  recurring_fees: Array<{ name: string; monthly_inr: number }>;
};

export type ClientCommercials = {
  launch: (Terms & {
    id: string;
    status: string;
    inherited_from_parent: boolean;
    plan_name: string | null;
    base_plan_name: string | null;
    is_custom: boolean;
    approval_status: string | null;
    deposit_inr: number | null;
    renewal_date: string | null;
    notice_deadline: string | null;
    plan_code?: string | null;
    plan_sort_order?: number | null;
    notice_date?: string | null;
    exit_date?: string | null;
    min_term_end?: string | null;
    notice_within_min_term?: boolean;
    services: Array<{ code: string; name: string }>;
  }) | null;
  plan_history?: PlanHistoryRow[];
  term_changes: Array<{
    id: string;
    status: "pending" | "applied" | "rejected";
    old_terms: Terms;
    new_terms: Terms;
    reason: string | null;
    created_at: string;
    requested_by: string | null;
    decided_by: string | null;
  }>;
  review_items: Array<{ id: string; kind: string; message: string }>;
};

const TERM_LABELS: Record<string, string> = {
  retainer_inr: "Retainer",
  commission_direct_pct: "Direct commission",
  commission_ota_pct: "OTA commission",
  commission_weddings_pct: "Weddings commission",
  setup_fee_inr: "Setup fee",
  contract_start: "Contract start",
  contract_end: "Contract end",
  notice_days: "Notice days",
  payment_cycle: "Billing cycle",
  billing_basis: "Billing basis",
  invoice_day: "Invoice day",
  due_day: "Due day",
  late_interest_pct: "Late interest % p.a.",
  min_term_months: "Minimum term (months)",
  annual_revision_applicable: "Annual fee revision",
  team_incentive_pct: "Team incentive %",
  commission_reconcile_day: "Commission reconciled on day",
  booking_advances_via_alcor: "Booking advances via Alcor",
  auto_renew: "Auto-renew monthly",
  contract_signed_on: "Contract signed on",
  contract_reference: "Contract reference",
  recurring_fees: "Recurring add-ons",
  add_recurring_fee: "Recurring add-on added",
};

function fmtTerm(key: string, v: unknown): string {
  if (key === "add_recurring_fee") {
    const f = v as { name: string; monthly_inr: number } | null | undefined;
    return f ? `${f.name} ${inr(f.monthly_inr)} / month` : "—";
  }
  if (key === "recurring_fees") {
    const list = (v as Array<{ name: string; monthly_inr: number }> | null | undefined) ?? [];
    return list.length ? list.map((f) => `${f.name} ${inr(f.monthly_inr)}`).join(", ") : "None";
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key.endsWith("_pct") && !key.startsWith("commission")) return v == null ? "—" : `${v}%`;
  if (key === "commission_reconcile_day") return v == null ? "—" : String(v);
  if (key.startsWith("commission")) return fmtCommission(v as number | null);
  if (key === "contract_signed_on") return fmtDate(v as string | null);
  if (key.endsWith("_inr")) return inr(v as number | null);
  if (key.startsWith("contract")) return fmtDate(v as string | null);
  return v == null ? "—" : String(v);
}

export function useClientCommercials(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-commercials", clientId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_commercials", { _client_id: clientId });
      if (error) throw error;
      return data as unknown as ClientCommercials;
    },
  });
}

export function CommercialsSection({ clientId }: { clientId: string }) {
  const { roles, isManager, user } = useAuth();
  const [proposalBusy, setProposalBusy] = useState(false);
  const canView = roles.some((r) => ["admin", "management", "bd_manager", "finance"].includes(r));
  const canEdit = roles.some((r) => ["admin", "management", "bd_manager"].includes(r));
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);
  const { data } = useClientCommercials(clientId, canView);

  const team = useQuery({
    queryKey: ["commercials-team", clientId],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_staff_assignments")
        .select("role, profiles:user_id(full_name), pipelines(code, name)")
        .eq("client_id", clientId)
        .eq("excluded", false);
      if (error) throw error;
      return data as unknown as Array<{ role: string; profiles: { full_name: string } | null; pipelines: { code: string; name: string } | null }>;
    },
  });
  const docs = useQuery({
    queryKey: ["commercials-docs", clientId],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, doc_type, category, status, file_path, notes")
        .eq("client_id", clientId)
        .in("category", ["contract", "signed", "proposal"]);
      if (error) throw error;
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("decide_terms_change", { _change_id: v.id, _approve: v.approve });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Terms approved and applied" : "Change rejected");
      qc.invalidateQueries({ queryKey: ["client-commercials"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
      qc.invalidateQueries({ queryKey: ["commercial-terms-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView || !data) return null;
  const l = data.launch;
  const pending = data.term_changes.filter((c) => c.status === "pending");
  const byPipeline = new Map<string, string[]>();
  for (const a of team.data ?? []) {
    const k = a.pipelines?.name ?? "—";
    const list = byPipeline.get(k) ?? [];
    list.push(`${a.profiles?.full_name ?? "—"}${a.role === "head" ? " (head)" : ""}`);
    byPipeline.set(k, list);
  }
  const resDesk = (team.data ?? []).filter((a) => a.pipelines?.code === "reservations_desk");
  const hasResDesk = l?.services.some((s) => s.code === "reservations_desk");

  async function makeProposal() {
    if (!l || !data) return;
    setProposalBusy(true);
    try {
      const [{ data: addons }, { data: client }] = await Promise.all([
        supabase.from("addons_catalogue").select("name, price_type, price_inr, billing").eq("active", true),
        supabase.from("clients").select("hotel_name, client_code, property_type").eq("id", clientId).maybeSingle(),
      ]);
      const valid = new Date();
      valid.setUTCDate(valid.getUTCDate() + 30);
      await generateAndSaveProposal({
        clientId,
        hotelName: client?.hotel_name ?? "Hotel",
        propertyType: client?.property_type ?? null,
        clientCode: client?.client_code ?? null,
        planName: l.plan_name ?? "Plan",
        basedOn: l.is_custom ? l.base_plan_name : null,
        retainerInr: l.retainer_inr ?? null,
        commission: { direct: l.commission_direct_pct ?? null, ota: l.commission_ota_pct ?? null, weddings: l.commission_weddings_pct ?? null },
        teamIncentivePct: l.team_incentive_pct,
        setupFeeInr: l.setup_fee_inr,
        services: l.services.map((s) => ({ name: s.name })),
        addOns: (addons ?? []).map((a) => ({
          name: a.name,
          price: a.price_type === "vendor" ? "Vendor-priced, paid directly to the vendor"
            : `${a.price_type === "from" ? "From " : ""}Rs. ${Number(a.price_inr ?? 0).toLocaleString("en-IN")}${a.billing === "one_time" ? " one-time" : ""}`,
        })),
        thirdPartyCosts: l.third_party_costs ?? "Paid by the hotel directly to the vendor",
        thirdPartyItems: l.third_party_cost_items ?? [],
        payment: { billingBasis: l.billing_basis, invoiceDay: l.invoice_day, dueDay: l.due_day, lateInterestPct: l.late_interest_pct, cycle: l.payment_cycle },
        noticeDays: l.notice_days,
        minTermMonths: l.min_term_months,
        annualRevisionPct: l.annual_revision_pct,
        validUntil: valid.toISOString().slice(0, 10),
        contact: await accountManagerContact(clientId),
      }, user?.id);
      toast.success("Proposal downloaded and saved to the hotel's documents");
      qc.invalidateQueries({ queryKey: ["commercials-docs", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the proposal");
    } finally {
      setProposalBusy(false);
    }
  }

  async function openDoc(path: string | null) {
    if (!path) return;
    const { data: u, error } = await supabase.storage.from("client-files").createSignedUrl(path, 300);
    if (error || !u) {
      toast.error("Could not open the file");
      return;
    }
    window.open(u.signedUrl, "_blank", "noopener");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-section-title font-semibold">Commercials &amp; Commission</CardTitle>
        <div className="flex flex-wrap gap-2">
          {canEdit && l ? (
            <Button size="sm" variant="outline" disabled={proposalBusy} onClick={makeProposal}>
              {proposalBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Proposal PDF
            </Button>
          ) : null}
          {canEdit && l && !l.inherited_from_parent ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={pending.length > 0}>
              Edit plan &amp; commercial terms
            </Button>
          ) : null}
          {canEdit && l && !l.inherited_from_parent && (l.status === "active" || l.status === "live") ? (
            <Button size="sm" variant="outline" onClick={() => setDownOpen(true)}
              disabled={(data.plan_history ?? []).some((h) => h.status === "proposed" && h.upgraded_from_launch_id === l.id)}>
              Downgrade plan
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.review_items.length ? (
          <div className="space-y-1 rounded-lg border border-warning/50 bg-warning/10 p-3">
            {data.review_items.map((r) => (
              <p key={r.id} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                <span className={r.kind === "commission_pending" ? "font-medium" : ""}>{r.message}</span>
              </p>
            ))}
          </div>
        ) : null}

        {!l ? (
          <p className="text-muted-foreground">No active launch — no current commercial terms.</p>
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <p><span className="text-muted-foreground">Status: </span>{LAUNCH_STATUS_LABEL[l.status] ?? l.status}</p>
              <p>
                <span className="text-muted-foreground">Current plan: </span>{l.plan_name ?? "—"}
                {l.is_custom ? <Badge variant="secondary" className="ml-2">Custom · base {l.base_plan_name}</Badge> : null}
                {l.inherited_from_parent ? <Badge variant="outline" className="ml-2">From parent brand</Badge> : null}
              </p>
              <p><span className="text-muted-foreground">Contract: </span>{fmtDate(l.contract_start)} → {fmtDate(l.contract_end)}</p>
              <p><span className="text-muted-foreground">Retainer: </span>{inr(l.retainer_inr)} / month + GST</p>
              {COMMISSION_FIELDS.map((f) => (
                <p key={f.key}>
                  <span className="text-muted-foreground">{f.label} commission: </span>
                  <span className={l[f.key] == null ? "text-muted-foreground" : "font-medium"}>{fmtCommission(l[f.key])}</span>
                </p>
              ))}
              {l.setup_fee_inr ? <p><span className="text-muted-foreground">Setup fee: </span>{inr(l.setup_fee_inr)}</p> : null}
              {l.deposit_inr ? <p><span className="text-muted-foreground">Deposit (not MRR): </span>{inr(l.deposit_inr)}</p> : null}
              <p><span className="text-muted-foreground">Renewal: </span>{fmtDate(l.renewal_date)} · notice by {fmtDate(l.notice_deadline)}</p>
              {l.notice_date ? (
                <p className={l.notice_within_min_term ? "font-medium text-destructive" : ""}>
                  <span className="text-muted-foreground">Termination notice: </span>given {fmtDate(l.notice_date)} · exit {fmtDate(l.exit_date ?? null)}
                  {l.notice_within_min_term ? ` · notice given within minimum term (ends ${fmtDate(l.min_term_end ?? null)})` : ""}
                </p>
              ) : null}
              {(l.recurring_fees ?? []).length ? (
                <p>
                  <span className="text-muted-foreground">Recurring add-ons (outside retainer): </span>
                  {l.recurring_fees!.map((f) => `${f.name} ${inr(f.monthly_inr)} / month`).join(", ")}
                </p>
              ) : null}
              {l.team_incentive_pct ? <p><span className="text-muted-foreground">Team incentive: </span>{l.team_incentive_pct}% of Alcor-generated revenue</p> : null}
              <p><span className="text-muted-foreground">Annual revision: </span>{l.annual_revision_pct ? `${l.annual_revision_pct}% on each anniversary` : "Not applicable"}</p>
              <p className="sm:col-span-2 lg:col-span-3">
                <span className="text-muted-foreground">Third-party costs: </span>{l.third_party_costs ?? "Paid by the hotel directly to the vendor"}
                {(l.third_party_cost_items ?? []).length ? <span className="text-muted-foreground"> — {l.third_party_cost_items!.join(", ")}</span> : null}
              </p>
            </div>

            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {(["payment_cycle", "billing_basis", "invoice_day", "due_day", "late_interest_pct", "min_term_months", "notice_days",
                 "annual_revision_applicable", "auto_renew", "commission_reconcile_day", "booking_advances_via_alcor", "contract_signed_on"] as const)
                .filter((k) => l[k] != null)
                .map((k) => (
                  <p key={k}><span className="text-muted-foreground">{TERM_LABELS[k]}: </span>{fmtTerm(k, l[k])}</p>
                ))}
              {l.contract_reference ? (
                <p className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Contract: </span>{l.contract_reference}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-1 text-label-muted">Contracted pipelines</p>
              <div className="flex flex-wrap gap-1.5">
                {l.services.length ? l.services.map((s) => <Badge key={s.code} variant="outline">{s.name}</Badge>)
                  : <span className="text-muted-foreground">No services on this launch</span>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-label-muted">Assigned team</p>
                {byPipeline.size ? (
                  <ul className="space-y-0.5 text-xs">
                    {[...byPipeline.entries()].map(([p, people]) => (
                      <li key={p}><span className="font-medium">{p}:</span> {people.join(", ")}</li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">No one assigned yet</p>}
              </div>
              {hasResDesk ? (
                <div>
                  <p className="mb-1 text-label-muted">Reservation desk</p>
                  <p className="text-xs">{resDesk.map((a) => a.profiles?.full_name).filter(Boolean).join(", ") || "No one assigned yet"}</p>
                </div>
              ) : null}
            </div>
          </>
        )}

        <div>
          <p className="mb-1 text-label-muted">Contract documents</p>
          {(docs.data ?? []).length ? (
            <ul className="space-y-0.5 text-xs">
              {docs.data!.map((d) => (
                <li key={d.id}>
                  {d.file_path ? (
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => openDoc(d.file_path)}>{d.doc_type}</button>
                  ) : d.doc_type}
                  {d.notes ? <span className="text-muted-foreground"> — {d.notes}</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">No contract file on record</p>}
        </div>

        {pending.map((c) => (
          <div key={c.id} className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs">
            <p className="font-medium">Pending management approval — requested by {c.requested_by ?? "—"}</p>
            <ul>
              {Object.keys(c.new_terms).map((k) => (
                <li key={k}>{TERM_LABELS[k] ?? k}: {fmtTerm(k, c.old_terms[k as keyof Terms])} → <span className="font-medium">{fmtTerm(k, c.new_terms[k as keyof Terms])}</span></li>
              ))}
            </ul>
            {c.reason ? <p className="text-muted-foreground">Reason: {c.reason}</p> : null}
            {isManager ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, approve: true })}>Approve</Button>
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, approve: false })}>Reject</Button>
              </div>
            ) : null}
          </div>
        ))}

        {(data.plan_history ?? []).length > 1 ? (
          <div>
            <p className="mb-1 text-label-muted">Plan history</p>
            <ol className="space-y-1 text-xs">
              {data.plan_history!.map((h) => (
                <li key={h.id} className="rounded border border-border/70 p-2">
                  <span className="font-medium">{h.plan_name ?? "—"}</span>
                  {" · "}{LAUNCH_STATUS_LABEL[h.status] ?? h.status}
                  {h.change_kind === "upgrade" ? <Badge variant="outline" className="ml-2">Upgrade</Badge> : null}
                  {h.change_kind === "downgrade" ? <Badge variant="outline" className="ml-2">Downgrade</Badge> : null}
                  {h.notice_within_min_term ? <Badge variant="destructive" className="ml-2">Notice within minimum term</Badge> : null}
                  {" · "}{fmtDate(h.contract_start)} → {fmtDate(h.contract_end)}
                  {" · "}{inr(h.retainer_inr)} / month
                  {h.recurring_fees.length ? ` + ${h.recurring_fees.map((f) => `${f.name} ${inr(f.monthly_inr)}`).join(", ")}` : ""}
                  {" · commission "}{fmtCommission(h.commission_direct_pct)} / {fmtCommission(h.commission_ota_pct)} / {fmtCommission(h.commission_weddings_pct)}
                  {h.team_incentive_pct ? ` · team incentive ${h.team_incentive_pct}%` : ""}
                  {h.closing_reason ? ` · closed: ${h.closing_reason}${h.is_churn ? " (churn)" : ""} on ${h.closed_at ? fmtDate(h.closed_at) : "date unknown"}` : ""}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {data.term_changes.some((c) => c.status !== "pending") ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Terms history</summary>
            <ul className="mt-2 space-y-2">
              {data.term_changes.filter((c) => c.status !== "pending").map((c) => (
                <li key={c.id} className="rounded border border-border/70 p-2">
                  <p className="font-medium capitalize">{c.status} · {fmtDate(c.created_at)} · by {c.requested_by ?? "—"}{c.decided_by ? `, decided by ${c.decided_by}` : ""}</p>
                  {Object.keys(c.new_terms).map((k) => (
                    <p key={k}>{TERM_LABELS[k] ?? k}: {fmtTerm(k, c.old_terms[k as keyof Terms])} → {fmtTerm(k, c.new_terms[k as keyof Terms])}</p>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
      {l ? <EditTermsDialog open={editOpen} onClose={() => setEditOpen(false)} launch={l} isManager={isManager} /> : null}
      {l && downOpen ? <DowngradeDialog onClose={() => setDownOpen(false)} launch={l} isManager={isManager} /> : null}
    </Card>
  );
}

function EditTermsDialog({ open, onClose, launch, isManager }: {
  open: boolean; onClose: () => void; launch: NonNullable<ClientCommercials["launch"]>; isManager: boolean;
}) {
  const qc = useQueryClient();
  const init = () => ({
    retainer_inr: launch.retainer_inr == null ? "" : String(launch.retainer_inr),
    commission_direct_pct: launch.commission_direct_pct == null ? "" : String(launch.commission_direct_pct),
    commission_ota_pct: launch.commission_ota_pct == null ? "" : String(launch.commission_ota_pct),
    commission_weddings_pct: launch.commission_weddings_pct == null ? "" : String(launch.commission_weddings_pct),
    setup_fee_inr: launch.setup_fee_inr == null ? "" : String(launch.setup_fee_inr),
    contract_start: launch.contract_start ?? "",
    contract_end: launch.contract_end ?? "",
    notice_days: launch.notice_days == null ? "" : String(launch.notice_days),
    third_party_costs: launch.third_party_costs ?? "Paid by the hotel directly to the vendor",
    third_party_cost_items: (launch.third_party_cost_items ?? []).join(", "),
  });
  const [f, setF] = useState(init);
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const terms: Record<string, unknown> = {};
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const next: Record<string, unknown> = {
        retainer_inr: num(f.retainer_inr),
        commission_direct_pct: parseCommissionInput(f.commission_direct_pct),
        commission_ota_pct: parseCommissionInput(f.commission_ota_pct),
        commission_weddings_pct: parseCommissionInput(f.commission_weddings_pct),
        setup_fee_inr: num(f.setup_fee_inr),
        contract_start: f.contract_start || null,
        contract_end: f.contract_end || null,
        notice_days: num(f.notice_days),
      };
      for (const [k, v] of Object.entries(next)) {
        const cur = (launch as unknown as Record<string, unknown>)[k] ?? null;
        const same = cur === null || v === null ? cur === v : String(cur) === String(v);
        if (!same) terms[k] = v;
      }
      const items = f.third_party_cost_items.split(",").map((x) => x.trim()).filter(Boolean);
      const tpChanged = f.third_party_costs.trim() !== (launch.third_party_costs ?? "Paid by the hotel directly to the vendor")
        || items.join("|") !== (launch.third_party_cost_items ?? []).join("|");
      const termsChanged = Object.keys(terms).length > 0;
      if (!termsChanged && !tpChanged) throw new Error("Nothing changed");
      if (termsChanged && tpChanged && !isManager) {
        throw new Error("Please send the third-party costs change separately — only one change per launch can wait for approval");
      }
      let result: { status: string } = { status: "applied" };
      if (termsChanged) {
        const { data, error } = await supabase.rpc("request_terms_change", {
          _launch_id: launch.id, _terms: terms as never, ...(reason ? { _reason: reason } : {}),
        });
        if (error) throw error;
        result = data as { status: string };
      }
      if (tpChanged) {
        const { data, error } = await supabase.rpc("request_third_party_change", {
          _launch_id: launch.id, _costs: f.third_party_costs, _items: items, ...(reason ? { _reason: reason } : {}),
        });
        if (error) throw error;
        result = data as { status: string };
      }
      return result;
    },
    onSuccess: (r) => {
      toast.success(r.status === "applied" ? "Terms updated on every screen" : "Sent to management for approval");
      qc.invalidateQueries({ queryKey: ["client-commercials"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
      qc.invalidateQueries({ queryKey: ["commercial-terms-list"] });
      qc.invalidateQueries({ queryKey: ["launch-commercials"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (k: keyof ReturnType<typeof init>, label: string, type = "number", hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`t-${k}`}>{label}</Label>
      <Input id={`t-${k}`} type={type} value={f[k]} placeholder={hint} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else { setF(init()); setReason(""); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit plan &amp; commercial terms</DialogTitle>
          <DialogDescription>
            {isManager
              ? "Your changes apply straight away. The old terms stay in the history."
              : "Your changes go to management for approval. Current terms stay in place until then."}
            {" "}Leave a commission blank for "Not specified"; enter 0 only for a confirmed 0%.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("retainer_inr", "Monthly retainer (₹)")}
          {field("setup_fee_inr", "Setup fee (₹)")}
          {field("commission_direct_pct", "Direct commission %", "number", "Not specified")}
          {field("commission_ota_pct", "OTA commission %", "number", "Not specified")}
          {field("commission_weddings_pct", "Weddings / events commission %", "number", "Not specified")}
          {field("notice_days", "Notice days")}
          {field("contract_start", "Contract start", "date")}
          {field("contract_end", "Contract end", "date")}
          <div className="sm:col-span-2">{field("third_party_costs", "Third-party costs — who pays", "text")}</div>
          <div className="sm:col-span-2">{field("third_party_cost_items", "Third-party costs cover (comma-separated)", "text")}</div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-reason">Reason</Label>
          <Input id="t-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. confirmed with owner on call" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isManager ? "Save" : "Send for approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DowngradeDialog({ onClose, launch, isManager }: {
  onClose: () => void; launch: NonNullable<ClientCommercials["launch"]>; isManager: boolean;
}) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState("");
  const [start, setStart] = useState("");
  const [retainer, setRetainer] = useState("");
  const [reason, setReason] = useState("");
  const plans = useQuery({
    queryKey: ["downgrade-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("code, name, sort_order").eq("active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const options = (plans.data ?? []).filter((p) =>
    launch.plan_sort_order == null ? true
      : p.sort_order < launch.plan_sort_order || (isManager && p.sort_order === launch.plan_sort_order));
  const save = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Pick the new plan");
      if (!start) throw new Error("Pick the date the downgrade starts");
      const custom = isManager && retainer.trim() !== "";
      const { error } = await supabase.rpc("start_downgrade", {
        _from_launch_id: launch.id,
        _to_plan_code: plan,
        _start_date: start,
        ...(custom ? { _terms: { retainer_inr: Number(retainer) } } : {}),
        ...(reason.trim() ? { _reason: reason.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Downgrade scheduled — it switches over on ${fmtDate(start)}`);
      qc.invalidateQueries({ queryKey: ["client-commercials"] });
      qc.invalidateQueries({ queryKey: ["finance-overview"] });
      qc.invalidateQueries({ queryKey: ["client-launches"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-card-title font-semibold">Downgrade plan</DialogTitle>
          <DialogDescription>
            Creates a new launch linked to the current one. On the start date it becomes active and the current launch closes as
            "Downgraded" (not churn). Services not in the new plan end; their history is kept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>New plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
              <SelectContent>
                {options.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          {isManager ? (
            <div className="space-y-1.5">
              <Label>Custom monthly retainer (optional, ₹)</Label>
              <Input type="number" min="0" value={retainer} onChange={(e) => setRetainer(e.target.value)} placeholder="Leave blank for the plan's standard terms" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Uses the new plan's standard terms. Custom terms need management or admin.</p>
          )}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Schedule downgrade
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
