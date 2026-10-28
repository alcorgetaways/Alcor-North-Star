import { AlertStack } from "@/components/AlertStack";
import { ProgressRing } from "@/components/ProgressRing";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { todayIST } from "@/lib/launch";
import { fyOf } from "@/lib/bookings-import";
import { CheckoutBillingEntry, PropertyRevenueBasis } from "@/components/PropertyRevenue";
import { mondayOf, type RdPeriod } from "@/lib/rd-periods";
import { DailyLogForm, FollowUps, GradeBadge, PacingCard, PeriodPicker, useRdPerformance, type RdStats } from "@/components/ResDesk";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reservation-desk")({
  head: () => ({
    meta: [
      { title: "Reservation Desk — Alcor North Star" },
      { name: "description", content: "Reservation Desk team KPIs, grades, property revenue and call handling." },
      { property: "og:title", content: "Reservation Desk — Alcor North Star" },
      { property: "og:description", content: "Team table, property × month revenue vs goal and call-handling panel for the Reservation Desk head." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReservationDeskPage,
});

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
const BAND: Record<string, string> = { green: "text-success", yellow: "text-warning-foreground", red: "text-destructive" };

function ReservationDeskPage() {
  const [period, setPeriod] = useState<RdPeriod>("week");
  const { bounds, query } = useRdPerformance(period);
  const team = query.data ?? [];
  const [person, setPerson] = useState<string>("");
  const year = +todayIST().slice(0, 4);
  return (
    <div className="space-y-6 overflow-x-clip">
      <PageHeader
        title="Reservation Desk"
        description="All 12 KPIs per associate. Grade = sales achievement, lead-to-booking, connects per week and attendance (25 points each)."
        actions={<PeriodPicker value={period} onChange={setPeriod} />}
      />
      {query.isError ? <p className="text-sm text-destructive">{(query.error as Error).message}</p> : null}
      <AlertStack title="Overdue follow-ups" count={team.reduce((n,r) => n + r.overdue_followups, 0)} items={team.filter((r) => r.overdue_followups > 0).map((r) => ({ id: r.user_id, title: `${r.full_name} · ${r.overdue_followups} overdue`, unread: true }))} />
      <section className="space-y-2">
        <p className="text-small font-medium">{bounds.label}</p>
        <TeamTable rows={team} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-5 text-sm">
          <h3 className="text-card-title font-semibold">One associate</h3>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="mt-2 w-60"><SelectValue placeholder="Choose associate" /></SelectTrigger>
            <SelectContent>{team.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">Pick someone to see their goal pacing, correct any day's log, or override a week's goal.</p>
        </section>
        <GoalEditor userId={person} name={team.find((t) => t.user_id === person)?.full_name} year={year} />
      </div>
      {person ? (
        <>
          <PacingCard userId={person} year={year} />
          <DailyLogForm userId={person} title={`Daily log — ${team.find((t) => t.user_id === person)?.full_name ?? ""} (any day)`} />
        </>
      ) : null}

      <MonthlyActivityPlans code="reservations_desk" />
      <FollowUps canAdd={false} />
      <PropertyRevenueBasis fy={fyOf(todayIST())} />
      <CheckoutBillingEntry fy={fyOf(todayIST())} />
      <CallHandling />
    </div>
  );
}

function TeamTable({ rows }: { rows: RdStats[] }) {
  return (
    <>
    {/* Phones: one card per associate — the full 19-column table needs horizontal scrolling. */}
    <div className="space-y-2 sm:hidden">
      {rows.length === 0 ? <p className="card-surface p-4 text-sm text-muted-foreground">No associates yet.</p> : rows.map((r) => (
        <div key={r.user_id} className="card-surface space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{r.full_name}</span>
            <GradeBadge grade={r.grade} total={r.total} flag={r.goal_flag} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-muted-foreground">Revenue</p><p className="font-medium tabular-nums">{currency(r.revenue_booked)}</p></div>
            <div><p className="text-xs text-muted-foreground">Goal</p><p className="font-medium tabular-nums">{r.goal != null ? currency(r.goal) : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Achieved</p><p className="font-medium tabular-nums">{pct(r.sales_pct)}</p></div>
            <div><p className="text-xs text-muted-foreground">Bookings</p><p className="font-medium tabular-nums">{r.bookings}</p></div>
            <div><p className="text-xs text-muted-foreground">Follow-ups on time</p><p className={cn("font-medium tabular-nums", r.followups_pct != null && r.followups_pct < 90 && "text-destructive")}>{pct(r.followups_pct)}</p></div>
            <div><p className="text-xs text-muted-foreground">Overdue</p><p className={cn("font-medium tabular-nums", r.overdue_followups > 0 && "text-destructive")}>{r.overdue_followups}</p></div>
          </div>
        </div>
      ))}
    </div>
    <div className="hidden sm:block">
    <DataTable<RdStats>
      rows={rows}
      rowKey={(r) => r.user_id}
      emptyMessage="No associates yet."
      columns={[
        { key: "name", header: "Associate", render: (r) => <span className="font-medium">{r.full_name}</span> },
        { key: "grade", header: "Grade", render: (r) => <GradeBadge grade={r.grade} total={r.total} flag={r.goal_flag} /> },
        { key: "revenue", header: "Revenue", align: "right", render: (r) => currency(r.revenue_booked) },
        { key: "goal", header: "Goal", align: "right", render: (r) => (r.goal != null ? currency(r.goal) : r.goal_flag ?? "—") },
        { key: "achieved", header: "Achieved", align: "right", render: (r) => pct(r.sales_pct) },
        { key: "bookings", header: "Bookings", align: "right", render: (r) => r.bookings },
        { key: "avg", header: "Avg value", align: "right", render: (r) => (r.avg_booking_value != null ? currency(r.avg_booking_value) : "—") },
        { key: "leads", header: "Leads", align: "right", render: (r) => r.leads },
        { key: "l2b", header: "Lead→booking", align: "right", render: (r) => pct(r.l2b_pct) },
        { key: "connects", header: "Connects/wk", align: "right", render: (r) => r.connects_per_week },
        {
          key: "dials", header: "Dials/wk", align: "right",
          render: (r) => <span className={r.dials_band ? BAND[r.dials_band] : undefined}>{r.dials_per_week}</span>,
        },
        {
          key: "followups", header: "Follow-ups on time", align: "right",
          render: (r) => (
            <span className={cn(r.followups_pct != null && r.followups_pct < 90 && "text-destructive")}>{pct(r.followups_pct)}</span>
          ),
        },
        {
          key: "overdue", header: "Overdue", align: "right",
          render: (r) => <span className={cn(r.overdue_followups > 0 && "text-destructive")}>{r.overdue_followups}</span>,
        },
        {
          key: "cancel", header: "Cancel %", align: "right",
          render: (r) => <span className={cn(r.cancel_pct != null && r.cancel_pct >= 5 && "text-destructive")}>{pct(r.cancel_pct)}</span>,
        },
        { key: "advance", header: "Advance %", align: "right", render: (r) => pct(r.advance_pct) },
        { key: "due", header: "Due (upcoming)", align: "right", render: (r) => currency(r.due_balance_upcoming) },
        { key: "attendance", header: "Attendance", align: "right", render: (r) => `${pct(r.attendance_pct)} (${r.present_days}/${r.working_days})` },
        { key: "reports", header: "Reports am/pm", align: "right", render: (r) => `${r.morning_checkins}/${r.evening_checkins}` },
        { key: "ta", header: "TA connects / moved", align: "right", render: (r) => `${r.ta_connects} / ${r.ta_leads_moved}` },
      ]}
    />
    </div>
    </>
  );
}

function GoalEditor({ userId, name, year }: { userId: string; name?: string | undefined; year: number }) {
  const qc = useQueryClient();
  const [yearly, setYearly] = useState("");
  const [week, setWeek] = useState(mondayOf(todayIST()));
  const [weekGoal, setWeekGoal] = useState("");
  const saveYear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rd_person_goals")
        .upsert({ user_id: userId, year, yearly_goal_inr: Number(yearly), flag: null }, { onConflict: "user_id,year" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Yearly goal saved"); setYearly(""); qc.invalidateQueries({ queryKey: ["rd-pacing"] }); qc.invalidateQueries({ queryKey: ["rd-performance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveWeek = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rd_week_goal_overrides")
        .upsert({ user_id: userId, week_start: mondayOf(week), goal_inr: Number(weekGoal) }, { onConflict: "user_id,week_start" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Week goal overridden"); setWeekGoal(""); qc.invalidateQueries({ queryKey: ["rd-pacing"] }); qc.invalidateQueries({ queryKey: ["rd-performance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="card-surface p-5 text-sm">
      <h3 className="text-card-title font-semibold">Goals{name ? ` — ${name}` : ""}</h3>
      {!userId ? <p className="mt-2 text-xs text-muted-foreground">Choose an associate first.</p> : (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">Yearly goal {year} (₹, Jan–Dec)
              <Input type="number" min={0} className="w-48" value={yearly} onChange={(e) => setYearly(e.target.value)} />
            </label>
            <Button size="sm" disabled={!yearly || saveYear.isPending} onClick={() => saveYear.mutate()}>Save yearly goal</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">Week (any day in it)
              <Input type="date" className="w-44" value={week} onChange={(e) => setWeek(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground">Week goal (₹)
              <Input type="number" min={0} className="w-40" value={weekGoal} onChange={(e) => setWeekGoal(e.target.value)} />
            </label>
            <Button size="sm" variant="outline" disabled={!weekGoal || saveWeek.isPending} onClick={() => saveWeek.mutate()}>Override week</Button>
          </div>
        </div>
      )}
    </section>
  );
}

type CallRow = { id: string; week_start: string; slot: string; inbound_calls: number; answered: number; missed: number; unworked_leads: number; source: string };

function CallHandling() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["rd-calls"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rd_call_handling").select("*").order("week_start", { ascending: false }).order("slot").limit(60);
      if (error) throw error;
      return data as CallRow[];
    },
  });
  const [f, setF] = useState({ week: mondayOf(todayIST()), slot: "", inbound: "", answered: "", missed: "", unworked: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rd_call_handling").upsert({
        week_start: mondayOf(f.week), slot: f.slot.trim(), inbound_calls: Number(f.inbound) || 0, answered: Number(f.answered) || 0,
        missed: Number(f.missed) || 0, unworked_leads: Number(f.unworked) || 0, source: "typed",
      }, { onConflict: "week_start,slot" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Call handling saved"); setF({ ...f, slot: "", inbound: "", answered: "", missed: "", unworked: "" }); qc.invalidateQueries({ queryKey: ["rd-calls"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="card-surface p-5 text-small">
      <h3 className="text-card-title font-semibold">Call handling</h3>
      <p className="text-label text-muted-foreground">Typed for now (IVR / NeoDove integration later). Answer rate = answered ÷ inbound.</p>
      <div className="mt-2">
        <DataTable<CallRow>
          rows={data}
          rowKey={(r) => r.id}
          emptyMessage="Nothing recorded yet."
          className="border-0 shadow-none"
          columns={[
            { key: "week", header: "Week of", render: (r) => r.week_start },
            { key: "slot", header: "Rota slot", render: (r) => r.slot },
            { key: "inbound", header: "Inbound", align: "right", render: (r) => r.inbound_calls },
            { key: "answered", header: "Answered", align: "right", render: (r) => r.answered },
            {
              key: "rate", header: "Answer rate", align: "right",
              render: (r) => <div className="flex items-center justify-end gap-2"><div className="h-2 w-20 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{width: `${r.inbound_calls ? Math.min(100, Math.round(r.answered/r.inbound_calls*100)) : 0}%`}} /></div><span>{r.inbound_calls ? `${Math.round((r.answered / r.inbound_calls) * 100)}%` : "—"}</span></div>,
            },
            { key: "missed", header: "Missed", align: "right", render: (r) => r.missed },
            { key: "unworked", header: "Leads unworked", align: "right", render: (r) => r.unworked_leads },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
        <Input type="date" className="w-40" value={f.week} onChange={(e) => setF({ ...f, week: e.target.value })} />
        <Input className="w-36" placeholder="Rota slot (e.g. 9–1)" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })} />
        <Input className="w-24" type="number" min={0} placeholder="Inbound" value={f.inbound} onChange={(e) => setF({ ...f, inbound: e.target.value })} />
        <Input className="w-24" type="number" min={0} placeholder="Answered" value={f.answered} onChange={(e) => setF({ ...f, answered: e.target.value })} />
        <Input className="w-24" type="number" min={0} placeholder="Missed" value={f.missed} onChange={(e) => setF({ ...f, missed: e.target.value })} />
        <Input className="w-28" type="number" min={0} placeholder="Unworked" value={f.unworked} onChange={(e) => setF({ ...f, unworked: e.target.value })} />
        <Button size="sm" disabled={!f.slot.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
    </section>
  );
}
