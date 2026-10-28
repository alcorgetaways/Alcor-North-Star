import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { fyMonths } from "@/lib/bookings-import";
import { cn } from "@/lib/utils";

type PropMonth = { month: string; booked: number; goal: number | null; direct_billed: number | null; ota_billed: number | null; billing_notes: string | null };
type PropRow = { client_id: string; hotel_name: string; client_code: string | null; months: PropMonth[] };

const monthLabel = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

export function usePropertyMonths(fy: number) {
  return useQuery({
    queryKey: ["rd-property-months", fy],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rd_property_months", { _fy: fy });
      if (error) throw error;
      return data as unknown as PropRow[];
    },
  });
}

/** Booked basis (stay month, from the bookings ledger) next to checkout basis (typed direct + OTA billing). */
export function PropertyRevenueBasis({ fy }: { fy: number }) {
  const { data = [], error } = usePropertyMonths(fy);
  const months = fyMonths(fy);
  return (
    <section className="card-surface overflow-x-auto">
      <div className="px-4 pt-3">
        <h3 className="text-card-title font-semibold">Property revenue — FY {fy}-{String(fy + 1).slice(2)} (Apr–Mar)</h3>
        <p className="text-xs text-muted-foreground">
          <b>Booked basis</b> = BOOKED deals from the bookings ledger by stay month, against the property goal.{" "}
          <b>Checkout basis</b> = direct + OTA billing at checkout, as entered below. Blank means not entered yet.
        </p>
        {error ? <p className="text-xs text-destructive">{(error as Error).message}</p> : null}
      </div>
      <table className="mt-2 w-full min-w-[1300px] text-small">
        <thead><tr className="border-b border-border/70 bg-muted/40 text-muted-foreground">
          <th className="px-3 py-2 text-left font-medium">Property</th>
          <th className="px-2 text-left font-medium">Basis</th>
          {months.map((m) => <th key={m} className="px-2 text-right font-medium">{monthLabel(m)}</th>)}
          <th className="px-2 text-right font-medium">FY total</th>
        </tr></thead>
        <tbody>
          {data.map((p) => {
            const tb = p.months.reduce((s, m) => s + Number(m.booked), 0);
            const tg = p.months.reduce((s, m) => s + Number(m.goal ?? 0), 0);
            const billed = (m: PropMonth) => (m.direct_billed == null && m.ota_billed == null ? null : Number(m.direct_billed ?? 0) + Number(m.ota_billed ?? 0));
            const tc = p.months.reduce((s, m) => s + (billed(m) ?? 0), 0);
            const anyBilled = p.months.some((m) => billed(m) != null);
            return (
              <Fragment key={p.client_id}>
                <tr className="align-top">
                  <td rowSpan={2} className="border-b border-border/40 px-3 py-1.5 font-medium">
                    {p.client_code ? <span className="mr-1 text-muted-foreground">{p.client_code}</span> : null}{p.hotel_name}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">Booked basis</td>
                  {p.months.map((m) => (
                    <td key={m.month} className="px-2 py-1.5 text-right tabular-nums">
                      <div>{currency(m.booked)}</div>
                      {m.goal != null ? <div className={cn("text-label", Number(m.booked) >= Number(m.goal) ? "text-success" : "text-muted-foreground")}>goal {currency(m.goal)}</div> : null}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(tb)}{tg ? <div className="text-label text-muted-foreground">goal {currency(tg)}</div> : null}</td>
                </tr>
                <tr className="border-b border-border/40 align-top">
                  <td className="px-2 py-1.5 text-muted-foreground">Checkout basis</td>
                  {p.months.map((m) => (
                    <td key={m.month} className="px-2 py-1.5 text-right tabular-nums" title={m.billing_notes ?? undefined}>
                      {billed(m) == null ? <span className="text-muted-foreground">—</span> : (
                        <Fragment key={p.client_id}>
                          <div>{currency(billed(m))}</div>
                          <div className="text-label text-muted-foreground">D {currency(m.direct_billed ?? 0)} · OTA {currency(m.ota_billed ?? 0)}</div>
                        </Fragment>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{anyBilled ? currency(tc) : "—"}</td>
                </tr>
              </Fragment>
            );
          })}
          {!data.length ? <tr><td colSpan={15} className="py-6 text-center text-muted-foreground">No bookings, goals or checkout billing this financial year yet.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

/** Finance, admin/management and the Reservation Desk head enter checkout billing: one row per property per month. */
export function CheckoutBillingEntry({ fy }: { fy: number }) {
  const qc = useQueryClient();
  const months = fyMonths(fy);
  const { data: clients = [] } = useQuery({
    queryKey: ["billing-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, hotel_name, client_code").eq("is_test", false).order("hotel_name");
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState({ client: "", month: months[0]!, direct: "", ota: "", notes: "" });
  const load = async (client: string, month: string) => {
    setF((x) => ({ ...x, client, month }));
    if (!client) return;
    const { data } = await supabase.from("rd_property_billing").select("direct_billed_inr, ota_billed_inr, notes")
      .eq("client_id", client).eq("month", month).maybeSingle();
    setF((x) => ({ ...x, direct: data?.direct_billed_inr != null ? String(data.direct_billed_inr) : "",
      ota: data?.ota_billed_inr != null ? String(data.ota_billed_inr) : "", notes: data?.notes ?? "" }));
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[₹,\s]/g, "")));
  const bad = [f.direct, f.ota].some((v) => { const n = num(v); return n != null && (!Number.isFinite(n) || n < 0); });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rd_property_billing").upsert({
        client_id: f.client, month: f.month, direct_billed_inr: num(f.direct), ota_billed_inr: num(f.ota),
        notes: f.notes.trim() || null, source: "typed",
      }, { onConflict: "client_id,month" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Checkout billing saved"); qc.invalidateQueries({ queryKey: ["rd-property-months"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="card-surface p-5 text-sm">
      <h3 className="text-card-title font-semibold">Enter checkout billing</h3>
      <p className="text-xs text-muted-foreground">One entry per property per month. Saving again replaces that month's figures.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Select value={f.client} onValueChange={(v) => load(v, f.month)}>
          <SelectTrigger className="w-64" aria-label="Property"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.client_code ? `${c.client_code} · ` : ""}{c.hotel_name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.month} onValueChange={(v) => load(f.client, v)}>
          <SelectTrigger className="w-32" aria-label="Month"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="w-40" inputMode="numeric" aria-label="Direct checkout billing" placeholder="Direct billing ₹" value={f.direct} onChange={(e) => setF({ ...f, direct: e.target.value })} />
        <Input className="w-40" inputMode="numeric" aria-label="OTA checkout billing" placeholder="OTA billing ₹" value={f.ota} onChange={(e) => setF({ ...f, ota: e.target.value })} />
        <Input className="w-64" aria-label="Notes" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Button size="sm" disabled={!f.client || bad || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
      {bad ? <p className="mt-1 text-xs text-destructive">Amounts must be zero or more.</p> : null}
    </section>
  );
}
