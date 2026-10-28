import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Payment = { id: string; billing_month: string; amount_inr: number | null; status: "paid" | "pending"; utr_number: string | null; evidence_url: string | null; evidence_path: string | null; note: string | null };
const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function ClientPayments({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  // Generated Supabase types update when this migration reaches the linked database.
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
  const [busy, setBusy] = useState(false);
  const payments = useQuery({
    queryKey: ["client-payments", clientId],
    queryFn: async () => {
      const { data, error } = await paymentDb.from("client_payments").select("id,billing_month,amount_inr,status,utr_number,evidence_url,evidence_path,note").eq("client_id", clientId).order("billing_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  async function save() {
    setBusy(true);
    try {
      const { error } = await paymentDb.rpc("save_client_payment", {
        _client_id: clientId, _month: month, _amount: amount ? Number(amount) : null, _status: status,
        _utr: utr || null, _evidence_url: url || null, _evidence_path: path || null, _note: note || null,
      });
      if (error) throw error;
      toast.success("Monthly payment saved");
      await qc.invalidateQueries({ queryKey: ["client-payments", clientId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save payment"); }
    finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) { toast.error("Choose a JPG, PNG, WebP or PDF under 10 MB"); return; }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "file";
    const next = `${clientId}/payment-evidence/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("client-files").upload(next, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (error) toast.error(error.message); else { setPath(next); toast.success("Evidence uploaded"); }
  }

  async function openEvidence(p: Payment) {
    if (p.evidence_url) { window.open(p.evidence_url, "_blank", "noopener,noreferrer"); return; }
    if (p.evidence_path) {
      const { data, error } = await supabase.storage.from("client-files").createSignedUrl(p.evidence_path, 300);
      if (error || !data) toast.error("Could not open the receipt"); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div><h2 className="font-semibold">Monthly payments</h2><p className="text-sm text-muted-foreground">Payment status and receipt history by billing month.</p></div>
    {editable ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label>Billing month</Label><Input type="month" value={month.slice(0,7)} onChange={e => setMonth(`${e.target.value}-01`)} /></div>
      <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="space-y-1"><Label>Status</Label><Select value={status} onValueChange={v => setStatus(v as "paid" | "pending")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label>UTR / transaction number</Label><Input value={utr} onChange={e => setUtr(e.target.value)} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>Evidence link (HTTPS)</Label><Input type="url" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} /></div>
      <div className="space-y-1"><Label>Receipt image or PDF (max 10 MB)</Label><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => void upload(e.target.files?.[0])} /></div>
      <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={e => setNote(e.target.value)} /></div>
      <div className="flex items-end"><Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save payment"}</Button></div>
    </div> : null}
    {payments.isError ? <p role="alert" className="text-sm text-destructive">Could not load payment history.</p> : null}
    <div className="divide-y divide-border">{(payments.data ?? []).map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div><strong>{monthLabel(p.billing_month)}</strong><span className="ml-2 capitalize">{p.status}</span>{p.amount_inr != null ? <span className="ml-2">₹{new Intl.NumberFormat("en-IN").format(p.amount_inr)}</span> : null}{p.utr_number ? <span className="ml-2 text-muted-foreground">UTR {p.utr_number}</span> : null}</div>{p.evidence_url || p.evidence_path ? <Button variant="outline" size="sm" onClick={() => void openEvidence(p)}>Open evidence</Button> : <span className="text-xs text-muted-foreground">No receipt attached</span>}</div>)}</div>
    {!payments.isLoading && !(payments.data ?? []).length ? <p className="text-sm text-muted-foreground">No monthly payments recorded.</p> : null}
  </section>;
}
