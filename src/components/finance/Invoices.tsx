import { todayIST } from "@/lib/launch";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { DataTable } from "@/components/DataTable";
import { InvoiceWhoPays } from "@/components/WhoPays";
import { INVOICE_TYPE_LABEL, effectiveInvoiceStatus, lateInterest, type InvoiceStatus } from "@/lib/invoices";

type Invoice = {
  id: string; client_id: string; launch_id: string | null; invoice_no: string; period_start: string | null; period_end: string | null;
  invoice_type: keyof typeof INVOICE_TYPE_LABEL; amount_inr: number; raised_on: string; due_on: string; status: "unpaid" | "part_paid" | "paid";
  paid_amount_inr: number; paid_on: string | null; late_interest_pct: number | null; notes: string | null; clients: { hotel_name: string } | null;
};

const STATUS_LABEL: Record<InvoiceStatus, string> = { unpaid: "Unpaid", part_paid: "Part-paid", paid: "Paid", overdue: "Overdue" };
const fmtD = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const today = () => todayIST();

export function StatusBadge({ s }: { s: InvoiceStatus }) {
  return <Badge variant={s === "paid" ? "default" : s === "overdue" ? "destructive" : "secondary"}>{STATUS_LABEL[s]}</Badge>;
}

export function InvoicesPanel() {
  const { roles } = useAuth();
  const canWrite = roles.some((r) => ["admin", "management", "finance"].includes(r));
  const [edit, setEdit] = useState<Invoice | "new" | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*, clients(hotel_name)").order("raised_on", { ascending: false });
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });
  const t = today();
  const outstanding = data.reduce((s, i) => s + (i.amount_inr - i.paid_amount_inr), 0);

  return (
    <section className="space-y-3 card-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-section-title font-semibold">Invoices</h2>
        <span className="text-sm text-muted-foreground">Outstanding {currency(outstanding)}</span>
        {canWrite ? <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEdit("new")}><Plus className="mr-2 h-4 w-4" />Record invoice</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">Invoices are raised outside North Star and tracked here. Status turns Overdue automatically after the due date.</p>
      <DataTable<Invoice>
        className="rounded-none border-0 bg-transparent shadow-none"
        rows={data}
        rowKey={(i) => i.id}
        emptyMessage="No invoices recorded yet."
        columns={[
          { key: "invoice", header: "Invoice", render: (i) => <span className="font-medium">{i.invoice_no}</span> },
          { key: "client", header: "Client", render: (i) => i.clients?.hotel_name },
          { key: "type", header: "Type", render: (i) => INVOICE_TYPE_LABEL[i.invoice_type] },
          { key: "period", header: "Period", render: (i) => <span className="text-label">{fmtD(i.period_start)} → {fmtD(i.period_end)}</span> },
          { key: "amount", header: "Amount", align: "right", render: (i) => currency(i.amount_inr) },
          { key: "raised", header: "Raised", render: (i) => fmtD(i.raised_on) },
          { key: "due", header: "Due", render: (i) => fmtD(i.due_on) },
          { key: "status", header: "Status", render: (i) => <StatusBadge s={effectiveInvoiceStatus(i.status, i.due_on, t)} /> },
          { key: "paid", header: "Paid", align: "right", render: (i) => (i.paid_amount_inr ? `${currency(i.paid_amount_inr)} · ${fmtD(i.paid_on)}` : "—") },
          {
            key: "interest",
            header: "Late interest",
            render: (i) => {
              const li = lateInterest(i.amount_inr - i.paid_amount_inr, i.late_interest_pct, i.due_on, t);
              return <span className="text-label">{i.late_interest_pct ? `${i.late_interest_pct}% p.a.${li ? ` · ${currency(li)} so far` : ""}` : "—"}</span>;
            },
          },
          { key: "notes", header: "Notes", render: (i) => <span className="block max-w-40 truncate text-label text-muted-foreground" title={i.notes ?? ""}>{i.notes ?? "—"}</span> },
          { key: "who-pays", header: "Who pays", render: (i) => <InvoiceWhoPays clientId={i.client_id} launchId={i.launch_id} /> },
          ...(canWrite
            ? [{ key: "actions", header: "", render: (i: Invoice) => <Button size="sm" variant="ghost" onClick={() => setEdit(i)}>Update</Button> }]
            : []),
        ]}
      />
      {edit ? <InvoiceDialog invoice={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
    </section>
  );
}

function InvoiceDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const clients = useQuery({
    queryKey: ["invoice-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_launches")
        .select("id, status, client_id, contract_start, clients(hotel_name)").in("status", ["active", "live", "on_hold", "offboarding", "closed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{ id: string; status: string; client_id: string; contract_start: string | null; clients: { hotel_name: string } | null }>;
    },
  });
  const [f, setF] = useState({
    launch_id: invoice?.launch_id ?? "", invoice_no: invoice?.invoice_no ?? "", invoice_type: invoice?.invoice_type ?? "retainer",
    period_start: invoice?.period_start ?? "", period_end: invoice?.period_end ?? "", amount_inr: invoice ? String(invoice.amount_inr) : "",
    raised_on: invoice?.raised_on ?? today(), due_on: invoice?.due_on ?? "", paid_amount_inr: invoice ? String(invoice.paid_amount_inr) : "0",
    paid_on: invoice?.paid_on ?? "", notes: invoice?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const launch = (clients.data ?? []).find((l) => l.id === f.launch_id);
      if (!invoice && !launch) throw new Error("Choose the client launch");
      if (!f.invoice_no.trim() || !f.amount_inr || !f.due_on) throw new Error("Invoice no, amount and due date are required");
      const row = {
        invoice_no: f.invoice_no.trim(), invoice_type: f.invoice_type, period_start: f.period_start || null, period_end: f.period_end || null,
        amount_inr: Number(f.amount_inr), raised_on: f.raised_on, due_on: f.due_on, paid_amount_inr: Number(f.paid_amount_inr || 0),
        paid_on: f.paid_on || null, notes: f.notes || null,
      };
      const q = invoice
        ? supabase.from("invoices").update(row).eq("id", invoice.id)
        : supabase.from("invoices").insert({ ...row, client_id: launch!.client_id, launch_id: launch!.id, created_by: user?.id ?? null });
      const { error } = await q;
      if (error) throw new Error(error.message.includes("invoices_invoice_no_key") ? "That invoice number already exists" : error.message);
    },
    onSuccess: () => { toast.success("Invoice saved"); qc.invalidateQueries({ queryKey: ["invoices"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={`i-${k}`}>{label}</Label>
      <Input id={`i-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{invoice ? `Update ${invoice.invoice_no}` : "Record invoice"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!invoice ? (
            <div className="space-y-1 sm:col-span-2">
              <Label>Client launch</Label>
              <Select value={f.launch_id} onValueChange={(v) => setF({ ...f, launch_id: v })}>
                <SelectTrigger><SelectValue placeholder={clients.isLoading ? "Loading…" : "Choose client"} /></SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.clients?.hotel_name} · {l.status}{l.contract_start ? ` · from ${l.contract_start}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {field("invoice_no", "Invoice no")}
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={f.invoice_type} onValueChange={(v) => setF({ ...f, invoice_type: v as Invoice["invoice_type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(INVOICE_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field("period_start", "Period from", "date")}
          {field("period_end", "Period to", "date")}
          {field("amount_inr", "Amount (₹)", "number")}
          {field("raised_on", "Raised on", "date")}
          {field("due_on", "Due by", "date")}
          {field("paid_amount_inr", "Paid so far (₹)", "number")}
          {field("paid_on", "Paid on", "date")}
          <div className="sm:col-span-2">{field("notes", "Notes (internal — never shown to the hotel)")}</div>
        </div>
        <p className="text-xs text-muted-foreground">Status (unpaid / part-paid / paid) follows the paid amount; late interest is taken from the contract.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
