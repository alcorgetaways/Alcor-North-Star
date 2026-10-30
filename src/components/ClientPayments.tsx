import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Payment = {
  id: string;
  billing_month: string;
  amount_inr: number | null;
  status: "paid" | "pending";
  utr_number: string | null;
  evidence_url: string | null;
  evidence_path: string | null;
  note: string | null;
};
type PaymentEmailDraft = {
  id: string;
  billing_month: string;
  to_address: string;
  subject: string;
  body: string;
  invoice_path: string;
  invoice_name: string;
  status: "draft" | "queued" | "sent" | "failed" | "cancelled";
  sent_at: string | null;
};
const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const formatInr = (value: string) => value && Number.isFinite(Number(value))
  ? `₹${new Intl.NumberFormat("en-IN").format(Number(value))}`
  : "₹—";

export function ClientPayments({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  // The new payment and draft RPCs are added by the companion Supabase migration.
  const paymentDb = supabase as any;
  const { roles } = useAuth();
  const editable = roles.some((r) => ["admin", "management", "bd_manager", "finance"].includes(r));
  const [month, setMonth] = useState(monthValue(new Date()));
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"paid" | "pending">("pending");
  const [utr, setUtr] = useState("");
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [note, setNote] = useState("");
  const [invoicePath, setInvoicePath] = useState("");
  const [invoiceName, setInvoiceName] = useState("");
  const [toInput, setToInput] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [bodyInput, setBodyInput] = useState("");
  const [busy, setBusy] = useState(false);

  const client = useQuery({
    queryKey: ["payment-email-client", clientId],
    queryFn: async () => {
      const { data, error } = await paymentDb.from("clients")
        .select("id,hotel_name,owner_name,email,client_code").eq("id", clientId).single();
      if (error) throw error;
      return data as { id: string; hotel_name: string; owner_name: string | null; email: string | null; client_code: string | null };
    },
  });

  const payments = useQuery({
    queryKey: ["client-payments", clientId],
    queryFn: async () => {
      const { data, error } = await paymentDb.from("client_payments")
        .select("id,billing_month,amount_inr,status,utr_number,evidence_url,evidence_path,note")
        .eq("client_id", clientId).order("billing_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const emailDraftQuery = useQuery({
    queryKey: ["client-payment-email-draft", clientId, month],
    queryFn: async () => {
      const { data, error } = await paymentDb.from("client_payment_email_drafts")
        .select("id,billing_month,to_address,subject,body,invoice_path,invoice_name,status,sent_at")
        .eq("client_id", clientId).eq("billing_month", month).maybeSingle();
      if (error) throw error;
      return data as PaymentEmailDraft | null;
    },
  });
  const emailDraft = emailDraftQuery.data ?? null;

  useEffect(() => {
    if (!emailDraft) return;
    setToInput(emailDraft.to_address);
    setSubjectInput(emailDraft.subject);
    setBodyInput(emailDraft.body);
    setInvoicePath(emailDraft.invoice_path);
    setInvoiceName(emailDraft.invoice_name);
  }, [emailDraft]);

  const clientName = client.data?.hotel_name ?? "your hotel";
  const recipient = toInput || client.data?.email || "";
  const subject = subjectInput || `Payment due for ${monthLabel(month)} | ${clientName}`;
  const body = bodyInput || [
    `Dear ${client.data?.owner_name || "Sir/Madam"},`,
    "",
    `Please find attached the invoice for ${monthLabel(month)} for ${clientName}.`,
    `The total amount due is ${formatInr(amount)}.`,
    "",
    "We kindly request you to arrange the payment at your earliest convenience.",
    "",
    "Warm regards,",
    "Alcor Getaways",
  ].join("\n");

  async function uploadInvoice(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      toast.error("Choose an invoice PDF under 10 MB");
      return;
    }
    setBusy(true);
    const next = `${clientId}/payment-invoices/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from("client-files").upload(next, file, { contentType: "application/pdf", upsert: false });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      setInvoicePath(next);
      setInvoiceName(file.name);
      setSubjectInput("");
      setBodyInput("");
      toast.success("Invoice attached to the email draft");
    }
  }

  async function openEvidence(p: Payment) {
    if (p.evidence_url) { window.open(p.evidence_url, "_blank", "noopener,noreferrer"); return; }
    if (p.evidence_path) {
      const { data, error } = await supabase.storage.from("client-files").createSignedUrl(p.evidence_path, 300);
      if (error || !data) toast.error("Could not open the receipt");
      else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function savePaymentAndPrepareEmail() {
    if (!amount || Number(amount) <= 0) { toast.error("Enter a positive payment amount"); return null; }
    if (!invoicePath || !invoiceName) { toast.error("Attach the invoice PDF before preparing the email"); return null; }
    if (!recipient.trim()) { toast.error("This client has no email address; enter a recipient"); return null; }
    if (!subject.trim() || !body.trim()) { toast.error("Email subject and message are required"); return null; }
    setBusy(true);
    try {
      const { data, error } = await paymentDb.rpc("prepare_pending_payment_email", {
        _client_id: clientId,
        _month: month,
        _amount: Number(amount),
        _utr: utr || null,
        _evidence_url: url || null,
        _evidence_path: path || null,
        _note: note || null,
        _to: recipient.trim(),
        _subject: subject.trim(),
        _body: body.trim(),
        _invoice_path: invoicePath,
        _invoice_name: invoiceName,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["client-payments", clientId] }),
        qc.invalidateQueries({ queryKey: ["client-payment-email-draft", clientId, month] }),
        qc.invalidateQueries({ queryKey: ["finance-monthly-payment-statuses"] }),
      ]);
      toast.success("Pending payment saved. Email draft prepared; it has not been sent.");
      return data as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare payment email");
      return null;
    } finally { setBusy(false); }
  }

  async function savePaidPayment() {
    if (!utr.trim()) { toast.error("Enter the UTR/reference before marking a payment paid"); return; }
    setBusy(true);
    try {
      const { error } = await paymentDb.rpc("save_client_payment", {
        _client_id: clientId, _month: month, _amount: amount ? Number(amount) : null, _status: "paid",
        _utr: utr || null, _evidence_url: url || null, _evidence_path: path || null, _note: note || null,
      });
      if (error) throw error;
      toast.success("Monthly payment saved as paid");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["client-payments", clientId] }),
        qc.invalidateQueries({ queryKey: ["finance-monthly-payment-statuses"] }),
      ]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save payment"); }
    finally { setBusy(false); }
  }

  async function sendPaymentEmail() {
    if (emailDraft?.status === "queued" || emailDraft?.status === "sent") {
      toast.error("This payment email is already queued or sent");
      return;
    }
    const draftId = await savePaymentAndPrepareEmail();
    if (!draftId) return;
    setBusy(true);
    try {
      const { error } = await paymentDb.rpc("queue_pending_payment_email", { _draft_id: draftId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["client-payment-email-draft", clientId, month] });
      qc.invalidateQueries({ queryKey: ["email-status"] });
      toast.success("Email queued. The email worker will send it when email sending is enabled.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not queue the email"); }
    finally { setBusy(false); }
  }

  function changeMonth(value: string) {
    if (!value) return;
    setMonth(`${value}-01`);
    setInvoicePath("");
    setInvoiceName("");
    setToInput("");
    setSubjectInput("");
    setBodyInput("");
  }

  const emailStatusLabel = emailDraft?.status === "sent" ? "Email sent"
    : emailDraft?.status === "queued" ? "Email queued"
      : emailDraft?.status === "cancelled" ? "Email cancelled — payment was marked paid"
      : emailDraft?.status === "failed" ? "Email failed — review and retry"
        : emailDraft?.status === "draft" ? "Draft saved · not sent" : "Draft not saved";

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div><h2 className="font-semibold">Monthly payments</h2><p className="text-sm text-muted-foreground">Payment status and receipt history by billing month.</p></div>
    {editable ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label>Billing month</Label><Input type="month" value={month.slice(0, 7)} onChange={e => changeMonth(e.target.value)} /></div>
      <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="space-y-1"><Label>Status</Label><Select value={status} onValueChange={v => setStatus(v as "paid" | "pending")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label>UTR / transaction number</Label><Input value={utr} onChange={e => setUtr(e.target.value)} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>Evidence link (HTTPS)</Label><Input type="url" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} /></div>
      <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={e => setNote(e.target.value)} /></div>

      {status === "pending" ? <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-border bg-muted/20 p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="font-semibold">Pending payment email</h3><p className="text-sm text-muted-foreground">Attach the invoice, review the prefilled draft, then send it when ready.</p></div>
          <span className="rounded-full border px-2.5 py-1 text-xs">{emailStatusLabel}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
          <div className="space-y-3">
            <div className="space-y-1"><Label>Invoice PDF (max 10 MB)</Label><Input type="file" accept="application/pdf" disabled={busy || emailDraft?.status === "queued" || emailDraft?.status === "sent"} onChange={e => void uploadInvoice(e.target.files?.[0])} />
              {invoiceName ? <p className="text-xs text-muted-foreground">Attached: {invoiceName}</p> : null}
            </div>
            <div className="space-y-1"><Label>Recipient email</Label><Input type="email" value={recipient} onChange={e => setToInput(e.target.value)} placeholder={client.data?.email ?? "client@example.com"} disabled={emailDraft?.status === "queued" || emailDraft?.status === "sent"} /></div>
            <div className="space-y-1"><Label>Email subject</Label><Input value={subject} onChange={e => setSubjectInput(e.target.value)} disabled={emailDraft?.status === "queued" || emailDraft?.status === "sent"} /></div>
            <div className="space-y-1"><Label>Email message</Label><Textarea rows={8} value={body} onChange={e => setBodyInput(e.target.value)} disabled={emailDraft?.status === "queued" || emailDraft?.status === "sent"} /></div>
            <div className="flex flex-wrap gap-2">
              {emailDraft?.status !== "queued" && emailDraft?.status !== "sent" ? <>
                <Button disabled={busy} onClick={() => void savePaymentAndPrepareEmail()}>{busy ? "Saving…" : "Save pending & prepare email"}</Button>
                <Button variant="outline" disabled={busy || !invoicePath || !amount} onClick={() => void sendPaymentEmail()}>{busy ? "Queuing…" : "Send email"}</Button>
              </> : null}
            </div>
            <p className="text-xs text-muted-foreground">Review the draft before sending. Sending queues it for the existing email worker; a pending status alone never sends email.</p>
          </div>
          <aside className="rounded-lg border border-border bg-background p-4">
            <p className="mb-3 text-sm font-semibold">Invoice attachment preview</p>
            {invoiceName ? <div className="rounded-md border bg-muted/20 p-3 text-sm"><strong>{invoiceName}</strong><p className="mt-1 text-xs text-muted-foreground">PDF · attached to the email</p></div> : <p className="text-sm text-muted-foreground">Upload the invoice PDF to preview the attachment.</p>}
            <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">To: {recipient || "Add a recipient email"}</div>
            <div className="mt-2 text-xs text-muted-foreground">Amount due: {formatInr(amount)}</div>
          </aside>
        </div>
      </div> : null}

      <div className="flex items-end">
        {status === "paid" ? <Button disabled={busy || !utr.trim()} onClick={() => void savePaidPayment()}>{busy ? "Saving…" : "Save paid payment"}</Button> : null}
      </div>
    </div> : null}
    {payments.isError ? <p role="alert" className="text-sm text-destructive">Could not load payment history.</p> : null}
    {emailDraftQuery.isError ? <p role="alert" className="text-sm text-destructive">Could not load the saved payment email draft. Apply the payment email migration and refresh.</p> : null}
    <div className="divide-y divide-border">{(payments.data ?? []).map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div><strong>{monthLabel(p.billing_month)}</strong><span className="ml-2 capitalize">{p.status}</span>{p.amount_inr != null ? <span className="ml-2">₹{new Intl.NumberFormat("en-IN").format(p.amount_inr)}</span> : null}{p.utr_number ? <span className="ml-2 text-muted-foreground">UTR {p.utr_number}</span> : null}</div>{p.evidence_url || p.evidence_path ? <Button variant="outline" size="sm" onClick={() => void openEvidence(p)}>Open receipt evidence</Button> : <span className="text-xs text-muted-foreground">No receipt attached</span>}</div>)}</div>
    {!payments.isLoading && !(payments.data ?? []).length ? <p className="text-sm text-muted-foreground">No monthly payments recorded.</p> : null}
  </section>;
}
