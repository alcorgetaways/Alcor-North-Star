import { SegmentedPill } from "@/components/SegmentedPill";
import { dailyLogError, pickFields } from "@/lib/form-rules";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GradeChip } from "@/components/GradeChip";
import { ProgressRow } from "@/components/ProgressRow";
import { DataTable } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency } from "@/lib/kpi";
import { inr, int } from "@/lib/format";
import { ProgressRing } from "@/components/ProgressRing";
import { ConfirmButton } from "@/components/ConfirmButton";
import { todayIST } from "@/lib/launch";
import { periodBounds, type RdPeriod } from "@/lib/rd-periods";
import { cn } from "@/lib/utils";

export type RdStats = {
  user_id: string; full_name: string;
  revenue_booked: number; goal: number | null; goal_flag: string | null; sales_pct: number | null;
  bookings: number; avg_booking_value: number | null; leads: number; l2b_pct: number | null;
  dials: number; dials_per_week: number; dials_band: "green" | "yellow" | "red" | null;
  connects: number; connects_per_week: number; weeks: number;
  followups_due: number; followups_on_time: number; followups_pct: number | null; overdue_followups: number;
  followups_source: "records" | "typed" | "mixed" | null; followups_from_records: number; followups_typed: number;
  cancelled_inr: number; cancel_pct: number | null; advance_inr: number; advance_pct: number | null; due_balance_upcoming: number;
  working_days: number; present_days: number; attendance_pct: number | null; morning_checkins: number; evening_checkins: number;
  ta_connects: number; ta_leads_moved: number; won_deal_connects: number;
  points: { sales: number; l2b: number; connects: number; attendance: number };
  total: number | null; grade: string | null;
};

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

export function GradeBadge({ grade, total, flag }: { grade: string | null; total?: number | null; flag?: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <GradeChip grade={grade} {...(total != null ? { points: total } : {})} />
      {!grade && flag ? <span className="text-label text-muted-foreground">{flag}</span> : null}
    </span>
  );
}

const BAND: Record<string, string> = { green: "text-success", yellow: "text-warning-foreground", red: "text-destructive" };

export function PeriodPicker({ value, onChange }: { value: RdPeriod; onChange: (p: RdPeriod) => void }) {
  return <SegmentedPill ariaLabel="Reservation period" value={value} onChange={(v) => onChange(v as RdPeriod)} items={[{value:"week",label:"Week"},{value:"month",label:"Month"},{value:"quarter",label:"Quarter"},{value:"year",label:"Year"}]} />;
}

/** QA-36: surface the real query error, never a misleading role/assignment message. */
export function QueryErrorAlert({ error, fallback }: { error: unknown; fallback: string }) {
  return <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : fallback}</p>;
}

export function useRdPerformance(period: RdPeriod, userId?: string) {
  const b = periodBounds(period, todayIST());
  return {
    bounds: b,
    query: useQuery({
      queryKey: ["rd-performance", b.from, b.to, userId ?? "all"],
      queryFn: async () => {
        const { data, error } = await supabase.rpc("rd_performance", userId ? { _from: b.from, _to: b.to, _user: userId } : { _from: b.from, _to: b.to });
        if (error) throw error;
        return data as unknown as RdStats[];
      },
    }),
  };
}

/** The 12 approved KPIs for one person (graded four marked ★). */
const FU_SRC: Record<string, string> = {
  records: "from follow-up records", typed: "from typed daily numbers", mixed: "records + typed for days without records", none: "nothing due yet",
};

export function StatsGrid({ s, hideRevenue = false }: { s: RdStats; hideRevenue?: boolean }) {
  const cell = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-[1.5rem] leading-tight font-semibold tabular-nums", tone)}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {hideRevenue ? null : cell("Revenue booked", inr(s.revenue_booked), s.goal != null ? `Goal ${inr(s.goal)}` : s.goal_flag ?? "No goal")}
      {cell("★ Goal achievement", pct(s.sales_pct), `${s.points.sales} pts · A ≥85% B ≥70% C ≥55%`)}
      {cell("Bookings", int(s.bookings), s.avg_booking_value != null ? `Avg ${inr(s.avg_booking_value)}` : "Avg —")}
      {cell("★ Lead-to-booking", pct(s.l2b_pct), `${s.leads} leads · ${s.points.l2b} pts · A ≥12% B ≥10% C ≥8%`)}
      {cell("★ Connects / week", int(s.connects_per_week), `${s.points.connects} pts · A ≥400 B ≥300 C ≥200`)}
      {cell("Dials / week", int(s.dials_per_week), "Green 1,000+ · Yellow 800–999 · Red <800", s.dials_band ? BAND[s.dials_band] : undefined)}
      {cell("Follow-ups on time", pct(s.followups_pct), `${s.followups_on_time}/${s.followups_due} · ${FU_SRC[s.followups_source ?? "none"]} · target 90% · ${s.overdue_followups} overdue now`,
        s.followups_pct != null && s.followups_pct < 90 ? "text-destructive" : undefined)}
      {cell("Cancellation rate", pct(s.cancel_pct), `${inr(s.cancelled_inr)} cancelled · target under 5%`,
        s.cancel_pct != null && s.cancel_pct >= 5 ? "text-destructive" : undefined)}
      {cell("Advance collected", pct(s.advance_pct), `${inr(s.advance_inr)} · due on upcoming check-ins ${inr(s.due_balance_upcoming)}`)}
      {cell("★ Attendance", pct(s.attendance_pct), `${s.present_days}/${s.working_days} days · ${s.points.attendance} pts · reports ${s.morning_checkins} am / ${s.evening_checkins} pm`)}
      {cell("TA pipeline", int(s.ta_connects), `TA connects · ${s.ta_leads_moved} TA leads moved up`)}
      {cell("Won-deal connects", int(s.won_deal_connects))}
    </div>
  );
}

type Pacing = { yearly_goal: number | null; flag: string | null; booked: number; remaining: number | null; weeks_left: number;
  needed_per_week: number | null; booked_through: string; this_week_goal: number | null; this_week_booked: number };

export function PacingCard({ userId, year }: { userId: string; year: number }) {
  const { data: p } = useQuery({
    queryKey: ["rd-pacing", userId, year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rd_pacing", { _user: userId, _year: year });
      if (error) throw error;
      return data as unknown as Pacing;
    },
  });
  if (!p) return null;
  return (
    <section className="card-surface p-5">
      <h3 className="text-card-title font-semibold">Personal goal — calendar year {year} (Jan–Dec)</h3>
      {p.yearly_goal == null ? (
        <p className="mt-1 text-small text-warning-foreground">{p.flag ?? "Goal to be set"}</p>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <ProgressRing size="large" value={p.booked} goal={p.yearly_goal} caption="of yearly goal" label={`booked to ${p.booked_through} vs yearly goal`} />
            <p className="text-[0.875rem] font-medium tabular-nums">{inr(p.booked)} of {inr(p.yearly_goal)}</p>
            <p className="text-label text-muted-foreground">Remaining {inr(p.remaining)} · {int(p.weeks_left)} weeks left · needed per week {inr(p.needed_per_week)}</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <ProgressRing size="large" value={p.this_week_goal == null ? null : p.this_week_booked} goal={p.this_week_goal ?? 0} caption="of this week's goal" label="of this week's goal" />
            <p className="text-[0.875rem] font-medium tabular-nums">{inr(p.this_week_booked)} of {p.this_week_goal != null ? inr(p.this_week_goal) : "—"}</p>
            <p className="text-label text-muted-foreground">This week</p>
          </div>
        </div>
      )}
      {p.flag && p.yearly_goal != null ? <p className="mt-2 text-label text-muted-foreground">{p.flag}</p> : null}
      <p className="mt-2 text-label text-muted-foreground">
        Remaining = yearly goal − revenue booked (by Booked On) up to the end of last week. This week's goal = remaining ÷ weeks left including this week. Property goals on the Sales page use the Apr–Mar financial year.
      </p>
    </section>
  );
}

type Log = {
  leads_received: number; dials: number; connects: number; ta_connects: number; won_deal_connects: number;
  followups_due: number; followups_on_time: number; ta_leads_moved: number; presence: "present" | "absent" | "leave";
  morning_checkin: string | null; evening_checkin: string | null; notes: string | null;
};
const EMPTY: Log = { leads_received: 0, dials: 0, connects: 0, ta_connects: 0, won_deal_connects: 0, followups_due: 0,
  followups_on_time: 0, ta_leads_moved: 0, presence: "present", morning_checkin: null, evening_checkin: null, notes: null };
const NUM_FIELDS: Array<[keyof Log, string]> = [
  ["leads_received", "Leads received (new, unique)"], ["dials", "Dials"], ["connects", "Connects"], ["ta_connects", "TA connects"],
  ["won_deal_connects", "Won-deal connects"], ["followups_due", "Follow-ups due"], ["followups_on_time", "Follow-ups done on time"],
  ["ta_leads_moved", "TA leads moved up a stage"],
];

/** One-minute daily log. Associates: own log, today or yesterday. Head/management: anyone, any day. */
export function DailyLogForm({ userId, dates, title }: { userId: string; dates?: string[]; title?: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(dates?.[0] ?? todayIST());
  const [f, setF] = useState<Log>(EMPTY);
  const { data: existing, isFetched } = useQuery({
    queryKey: ["rd-log", userId, date],
    queryFn: async () => {
      const { data, error } = await supabase.from("rd_daily_logs").select("*").eq("user_id", userId).eq("log_date", date).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: dueToday = 0 } = useQuery({
    queryKey: ["rd-due", userId, date],
    queryFn: async () => {
      const { count, error } = await supabase.from("rd_followups").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("next_followup_date", date);
      if (error) throw error;
      return count ?? 0;
    },
  });
  useEffect(() => {
    if (!isFetched) return;
    if (existing) {
      const e = existing as unknown as Log;
      setF({ ...EMPTY, ...e, morning_checkin: e.morning_checkin?.slice(0, 5) ?? null, evening_checkin: e.evening_checkin?.slice(0, 5) ?? null });
    } else setF({ ...EMPTY, followups_due: dueToday });
  }, [existing, isFetched, dueToday]);

  const save = useMutation({
    mutationFn: async () => {
      // QA-16: send only the log's own fields (never id / created_at from the loaded row).
      const invalid = dailyLogError(f);
      if (invalid) throw new Error(invalid);
      const fields = pickFields(f as unknown as Record<string, unknown>, Object.keys(EMPTY));
      const { error } = await supabase.from("rd_daily_logs").upsert(
        { ...(fields as Partial<Log>), user_id: userId, log_date: date, morning_checkin: f.morning_checkin || null, evening_checkin: f.evening_checkin || null },
        { onConflict: "user_id,log_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily log saved");
      qc.invalidateQueries({ queryKey: ["rd-log", userId, date] });
      qc.invalidateQueries({ queryKey: ["rd-performance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-surface p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-card-title font-semibold">{title ?? "Today's log"}</h3>
        {dates ? (
          <Select value={date} onValueChange={setDate}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{dates.map((d, i) => <SelectItem key={d} value={d}>{i === 0 ? "Today" : "Yesterday"} ({d})</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {NUM_FIELDS.map(([k, label]) => (
          <label key={k} className="text-xs text-muted-foreground">{label}
            <Input type="number" min={0} inputMode="numeric" value={String(f[k] ?? 0)}
              onChange={(e) => setF({ ...f, [k]: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        ))}
        <label className="text-xs text-muted-foreground">Present
          <Select value={f.presence} onValueChange={(v) => setF({ ...f, presence: v as Log["presence"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="present">Yes</SelectItem><SelectItem value="absent">No</SelectItem><SelectItem value="leave">Leave</SelectItem></SelectContent>
          </Select>
        </label>
        <label className="text-xs text-muted-foreground">Morning report check-in
          <Input type="time" value={f.morning_checkin ?? ""} onChange={(e) => setF({ ...f, morning_checkin: e.target.value || null })} />
        </label>
        <label className="text-xs text-muted-foreground">Evening report check-in
          <Input type="time" value={f.evening_checkin ?? ""} onChange={(e) => setF({ ...f, evening_checkin: e.target.value || null })} />
        </label>
      </div>
      {f.followups_on_time > f.followups_due ? <p className="mt-2 text-xs text-destructive">Follow-ups done on time can't be more than follow-ups due.</p> : null}
      <div className="mt-3 flex justify-end">
        <ConfirmButton size="sm" doneLabel="Saved" disabled={save.isPending || f.followups_on_time > f.followups_due} onConfirm={() => save.mutateAsync()}>
          {existing ? "Update log" : "Save log"}
        </ConfirmButton>
      </div>
    </section>
  );
}

const OUTCOMES: Array<[string, string]> = [
  ["booked", "Booked"], ["nurture", "Nurture"], ["payment_awaiting", "Payment Awaiting"], ["lost", "Lost"], ["not_reachable", "Not reachable"],
];
type FollowUp = { id: string; user_id: string; client_id: string | null; next_followup_date: string; outcome: string | null; notes: string | null;
  closed_at: string | null; clients: { hotel_name: string } | null; profiles: { full_name: string } | null;
  rd_followup_contacts: { lead_name: string | null; lead_phone: string | null } | null };

/** Follow-up records. `userId` = one associate; omitted = whole team (head view, overdue only). */
export function FollowUps({ userId, canAdd }: { userId?: string; canAdd: boolean }) {
  const qc = useQueryClient();
  const today = todayIST();
  const { data = [] } = useQuery({
    queryKey: ["rd-followups", userId ?? "team"],
    queryFn: async () => {
      let q = supabase.from("rd_followups")
        .select("id, user_id, client_id, next_followup_date, outcome, notes, closed_at, clients(hotel_name), profiles!rd_followups_user_id_fkey(full_name), rd_followup_contacts(lead_name, lead_phone)")
        .is("closed_at", null).order("next_followup_date");
      if (userId) q = q.eq("user_id", userId);
      else q = q.lt("next_followup_date", today);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as FollowUp[];
    },
  });
  const { data: props = [] } = useQuery({
    queryKey: ["rd-props"],
    enabled: canAdd,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, hotel_name").eq("is_test", false).order("hotel_name");
      if (error) throw error;
      return data;
    },
  });
  const [n, setN] = useState({ name: "", phone: "", client: "", date: today, notes: "" });
  const add = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Choose an associate");
      const { error } = await supabase.rpc("create_rd_followup", { _user: userId, _client: n.client || (null as unknown as string), _date: n.date, _notes: n.notes, _name: n.name, _phone: n.phone });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Follow-up added"); setN({ name: "", phone: "", client: "", date: today, notes: "" }); qc.invalidateQueries({ queryKey: ["rd-followups"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; outcome?: string; next?: string }) => {
      const patch: { outcome?: string; next_followup_date?: string } = {};
      if (v.outcome) patch.outcome = v.outcome;
      if (v.next) patch.next_followup_date = v.next;
      const { error } = await supabase.from("rd_followups").update(patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rd-followups"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-surface p-5">
      <h3 className="text-card-title font-semibold">{userId ? "My follow-ups" : "Overdue follow-ups (team)"}</h3>
      <p className="text-label text-muted-foreground">Lead names and phones are visible only to the associate and the Reservation Desk head.</p>
      <div className="mt-2">
        <DataTable<FollowUp>
          rows={data}
          rowKey={(r) => r.id}
          emptyMessage={userId ? "No open follow-ups." : "No overdue follow-ups."}
          className="border-0 shadow-none"
          columns={[
            ...(userId ? [] : [{ key: "associate", header: "Associate", render: (r: FollowUp) => r.profiles?.full_name ?? "—" }]),
            {
              key: "lead",
              header: "Lead",
              render: (r) => (
                <>{r.rd_followup_contacts?.lead_name ?? "—"}{r.rd_followup_contacts?.lead_phone ? ` · ${r.rd_followup_contacts.lead_phone}` : ""}</>
              ),
            },
            { key: "property", header: "Property", render: (r) => r.clients?.hotel_name ?? "—" },
            {
              key: "next",
              header: "Next follow-up",
              render: (r) => {
                const overdue = r.next_followup_date < today;
                return (
                  <>
                    <Input type="date" className={cn("h-7 w-36", overdue && "border-destructive")} value={r.next_followup_date}
                      onChange={(e) => e.target.value && update.mutate({ id: r.id, next: e.target.value })} />
                    {overdue ? <span className="text-destructive">Overdue</span> : null}
                  </>
                );
              },
            },
            {
              key: "outcome",
              header: "Outcome",
              render: (r) => (
                <Select value={r.outcome ?? ""} onValueChange={(v) => update.mutate({ id: r.id, outcome: v })}>
                  <SelectTrigger className="h-7 w-40"><SelectValue placeholder="Set outcome" /></SelectTrigger>
                  <SelectContent>{OUTCOMES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              ),
            },
            { key: "notes", header: "Notes", className: "max-w-[16rem]", render: (r) => <span className="block truncate">{r.notes ?? ""}</span> },
          ]}
        />
      </div>
      {canAdd && userId ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
          <Input className="w-40" placeholder="Lead name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <Input className="w-36" placeholder="Phone" value={n.phone} onChange={(e) => setN({ ...n, phone: e.target.value })} />
          <Select value={n.client} onValueChange={(v) => setN({ ...n, client: v })}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Property" /></SelectTrigger>
            <SelectContent>{props.map((p) => <SelectItem key={p.id} value={p.id}>{p.hotel_name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" className="w-40" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} />
          <Input className="w-56" placeholder="Notes" value={n.notes} onChange={(e) => setN({ ...n, notes: e.target.value })} />
          <Button size="sm" disabled={(!n.name && !n.phone) || !n.date || add.isPending} onClick={() => add.mutate()}>Add follow-up</Button>
        </div>
      ) : null}
    </section>
  );
}

type GradeRow = { user_id: string; full_name: string; grade: string | null; total: number | null; goal_flag: string | null;
  attendance_pct: number | null; present_days: number; working_days: number; morning_checkins: number; evening_checkins: number; revenue_total: number | null };

/** HR / team scorecard view: grades and attendance only, revenue as one total. Hidden for anyone the database refuses. */
export function RdGradesTable({ from, to, label }: { from: string; to: string; label: string }) {
  const { data, isError } = useQuery({
    queryKey: ["rd-grades", from, to],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rd_grades", { _from: from, _to: to });
      if (error) throw error;
      return data as unknown as GradeRow[];
    },
  });
  if (isError || !data) return null;
  return (
    <section className="card-surface p-5">
      <h3 className="text-card-title font-semibold">Reservation Desk grades — {label}</h3>
      <p className="text-label text-muted-foreground">Sheet grade: sales achievement, lead-to-booking, connects per week and attendance, 25 points each.</p>
      <div className="mt-2">
        <DataTable<GradeRow>
          rows={data}
          rowKey={(r) => r.user_id}
          className="border-0 shadow-none"
          columns={[
            { key: "name", header: "Associate", render: (r) => r.full_name },
            { key: "grade", header: "Grade", render: (r) => <GradeBadge grade={r.grade} total={r.total} flag={r.goal_flag} /> },
            { key: "attendance", header: "Attendance", align: "right", render: (r) => pct(r.attendance_pct) },
            { key: "days", header: "Days", align: "right", render: (r) => `${r.present_days}/${r.working_days}` },
            { key: "checkins", header: "Report check-ins", align: "right", render: (r) => `${r.morning_checkins} am · ${r.evening_checkins} pm` },
            { key: "revenue", header: "Revenue booked (total)", align: "right", render: (r) => r.revenue_total == null ? "—" : currency(r.revenue_total) },
          ]}
        />
      </div>
    </section>
  );
}
