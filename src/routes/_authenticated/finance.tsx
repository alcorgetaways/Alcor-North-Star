import { MetricCard } from "@/components/MetricCard";
import { inr } from "@/lib/format";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExitChecklist } from "@/components/ExitChecklist";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CommissionDue } from "@/components/finance/CommissionDue";
import { InvoicesPanel } from "@/components/finance/Invoices";
import { useQuery } from "@tanstack/react-query";
import { Download, IndianRupee, Landmark, Wallet, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard, KpiStrip } from "@/components/KpiCard";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { fmtCommission } from "@/lib/commission";
import { clientTradeNamesFor } from "@/lib/client-trade-names";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "Finance — Alcor North Star" },
      { name: "description", content: "Retainers, commissions, deposits and contract terms across all clients." },
      { property: "og:title", content: "Finance — Alcor North Star" },
      { property: "og:description", content: "Client commercials and MRR overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

type LaunchRow = {
  id: string;
  status: string;
  plan_name: string | null;
  base_plan_name: string | null;
  plan_code: string | null;
  is_custom: boolean;
  retainer_inr: number | null;
  recurring_fees: Array<{ name: string; monthly_inr: number; starts_on: string; ends_on: string | null }>;
  payment_cycle: string | null;
  billing_basis: string | null;
  commission_direct_pct: number | null;
  commission_ota_pct: number | null;
  commission_weddings_pct: number | null;
  commission_other_pct: number | null;
  setup_fee_inr: number | null;
  deposit_inr: number | null;
  advance_amount: number | null;
  payment_reference: string | null;
  addons: string[];
  contract_start: string | null;
  contract_end: string | null;
  renewal_date: string | null;
  notice_deadline: string | null;
  closing_reason_code: string | null;
  closed_at: string | null;
  change_kind: string | null;
  notice_date: string | null;
  exit_date: string | null;
  min_term_end: string | null;
  notice_within_min_term: boolean;
};

type FinanceClient = {
  id: string;
  hotel_name: string;
  is_test: boolean;
  property_type: string | null;
  parent_client_id: string | null;
  account_manager: string | null;
  review_items: Array<{ kind: string; message: string }>;
  launches: LaunchRow[];
};

type FinanceData = { mrr: number; mrr_retainer: number; mrr_recurring_addons: number; clients: FinanceClient[] };

type FlatRow = LaunchRow & { client: FinanceClient };

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function currentMonthInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function billingMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}


function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function FinancePage() {
  const { data } = useQuery({
    queryKey: ["finance-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_overview");
      if (error) throw error;
      return data as unknown as FinanceData;
    },
  });

  const { data: codes } = useQuery({
    queryKey: ["client-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_codes");
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.id, r.client_code]));
    },
  });
  const codeOf = (id: string) => codes?.get(id) ?? "";

  const [paymentMonth, setPaymentMonth] = useState(currentMonthInput);
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const billingMonth = `${paymentMonth}-01`;

  const monthlyPaymentsQuery = useQuery({
    queryKey: ["finance-monthly-payment-statuses", billingMonth],
    queryFn: async () => {
      const paymentDb = supabase as any;
      const { data, error } = await paymentDb.from("client_payments")
        .select("client_id,status").eq("billing_month", billingMonth).limit(5000);
      if (error) throw error;
      return (data ?? []) as Array<{ client_id: string; status: "paid" | "pending" }>;
    },
  });
  const monthlyPaymentByClient = useMemo(
    () => new Map((monthlyPaymentsQuery.data ?? []).map((p) => [p.client_id, p.status])),
    [monthlyPaymentsQuery.data],
  );

  const rows = useMemo<FlatRow[]>(
    () =>
      (data?.clients ?? []).flatMap((c) => c.launches.map((l) => ({ ...l, client: c }))),
    [data],
  );

  const plans = useMemo(
    () => [...new Set(rows.map((r) => r.plan_name).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== "all" && r.status !== status) return false;
        if (plan !== "all" && r.plan_name !== plan) return false;
        if (paymentStatus !== "all") {
          if (monthlyPaymentsQuery.isLoading || monthlyPaymentsQuery.isError) return false;
          const isPaid = monthlyPaymentByClient.get(r.client.id) === "paid";
          if (paymentStatus === "paid" && !isPaid) return false;
          if (paymentStatus === "unpaid" && isPaid) return false;
        }
        return true;
      }),
    [rows, status, plan, paymentStatus, monthlyPaymentByClient, monthlyPaymentsQuery.isLoading, monthlyPaymentsQuery.isError],
  );

  const depositsHeld = useMemo(
    () =>
      rows
        .filter((r) => r.status === "active" || r.status === "live")
        .filter((r) => !r.client.is_test)
        .reduce((s, r) => s + (r.deposit_inr ?? 0), 0),
    [rows],
  );
  const activeLaunches = rows.filter(
    (r) => (r.status === "active" || r.status === "live") && !r.client.is_test,
  ).length;

  function exportCsv() {
    const head = [
      "Client code", "Member / client name", "Trade name", "Payment month", "Monthly payment status", "Plan", "Base plan", "Launch status", "Monthly retainer (INR)", "Recurring add-ons (INR / month)", "Billing", "Direct commission", "OTA commission", "Weddings commission",
      "Setup fee (INR)", "Add-ons", "Deposit (INR)", "Contract start", "Contract end",
      "Renewal date", "Notice deadline", "Notice given", "Within minimum term", "Minimum term ends", "Closing reason", "Closed on", "Payment reference", "Review items",
    ];
    const lines = filtered.map((r) =>
      [
        codeOf(r.client.id),
        clientTradeNamesFor(r.client.hotel_name)?.member ?? r.client.hotel_name,
        clientTradeNamesFor(r.client.hotel_name)?.tradeName ?? "",
        paymentMonth,
        monthlyPaymentsQuery.isError ? "Unavailable" : monthlyPaymentsQuery.isLoading ? "Loading" : monthlyPaymentByClient.get(r.client.id) === "paid" ? "Paid" : "Unpaid",
        r.plan_name ?? "", r.base_plan_name ?? "", r.status, r.retainer_inr ?? "",
        (r.recurring_fees ?? []).map((f) => `${f.name} ${f.monthly_inr}`).join("; "),
        [r.payment_cycle, r.billing_basis].filter(Boolean).join(" · "),
        fmtCommission(r.commission_direct_pct), fmtCommission(r.commission_ota_pct), fmtCommission(r.commission_weddings_pct), r.setup_fee_inr ?? "", r.addons.join("; "), r.deposit_inr ?? "",
        r.contract_start ?? "", r.contract_end ?? "", r.renewal_date ?? "",
        r.notice_deadline ?? "", r.notice_date ?? "", r.notice_within_min_term ? "Yes" : "", r.min_term_end ?? "", r.closing_reason_code ?? "",
        r.closing_reason_code ? (r.closed_at ? r.closed_at.slice(0, 10) : "date unknown") : "", r.payment_reference ?? "",
        (r.client.review_items ?? []).map((i) => i.message).join(" | "),
      ].map(csvCell).join(","),
    );
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finance.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Retainers, commissions, one-time fees and deposits for every client and launch. Money categories stay separate."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <KpiStrip>
        <MetricCard className="col-span-2" hero label="MRR" value={data?.mrr ?? null} format={inr} tone="gold" info={<>No delta until MRR history exists. Retainers {currency(data?.mrr_retainer ?? 0)} · recurring add-ons {currency(data?.mrr_recurring_addons ?? 0)}. Excludes deposits and test hotels.</>} />
        <KpiCard label="Active launches" value={activeLaunches} icon={Building2} />
        <KpiCard label="Deposits held" value={currency(depositsHeld)} hint="Not counted in MRR" icon={Landmark} />
        <KpiCard label="Clients" value={(data?.clients ?? []).filter((c) => !c.is_test).length} icon={Wallet} />
      </KpiStrip>

      <DataTable<FlatRow>
        rows={filtered}
        rowKey={(r) => r.id}
        emptyMessage="No launches match the filters."
        toolbar={
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-small text-muted-foreground">
              Payment month
              <Input type="month" value={paymentMonth} onChange={(e) => e.target.value && setPaymentMonth(e.target.value)} className="w-40" />
            </label>
            <Select value={paymentStatus} onValueChange={setPaymentStatus} disabled={monthlyPaymentsQuery.isLoading || monthlyPaymentsQuery.isError}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Payment status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            {monthlyPaymentsQuery.isError ? <span role="alert" className="text-label text-destructive">Could not load monthly payments. Check that the client_payments migration is applied.</span> : null}
            <span className="ml-auto text-label text-muted-foreground tabular-nums">
              {filtered.length} of {rows.length} launches
            </span>
          </>
        }
        columns={[
          {
            key: "client",
            header: "Member / client name · trade name",
            render: (r) => {
              const names = clientTradeNamesFor(r.client.hotel_name);
              return <span className="font-medium">
                <span className="block">{names?.member ?? r.client.hotel_name}</span>
                <span className="block text-label font-normal text-muted-foreground">
                  Trade name: {names?.tradeName ?? "Not provided"}
                </span>
                {codeOf(r.client.id) ? <span className="block text-label font-normal text-muted-foreground">{codeOf(r.client.id)}</span> : null}
                {r.client.is_test ? <Badge variant="outline" className="ml-2">Test</Badge> : null}
              </span>;
            },
          },
          {
            key: "plan",
            header: "Plan",
            render: (r) => (
              <span className="text-muted-foreground">
                {r.plan_name ?? "—"}
                {r.is_custom ? <Badge variant="secondary" className="ml-2">Custom</Badge> : null}
                {r.is_custom && r.base_plan_name ? (
                  <span className="block text-label">Base: {r.base_plan_name}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => <StatusBadge status={r.status} label={r.status.replace(/_/g, " ")} />,
          },
          {
            key: "payment",
            header: `Payment · ${billingMonthLabel(paymentMonth)}`,
            render: (r) => {
              if (monthlyPaymentsQuery.isError) return <StatusBadge status="unknown" label="Unavailable" />;
              if (monthlyPaymentsQuery.isLoading) return <span className="text-label text-muted-foreground">Loading…</span>;
              const paid = monthlyPaymentByClient.get(r.client.id) === "paid";
              return <StatusBadge status={paid ? "paid" : "pending"} label={paid ? "Paid" : "Unpaid"} />;
            },
          },
          {
            key: "retainer",
            header: "Retainer / mo",
            align: "right",
            render: (r) => (
              <>
                {currency(r.retainer_inr)}
                {r.payment_cycle || r.billing_basis ? (
                  <span className="block text-label text-muted-foreground">{[r.payment_cycle, r.billing_basis].filter(Boolean).join(" · ")}</span>
                ) : null}
              </>
            ),
          },
          {
            key: "recurring",
            header: "Recurring add-ons / mo",
            render: (r) => (
              <span className="text-label">
                {(r.recurring_fees ?? []).length
                  ? r.recurring_fees.map((f) => <span key={f.name} className="block">{f.name} {currency(f.monthly_inr)}</span>)
                  : <span className="text-muted-foreground">—</span>}
              </span>
            ),
          },
          ...(["Direct", "OTA", "Weddings"] as const).map((label, i) => ({
            key: `commission-${i}`,
            header: label,
            align: "right" as const,
            render: (r: FlatRow) => {
              const v = [r.commission_direct_pct, r.commission_ota_pct, r.commission_weddings_pct][i];
              return <span className={v == null ? "text-muted-foreground" : undefined}>{fmtCommission(v)}</span>;
            },
          })),
          { key: "setup", header: "Setup fee", align: "right", render: (r) => currency(r.setup_fee_inr) },
          {
            key: "addons",
            header: "Add-ons",
            className: "max-w-44",
            render: (r) => (
              <span className="line-clamp-2 text-muted-foreground">{r.addons.join(", ") || "—"}</span>
            ),
          },
          { key: "deposit", header: "Deposit", align: "right", render: (r) => currency(r.deposit_inr) },
          {
            key: "contract",
            header: "Contract",
            render: (r) => (
              <span className="text-muted-foreground">
                {fmtDate(r.contract_start)} → {fmtDate(r.contract_end)}
              </span>
            ),
          },
          {
            key: "renewal",
            header: "Renewal",
            render: (r) => <span className="text-muted-foreground">{fmtDate(r.renewal_date)}</span>,
          },
          {
            key: "notice",
            header: "Notice by",
            render: (r) => (
              <span className="text-muted-foreground">
                {fmtDate(r.notice_deadline)}
                {r.notice_date ? <span className="block text-label">Notice given {fmtDate(r.notice_date)}</span> : null}
                {r.notice_within_min_term ? (
                  <Badge variant="destructive" className="mt-1">Within minimum term (ends {fmtDate(r.min_term_end)})</Badge>
                ) : null}
                {r.closing_reason_code ? (
                  <span className="block text-label">Closed {r.closed_at ? fmtDate(r.closed_at) : "— date unknown"}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: "review",
            header: "Review items",
            className: "min-w-56",
            render: (r) => (
              <span className="text-label">
                {(r.client.review_items ?? []).length ? (
                  <ul className="space-y-1">
                    {r.client.review_items.map((i) => (
                      <li key={i.message} className={i.kind === "commission_pending" ? "font-medium text-warning-foreground" : "text-muted-foreground"}>
                        {i.message}
                      </li>
                    ))}
                  </ul>
                ) : "—"}
              </span>
            ),
          },
        ]}
      />

      <CommissionDue />
      <InvoicesPanel />
      <ExitChecklist />
      <p className="text-sm">
        Bookings ledger and sales goals: <Link to="/sales" className="font-medium underline underline-offset-2">Sales &amp; Bookings</Link>
      </p>
    </div>
  );
}
