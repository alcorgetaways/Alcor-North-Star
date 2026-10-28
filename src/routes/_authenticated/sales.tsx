import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { ProgressRow } from "@/components/ProgressRow";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckoutBillingEntry, PropertyRevenueBasis } from "@/components/PropertyRevenue";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SegmentedPill } from "@/components/SegmentedPill";
import { ProgressRing } from "@/components/ProgressRing";
import { MetricCard, MetricGrid } from "@/components/MetricCard";
import { inr, inrShort, int } from "@/lib/format";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { bookingError, manualBookingKey, parseMetric } from "@/lib/form-rules";
import { fyMonths, fyOf, mapBookingRows, parseCsv, summarizeImport, type ImportRow } from "@/lib/bookings-import";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales & Bookings — Alcor North Star" },
      { name: "description", content: "Bookings ledger and the financial-year sales dashboard per property and sales person." },
      { property: "og:title", content: "Sales & Bookings — Alcor North Star" },
      { property: "og:description", content: "Bookings ledger, goals and achievement for Alcor's sales team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

type Booking = {
  id: string; client_id: string; sales_person_id: string | null; sales_person_name: string | null;
  status: "BOOKED" | "CANCELLED"; booked_on: string | null; guest_name: string | null; guest_city: string | null;
  category: string | null; source: string | null; package: string | null; room_category: string | null;
  adults: number | null; kids: number | null; infants: number | null; rooms: number | null; nights: number | null;
  check_in: string | null; check_out: string | null; deal_inr: number; advance_pct: number | null; advance_inr: number | null;
  advance_deposit_date: string | null; due_balance_inr: number | null; special_request: string | null; stay_month: string;
  is_demo: boolean; voided_at: string | null; void_reason: string | null; clients: { hotel_name: string } | null;
};

const MONTH_LABEL = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const fmtD = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const todayIso = () => new Date().toISOString().slice(0, 10);

function useRefs() {
  const clients = useQuery({
    queryKey: ["sales-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, hotel_name, is_demo").order("hotel_name");
      if (error) throw error;
      return data as Array<{ id: string; hotel_name: string; is_demo: boolean }>;
    },
  });
  const staff = useQuery({
    queryKey: ["sales-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, client_id").is("client_id", null).order("full_name");
      if (error) throw error;
      return data as Array<{ id: string; full_name: string }>;
    },
  });
  return { clients: clients.data ?? [], staff: staff.data ?? [] };
}

function SalesPage() {
  const { roles } = useAuth();
  const canWrite = roles.some((r) => ["admin", "management", "finance"].includes(r));
  const [fy, setFy] = useState(fyOf(todayIso()));
  const [salesTab, setSalesTab] = useState("dashboard");
  const months = fyMonths(fy);

  const bookings = useQuery({
    queryKey: ["bookings", fy],
    queryFn: async () => {
      return await fetchAll((from, to) => supabase.from("bookings").select("*, clients(hotel_name)")
        .gte("stay_month", months[0] ?? "").lte("stay_month", months[11] ?? "")
        .order("stay_month", { ascending: false }).order("check_in", { ascending: false }).order("id").range(from, to)) as unknown as Booking[];
    },
  });

  const liveBookings = (bookings.data ?? []).filter((b) => b.status === "BOOKED" && !b.voided_at && !b.is_demo);
  const fyRevenue = liveBookings.reduce((s, b) => s + Number(b.deal_inr), 0);
  const fyAdvance = liveBookings.reduce((s, b) => s + Number(b.advance_inr ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & Bookings"
        description="Every booking Alcor's sales team makes, with the yearly sales dashboard. Guest phone and email are visible to Finance and management only."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(fy)} onValueChange={(v) => setFy(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[fy - 2, fy - 1, fy, fy + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>FY {y}-{String(y + 1).slice(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <MetricGrid>
        <MetricCard label={`Booked revenue FY ${fy}-${String(fy + 1).slice(2)}`} value={fyRevenue} format={inr} footer="Booked basis, by stay month" />
        <MetricCard label="Bookings" value={liveBookings.length} format={int} />
        <MetricCard label="Average deal value" value={liveBookings.length ? Math.round(fyRevenue / liveBookings.length) : null} format={inr} />
        <MetricCard label="Advance collected" value={fyAdvance} format={inr} />
      </MetricGrid>
      <Tabs value={salesTab} onValueChange={setSalesTab}>
        <SegmentedPill
          ariaLabel="Sales sections"
          value={salesTab}
          onChange={setSalesTab}
          items={[{ value: "dashboard", label: "Sales dashboard" }, { value: "ledger", label: "Bookings ledger" }]}
        />
        <TabsContent value="dashboard" className="space-y-6">
          <SalesDashboard fy={fy} months={months} bookings={bookings.data ?? []} canWrite={canWrite} />
          <PropertyRevenueBasis fy={fy} />
          <CheckoutBillingEntry fy={fy} />
        </TabsContent>
        <TabsContent value="ledger">
          <Ledger bookings={bookings.data ?? []} loading={bookings.isLoading} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

type Goal = { scope: "property" | "sales_person"; subject_key: string; fy: number; month_no: number; goal_inr: number };

function personKey(b: Booking) {
  return b.sales_person_id ?? `name:${(b.sales_person_name ?? "Unassigned").trim().toLowerCase()}`;
}

function SalesDashboard({ fy, months, bookings, canWrite }: { fy: number; months: string[]; bookings: Booking[]; canWrite: boolean }) {
  const { staff } = useRefs();
  const qc = useQueryClient();
  const goals = useQuery({
    queryKey: ["sales-goals", fy],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_goals").select("scope, subject_key, fy, month_no, goal_inr").eq("fy", fy);
      if (error) throw error;
      return data as Goal[];
    },
  });
  const saveGoal = useMutation({
    mutationFn: async (g: Goal) => {
      const { error } = await supabase.from("sales_goals").upsert(g, { onConflict: "scope,subject_key,fy,month_no" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-goals", fy] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const clearGoal = useMutation({
    mutationFn: async (g: Omit<Goal, "goal_inr">) => {
      const { error } = await supabase.from("sales_goals").delete().match(g);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-goals", fy] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const live = bookings.filter((b) => b.status === "BOOKED" && !b.voided_at && !b.is_demo);
  const goalKeys = [...new Set((goals.data ?? []).filter((g) => g.scope === "property" && g.month_no === 0).map((g) => g.subject_key))];
  const goalClients = useQuery({
    queryKey: ["goal-clients", goalKeys.join(",")],
    enabled: goalKeys.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, hotel_name, client_code, status").in("id", goalKeys);
      if (error) throw error;
      return data;
    },
  });
  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));

  const build = (scope: "property" | "sales_person") => {
    const rows = new Map<string, { key: string; label: string; byMonth: number[] }>();
    for (const b of live) {
      const key = scope === "property" ? b.client_id : personKey(b);
      const label = scope === "property" ? b.clients?.hotel_name ?? "—"
        : b.sales_person_id ? staffName.get(b.sales_person_id) ?? b.sales_person_name ?? "—" : b.sales_person_name ?? "Unassigned";
      const r = rows.get(key) ?? { key, label, byMonth: Array(12).fill(0) };
      const i = months.indexOf(b.stay_month);
      if (i >= 0) r.byMonth[i] += Number(b.deal_inr);
      rows.set(key, r);
    }
    if (scope === "property") {
      for (const c of goalClients.data ?? []) {
        const label = `${c.hotel_name}${c.status === "inactive" ? " (inactive)" : ""}`;
        const r = rows.get(c.id);
        if (r) r.label = label;
        else rows.set(c.id, { key: c.id, label, byMonth: Array(12).fill(0) });
      }
    }
    return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Booked revenue by stay month (cancelled bookings excluded). Goals are editable{canWrite ? "" : " by Finance"}; achieved % = booked ÷ goal. Property goals are the owner's yearly revenue goal; months default to yearly ÷ 12 until edited. Not part of team scorecards.
      </p>
      {(["property", "sales_person"] as const).map((scope) => (
        <GoalTable key={scope} scope={scope} fy={fy} months={months} rows={build(scope)} goals={goals.data ?? []}
          canWrite={canWrite} onSave={(g) => saveGoal.mutate(g)} onClear={(g) => clearGoal.mutate(g)} />
      ))}
    </>
  );
}

function pct(a: number, g: number | undefined) {
  return g ? `${Math.round((a / g) * 100)}%` : "—";
}

function GoalTable({ scope, fy, months, rows, goals, canWrite, onSave, onClear }: {
  scope: "property" | "sales_person"; fy: number; months: string[];
  rows: Array<{ key: string; label: string; byMonth: number[] }>; goals: Goal[]; canWrite: boolean; onSave: (g: Goal) => void; onClear: (g: Omit<Goal, "goal_inr">) => void;
}) {
  const explicitGoal = (key: string, monthNo: number) => goals.find((g) => g.scope === scope && g.subject_key === key && g.month_no === monthNo)?.goal_inr;
  // Property months default to the yearly goal ÷ 12 until a month is edited.
  const defaultGoal = (key: string, monthNo: number) => {
    const y = explicitGoal(key, 0);
    return monthNo > 0 && scope === "property" && y != null ? Math.round(Number(y) / 12) : undefined;
  };
  const goalOf = (key: string, monthNo: number) => explicitGoal(key, monthNo) ?? defaultGoal(key, monthNo);
  const monthNo = (iso: string) => Number(iso.slice(5, 7));
  const totals = Array(12).fill(0).map((_, i) => rows.reduce((s, r) => s + r.byMonth[i]!, 0));

  const goalInput = (key: string, mNo: number) =>
    canWrite ? (
      <Input
        key={`${fy}-${key}-${mNo}`}
        className="h-7 w-24 text-right text-xs"
        type="number"
        min={0}
        defaultValue={explicitGoal(key, mNo) ?? ""}
        placeholder={defaultGoal(key, mNo) != null ? String(defaultGoal(key, mNo)) : "Goal"}
        aria-label="Goal"
        onBlur={(e) => {
          // QA-14: blank clears the explicit goal (falls back to the default); negatives are rejected.
          const p = parseMetric(e.target.value);
          if (p.error) { toast.error(`Goal: ${p.error}`); e.target.value = String(explicitGoal(key, mNo) ?? ""); return; }
          if (p.value === explicitGoal(key, mNo)) return;
          if (p.value === null) { if (explicitGoal(key, mNo) != null) onClear({ scope, subject_key: key, fy, month_no: mNo }); return; }
          onSave({ scope, subject_key: key, fy, month_no: mNo, goal_inr: p.value });
        }}
      />
    ) : (
      <span className="text-xs text-muted-foreground">{goalOf(key, mNo) != null ? currency(goalOf(key, mNo)!) : "—"}</span>
    );

  type GoalRow = { key: string; label: string; byMonth: number[] };
  const monthlyChart = months.map((m, i) => {
    const gs = rows.map((r) => goalOf(r.key, monthNo(m)));
    return { month: MONTH_LABEL(m), booked: totals[i], goal: gs.some((g) => g != null) ? gs.reduce<number>((a, g) => a + (g ?? 0), 0) : null };
  });
  return (
    <section className="space-y-2">
      <h2 className="text-section-title font-semibold">{scope === "property" ? "By property" : "By sales person"}</h2>
      {scope === "property" ? (
        <div className="card-surface h-64 p-4" role="img" aria-label="Monthly booked revenue against the combined property goal">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyChart}>
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis tickFormatter={(v) => inrShort(Number(v))} stroke="var(--muted-foreground)" fontSize={11} width={56} />
              <RTooltip formatter={(v) => inr(Number(v))} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <Bar dataKey="booked" name="Booked" fill="var(--gold)" radius={[4, 4, 0, 0]} />
              <Line dataKey="goal" name="Goal" stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <DataTable<GoalRow>
        rows={rows}
        rowKey={(r) => r.key}
        emptyMessage="No booked revenue in this financial year yet."
        columns={[
          {
            key: "label",
            header: scope === "property" ? "Property" : "Sales person",
            render: (r) => <span className="font-medium">{r.label}</span>,
          },
          ...months.map((m, i) => ({
            key: m,
            header: MONTH_LABEL(m),
            align: "right" as const,
            render: (r: GoalRow) => {
              const v = r.byMonth[i]!;
              const mNo = monthNo(m);
              return (
                <div className="space-y-1">
                  <div>{v ? currency(v) : "—"}</div>
                  {goalInput(r.key, mNo)}
                  <div className="text-label text-muted-foreground">{pct(v, goalOf(r.key, mNo))}</div>
                </div>
              );
            },
          })),
          {
            key: "fy",
            header: "FY total",
            align: "right",
            render: (r) => {
              const total = r.byMonth.reduce((a, b) => a + b, 0);
              const g = goalOf(r.key, 0);
              return (
                <div className="w-40 space-y-2">
                  <div className="font-medium">{currency(total)}</div>
                  {goalInput(r.key, 0)}
                  {g != null && g > 0 ? (
                    scope === "property" ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-label text-muted-foreground">of FY goal</span>
                        <ProgressRing value={total} goal={g} label={`${r.label}: FY booked vs goal`} />
                      </div>
                    ) : (
                      <ProgressRow label="Goal vs achieved" value={total} goal={g} format={currency} />
                    )
                  ) : (
                    <div className="text-label text-muted-foreground">{pct(total, g)}</div>
                  )}
                </div>
              );
            },
          },
        ]}
      />
      {rows.length ? (
        <p className="text-label text-muted-foreground tabular-nums">
          FY total booked: {currency(totals.reduce((a, b) => a + b, 0))}
        </p>
      ) : null}
    </section>
  );
}

/* ---------------- Ledger ---------------- */

function Ledger({ bookings, loading, canWrite }: { bookings: Booking[]; loading: boolean; canWrite: boolean }) {
  const { roles } = useAuth();
  const canVoid = roles.some((r) => r === "finance" || r === "admin");
  const qc = useQueryClient();
  const voidIt = useMutation({
    mutationFn: async (b: Booking) => {
      const reason = window.prompt(`Void this booking for ${b.guest_name ?? "guest"}? It stays in the ledger as VOIDED and is left out of every total.\n\nReason:`);
      if (!reason?.trim()) return false;
      const { error } = await supabase.rpc("void_booking", { _booking_id: b.id, _reason: reason.trim() });
      if (error) throw error;
      return true;
    },
    onSuccess: (done) => { if (done) { toast.success("Booking voided"); qc.invalidateQueries({ queryKey: ["bookings"] }); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const contacts = useQuery({
    queryKey: ["booking-contacts", bookings.length],
    enabled: canWrite && bookings.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_guest_contacts").select("booking_id, guest_phone, guest_email");
      if (error) throw error;
      return new Map((data ?? []).map((c) => [c.booking_id, c]));
    },
  });
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? bookings.filter((b) => `${b.clients?.hotel_name} ${b.guest_name} ${b.sales_person_name} ${b.source} ${b.category}`.toLowerCase().includes(s)) : bookings;
  }, [bookings, q]);

  return (
    <div className="space-y-3">
      <DataTable<Booking>
        rows={shown}
        rowKey={(b) => b.id}
        loading={loading}
        emptyMessage="No bookings in this financial year yet."
        toolbar={
          <>
            <Input className="max-w-xs" placeholder="Search property, guest, sales person…" value={q} onChange={(e) => setQ(e.target.value)} />
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Add booking</Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><FileUp className="mr-2 h-4 w-4" />Import CSV</Button>
              </>
            ) : null}
            <span className="ml-auto text-label text-muted-foreground tabular-nums">{shown.length} bookings</span>
          </>
        }
        columns={[
          { key: "asm", header: "ASM", render: (b) => b.sales_person_name ?? "—" },
          {
            key: "property",
            header: "Property",
            render: (b) => (
              <span className="font-medium">
                {b.clients?.hotel_name}
                {b.is_demo ? <Badge variant="outline" className="ml-1">Demo</Badge> : null}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (b) => (
              <>
                {b.voided_at ? (
                  <StatusBadge status="voided" label="Voided" />
                ) : (
                  <StatusBadge status={b.status === "BOOKED" ? "booked" : "cancelled"} label={b.status} />
                )}
                {canVoid && !b.voided_at ? (
                  <button type="button" className="ml-1 text-label text-muted-foreground underline" title={b.void_reason ?? ""} onClick={() => voidIt.mutate(b)}>Void</button>
                ) : null}
              </>
            ),
          },
          { key: "booked", header: "Booked on", render: (b) => fmtD(b.booked_on) },
          { key: "guest", header: "Guest", render: (b) => b.guest_name ?? "—" },
          ...(canWrite
            ? [
                { key: "phone", header: "Number", render: (b: Booking) => contacts.data?.get(b.id)?.guest_phone ?? "—" },
                { key: "email", header: "Email", render: (b: Booking) => contacts.data?.get(b.id)?.guest_email ?? "—" },
              ]
            : []),
          { key: "city", header: "City", render: (b) => b.guest_city ?? "—" },
          { key: "category", header: "Category", render: (b) => b.category ?? "—" },
          { key: "source", header: "Source", render: (b) => b.source ?? "—" },
          { key: "package", header: "Package", render: (b) => b.package ?? "—" },
          { key: "room", header: "Room", render: (b) => b.room_category ?? "—" },
          { key: "aki", header: "A/K/I", align: "right", render: (b) => [b.adults, b.kids, b.infants].map((v) => v ?? 0).join("/") },
          { key: "rooms", header: "Rooms", align: "right", render: (b) => b.rooms ?? "—" },
          { key: "nights", header: "Nights", align: "right", render: (b) => b.nights ?? "—" },
          { key: "ci", header: "C/I", render: (b) => fmtD(b.check_in) },
          { key: "co", header: "C/O", render: (b) => fmtD(b.check_out) },
          { key: "deal", header: "Deal", align: "right", render: (b) => currency(b.deal_inr) },
          { key: "advpct", header: "Adv %", align: "right", render: (b) => (b.advance_pct != null ? `${b.advance_pct}%` : "—") },
          { key: "advance", header: "Advance", align: "right", render: (b) => (b.advance_inr != null ? currency(b.advance_inr) : "—") },
          { key: "advdate", header: "Adv. date", render: (b) => fmtD(b.advance_deposit_date) },
          { key: "due", header: "Due", align: "right", render: (b) => (b.due_balance_inr != null ? currency(b.due_balance_inr) : "—") },
          {
            key: "request",
            header: "Request",
            className: "max-w-40",
            render: (b) => <span className="block truncate" title={b.special_request ?? ""}>{b.special_request ?? "—"}</span>,
          },
          { key: "month", header: "Month", render: (b) => MONTH_LABEL(b.stay_month) },
        ]}
      />
      {canWrite ? <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} /> : null}
      {canWrite ? <AddBookingDialog open={addOpen} onClose={() => setAddOpen(false)} /> : null}
    </div>
  );
}

async function saveBookings(rows: Array<NonNullable<ImportRow["booking"]>>, userId: string | undefined) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await supabase
      .from("bookings")
      .upsert(chunk.map(({ guest_phone: _p, guest_email: _e, ...b }) => ({ ...b, created_by: userId ?? null })), { onConflict: "import_key" })
      .select("id, import_key");
    if (error) throw error;
    const idByKey = new Map((data ?? []).map((d) => [d.import_key, d.id]));
    const contacts = chunk
      .filter((b) => b.guest_phone || b.guest_email)
      .map((b) => ({ booking_id: idByKey.get(b.import_key)!, guest_phone: b.guest_phone, guest_email: b.guest_email }))
      .filter((c) => c.booking_id);
    if (contacts.length) {
      const { error: cErr } = await supabase.from("booking_guest_contacts").upsert(contacts, { onConflict: "booking_id" });
      if (cErr) throw cErr;
    }
    saved += chunk.length;
  }
  return saved;
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { clients, staff } = useRefs();
  const qc = useQueryClient();
  const [result, setResult] = useState<ReturnType<typeof mapBookingRows> | null>(null);
  const [fileName, setFileName] = useState("");

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setResult(mapBookingRows(parseCsv(text), {
      properties: clients.map((c) => ({ id: c.id, name: c.hotel_name })),
      staff: staff.map((s) => ({ id: s.id, name: s.full_name })),
    }));
  }
  const good = result?.rows.filter((r) => r.booking) ?? [];
  const bad = result?.rows.filter((r) => !r.booking) ?? [];

  const commit = useMutation({
    mutationFn: () => saveBookings(good.map((r) => r.booking!), user?.id),
    onSuccess: (n) => {
      toast.success(`${n} bookings saved (existing ones updated, no duplicates)`);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking-contacts"] });
      setResult(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setResult(null); onClose(); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import bookings from the SALES sheet</DialogTitle>
          <DialogDescription>
            Download the SALES tab as CSV and choose it here. You'll see a preview with every problem row first; nothing is saved until you confirm.
            Importing the same file again updates the same bookings instead of adding duplicates.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{fileName}</span>: {good.length} ready, {bad.length} with problems.
              {result.missingColumns.length ? <span className="text-destructive"> Missing columns: {result.missingColumns.join(", ")}.</span> : null}
              {result.unknownColumns.length ? <span className="text-muted-foreground"> Ignored columns: {result.unknownColumns.join(", ")}.</span> : null}
            </p>
            {bad.length ? (
              <div className="max-h-48 overflow-y-auto rounded border border-destructive/40 p-2 text-xs">
                {bad.map((r) => <p key={r.row}><span className="font-medium">Row {r.row}</span> ({r.property || "—"}): {r.errors.join("; ")}</p>)}
              </div>
            ) : null}
            {good.length ? <ImportSummary rows={result.rows} /> : null}
            {good.length ? (
              <div className="max-h-48 overflow-y-auto rounded border border-border/70 p-2 text-xs">
                {good.slice(0, 50).map((r) => (
                  <p key={r.row}>
                    Row {r.row}: {r.property} · {r.salesPerson} · {r.booking!.status} · {r.booking!.guest_name ?? "—"} · {currency(r.booking!.deal_inr)} · {MONTH_LABEL(r.booking!.stay_month)}
                    {r.booking!.meal_plan ? ` · ${r.booking!.meal_plan}` : ""}
                    {r.flags.length ? <span className="text-warning-foreground"> · ⚑ {r.flags.join("; ")}</span> : null}
                  </p>
                ))}
                {good.length > 50 ? <p className="text-muted-foreground">…and {good.length - 50} more</p> : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={!good.length || commit.isPending || result.missingColumns.length > 0} onClick={() => commit.mutate()}>
                {commit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save {good.length} bookings{bad.length ? ` (skip ${bad.length})` : ""}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportSummary({ rows }: { rows: ImportRow[] }) {
  const sum = summarizeImport(rows);
  const Table = ({ title, list }: { title: string; list: ReturnType<typeof summarizeImport>["staff"] }) => (
    <DataTable
      className="max-h-56 overflow-y-auto rounded-none border-0 bg-transparent shadow-none"
      rows={list}
      rowKey={(x) => x.name}
      columns={[
        { key: "name", header: title, render: (x) => x.name },
        { key: "rows", header: "Rows", align: "right", render: (x) => x.rows },
        { key: "booked", header: "Booked", align: "right", render: (x) => x.booked },
        { key: "cancelled", header: "Cancelled", align: "right", render: (x) => x.cancelled },
        { key: "deal", header: "Booked ₹", align: "right", render: (x) => currency(x.deal) },
      ]}
    />
  );
  return (
    <div className="space-y-2">
      {sum.flagged ? <p className="text-xs text-muted-foreground">{sum.flagged} rows will be saved with a flag (e.g. advance more than deal, deal missing, package not mapped). Flags stay on the booking.</p> : null}
      <div className="grid gap-2 md:grid-cols-2">
        <Table title="Sales person" list={sum.staff} />
        <Table title="Property" list={sum.properties} />
      </div>
    </div>
  );
}

function AddBookingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { clients, staff } = useRefs();
  const qc = useQueryClient();
  const blank = { client_id: "", sales_person_id: "", sales_person_name: "", status: "BOOKED", booked_on: todayIso(), guest_name: "",
    guest_phone: "", guest_email: "", guest_city: "", category: "", source: "", check_in: "", check_out: "", deal_inr: "", advance_inr: "" };
  const [f, setF] = useState(blank);
  const save = useMutation({
    mutationFn: async () => {
      if (!f.client_id || !f.check_in || !f.deal_inr) throw new Error("Property, C/I and Deal are required");
      const sp = staff.find((s) => s.id === f.sales_person_id);
      const dealP = parseMetric(f.deal_inr), advP = parseMetric(f.advance_inr);
      if (dealP.error || advP.error) throw new Error(`Deal / advance: ${dealP.error ?? advP.error}`);
      const deal = dealP.value ?? 0;
      const invalid = bookingError({ checkIn: f.check_in, checkOut: f.check_out || null, deal, advance: advP.value });
      if (invalid) throw new Error(invalid);
      await saveBookings([{
        import_key: manualBookingKey(), // QA-15: two genuine walk-ins with the same details must not collide
        client_id: f.client_id, sales_person_id: sp?.id ?? null, sales_person_name: sp?.full_name ?? (f.sales_person_name || null),
        status: f.status as "BOOKED" | "CANCELLED", booked_on: f.booked_on || null, guest_name: f.guest_name || null,
        guest_city: f.guest_city || null, category: f.category || null, source: f.source || null, package: null, room_category: null,
        adults: null, kids: null, infants: null, rooms: null, nights: null, check_in: f.check_in, check_out: f.check_out || null,
        deal_inr: deal, advance_pct: null, advance_inr: f.advance_inr ? Number(f.advance_inr) : null, advance_deposit_date: null,
        due_balance_inr: f.advance_inr ? deal - Number(f.advance_inr) : null, special_request: null,
        stay_month: `${f.check_in.slice(0, 7)}-01`, guest_phone: f.guest_phone || null, guest_email: f.guest_email || null, meal_plan: null, package_note: null, import_flags: [],
      }], user?.id);
    },
    onSuccess: () => { toast.success("Booking saved"); qc.invalidateQueries({ queryKey: ["bookings"] }); setF(blank); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const field = (k: keyof typeof blank, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={`b-${k}`}>{label}</Label>
      <Input id={`b-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add booking</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Property</Label>
            <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choose hotel" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.hotel_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sales person</Label>
            <Select value={f.sales_person_id || "other"} onValueChange={(v) => setF({ ...f, sales_person_id: v === "other" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="other">Someone who has left (type name)</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!f.sales_person_id ? field("sales_person_name", "Sales person name") : null}
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="BOOKED">BOOKED</SelectItem><SelectItem value="CANCELLED">CANCELLED</SelectItem></SelectContent>
            </Select>
          </div>
          {field("booked_on", "Booked on", "date")}
          {field("guest_name", "Guest name")}
          {field("guest_phone", "Guest number")}
          {field("guest_email", "Guest email", "email")}
          {field("guest_city", "City")}
          {field("category", "Category (e.g. FAMILIES)")}
          {field("source", "Source (e.g. WEB FORM, OTA)")}
          {field("check_in", "C/I", "date")}
          {field("check_out", "C/O", "date")}
          {field("deal_inr", "Deal (₹)", "number")}
          {field("advance_inr", "Advance (₹)", "number")}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
