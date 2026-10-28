-- Reservation Desk performance module (Stage 3 Q30). Additive only.

-- 1. Booking ledger: meal plan + import flags (rows with problems are kept, not dropped)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS meal_plan text CHECK (meal_plan IN ('MAP','CP','EP','AP','APAI')),
  ADD COLUMN IF NOT EXISTS package_note text,
  ADD COLUMN IF NOT EXISTS import_flags text[] NOT NULL DEFAULT '{}';

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.is_rd_associate(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pipeline_members pm JOIN public.pipelines p ON p.id = pm.pipeline_id
                 WHERE pm.user_id = _uid AND pm.active AND pm.role <> 'head' AND p.code = 'reservations_desk')
$$;
CREATE OR REPLACE FUNCTION public.can_manage_rd(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager(_uid) OR public.is_res_desk_head(_uid)
$$;
CREATE OR REPLACE FUNCTION public.rd_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

-- 3. Daily activity log
CREATE TABLE IF NOT EXISTS public.rd_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  log_date date NOT NULL,
  leads_received int NOT NULL DEFAULT 0 CHECK (leads_received >= 0),
  dials int NOT NULL DEFAULT 0 CHECK (dials >= 0),
  connects int NOT NULL DEFAULT 0 CHECK (connects >= 0),
  ta_connects int NOT NULL DEFAULT 0 CHECK (ta_connects >= 0),
  won_deal_connects int NOT NULL DEFAULT 0 CHECK (won_deal_connects >= 0),
  followups_due int NOT NULL DEFAULT 0 CHECK (followups_due >= 0),
  followups_on_time int NOT NULL DEFAULT 0 CHECK (followups_on_time >= 0),
  ta_leads_moved int NOT NULL DEFAULT 0 CHECK (ta_leads_moved >= 0),
  presence text NOT NULL DEFAULT 'present' CHECK (presence IN ('present','absent','leave')),
  morning_checkin time,
  evening_checkin time,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, log_date),
  CHECK (followups_on_time <= followups_due)
);
GRANT SELECT, INSERT, UPDATE ON public.rd_daily_logs TO authenticated;
GRANT ALL ON public.rd_daily_logs TO service_role;
ALTER TABLE public.rd_daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or head reads logs" ON public.rd_daily_logs;
CREATE POLICY "Own or head reads logs" ON public.rd_daily_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Own or head writes logs" ON public.rd_daily_logs;
CREATE POLICY "Own or head writes logs" ON public.rd_daily_logs FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND public.is_rd_associate(auth.uid())) OR public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Own or head updates logs" ON public.rd_daily_logs;
CREATE POLICY "Own or head updates logs" ON public.rd_daily_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));

-- Associates may only write their own log for today or yesterday (IST); head/management any day.
CREATE OR REPLACE FUNCTION public.rd_log_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t date := public.rd_today();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_rd(auth.uid()) THEN
    IF NEW.user_id <> auth.uid() THEN RAISE EXCEPTION 'You can only fill in your own daily log'; END IF;
    IF NEW.log_date NOT IN (t, t - 1) THEN RAISE EXCEPTION 'Daily logs can be entered or changed only on the same day or the next day. Ask the Reservation Desk head to correct older days.'; END IF;
    IF TG_OP = 'UPDATE' AND (OLD.user_id <> auth.uid() OR OLD.log_date NOT IN (t, t - 1)) THEN
      RAISE EXCEPTION 'Daily logs can be entered or changed only on the same day or the next day. Ask the Reservation Desk head to correct older days.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'A log cannot be moved to another person'; END IF;
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rd_log_guard ON public.rd_daily_logs;
CREATE TRIGGER rd_log_guard BEFORE INSERT OR UPDATE ON public.rd_daily_logs FOR EACH ROW EXECUTE FUNCTION public.rd_log_guard();

-- 4. Follow-ups as records; lead identity kept in a separate restricted table (like booking guest contacts)
CREATE TABLE IF NOT EXISTS public.rd_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clients(id),
  next_followup_date date NOT NULL,
  outcome text CHECK (outcome IN ('booked','nurture','payment_awaiting','lost','not_reachable')),
  notes text,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rd_followups_user_next ON public.rd_followups (user_id, next_followup_date) WHERE closed_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.rd_followups TO authenticated;
GRANT ALL ON public.rd_followups TO service_role;
ALTER TABLE public.rd_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or head reads follow-ups" ON public.rd_followups;
CREATE POLICY "Own or head reads follow-ups" ON public.rd_followups FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Own or head adds follow-ups" ON public.rd_followups;
CREATE POLICY "Own or head adds follow-ups" ON public.rd_followups FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND public.is_rd_associate(auth.uid())) OR public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Own or head updates follow-ups" ON public.rd_followups;
CREATE POLICY "Own or head updates follow-ups" ON public.rd_followups FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));

CREATE OR REPLACE FUNCTION public.rd_followup_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id AND NOT public.can_manage_rd(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Reservation Desk head can hand a follow-up to someone else';
  END IF;
  NEW.closed_at := CASE WHEN NEW.outcome IN ('booked','lost') THEN coalesce(NEW.closed_at, now()) ELSE NULL END;
  NEW.created_by := coalesce(NEW.created_by, auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rd_followup_touch ON public.rd_followups;
CREATE TRIGGER rd_followup_touch BEFORE INSERT OR UPDATE ON public.rd_followups FOR EACH ROW EXECUTE FUNCTION public.rd_followup_touch();

CREATE TABLE IF NOT EXISTS public.rd_followup_contacts (
  followup_id uuid PRIMARY KEY REFERENCES public.rd_followups(id),
  lead_name text,
  lead_phone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rd_followup_contacts TO authenticated;
GRANT ALL ON public.rd_followup_contacts TO service_role;
ALTER TABLE public.rd_followup_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Follow-up owner or head reads lead" ON public.rd_followup_contacts;
CREATE POLICY "Follow-up owner or head reads lead" ON public.rd_followup_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rd_followups f WHERE f.id = followup_id AND (f.user_id = auth.uid() OR public.can_manage_rd(auth.uid()))));
DROP POLICY IF EXISTS "Follow-up owner or head writes lead" ON public.rd_followup_contacts;
CREATE POLICY "Follow-up owner or head writes lead" ON public.rd_followup_contacts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.rd_followups f WHERE f.id = followup_id AND (f.user_id = auth.uid() OR public.can_manage_rd(auth.uid()))));
DROP POLICY IF EXISTS "Follow-up owner or head updates lead" ON public.rd_followup_contacts;
CREATE POLICY "Follow-up owner or head updates lead" ON public.rd_followup_contacts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rd_followups f WHERE f.id = followup_id AND (f.user_id = auth.uid() OR public.can_manage_rd(auth.uid()))));

-- 5. Person goals (calendar year) and week overrides
CREATE TABLE IF NOT EXISTS public.rd_person_goals (
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  year int NOT NULL,
  yearly_goal_inr numeric CHECK (yearly_goal_inr >= 0),
  starts_on date,
  flag text,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year)
);
GRANT SELECT, INSERT, UPDATE ON public.rd_person_goals TO authenticated;
GRANT ALL ON public.rd_person_goals TO service_role;
ALTER TABLE public.rd_person_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or head reads person goals" ON public.rd_person_goals;
CREATE POLICY "Own or head reads person goals" ON public.rd_person_goals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Head writes person goals" ON public.rd_person_goals;
CREATE POLICY "Head writes person goals" ON public.rd_person_goals FOR INSERT TO authenticated WITH CHECK (public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Head updates person goals" ON public.rd_person_goals;
CREATE POLICY "Head updates person goals" ON public.rd_person_goals FOR UPDATE TO authenticated
  USING (public.can_manage_rd(auth.uid())) WITH CHECK (public.can_manage_rd(auth.uid()));

CREATE TABLE IF NOT EXISTS public.rd_week_goal_overrides (
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  goal_inr numeric NOT NULL CHECK (goal_inr >= 0),
  set_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);
GRANT SELECT, INSERT, UPDATE ON public.rd_week_goal_overrides TO authenticated;
GRANT ALL ON public.rd_week_goal_overrides TO service_role;
ALTER TABLE public.rd_week_goal_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or head reads week goals" ON public.rd_week_goal_overrides;
CREATE POLICY "Own or head reads week goals" ON public.rd_week_goal_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Head writes week goals" ON public.rd_week_goal_overrides;
CREATE POLICY "Head writes week goals" ON public.rd_week_goal_overrides FOR INSERT TO authenticated WITH CHECK (public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Head updates week goals" ON public.rd_week_goal_overrides;
CREATE POLICY "Head updates week goals" ON public.rd_week_goal_overrides FOR UPDATE TO authenticated
  USING (public.can_manage_rd(auth.uid())) WITH CHECK (public.can_manage_rd(auth.uid()));

-- 6. Head inputs: call handling (typed/imported until the IVR integration) and checkout billing
CREATE TABLE IF NOT EXISTS public.rd_call_handling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  slot text NOT NULL,
  inbound_calls int NOT NULL DEFAULT 0 CHECK (inbound_calls >= 0),
  answered int NOT NULL DEFAULT 0 CHECK (answered >= 0),
  missed int NOT NULL DEFAULT 0 CHECK (missed >= 0),
  unworked_leads int NOT NULL DEFAULT 0 CHECK (unworked_leads >= 0),
  source text NOT NULL DEFAULT 'typed',
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, slot)
);
GRANT SELECT, INSERT, UPDATE ON public.rd_call_handling TO authenticated;
GRANT ALL ON public.rd_call_handling TO service_role;
ALTER TABLE public.rd_call_handling ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Head manages call handling" ON public.rd_call_handling;
CREATE POLICY "Head manages call handling" ON public.rd_call_handling FOR ALL TO authenticated
  USING (public.can_manage_rd(auth.uid())) WITH CHECK (public.can_manage_rd(auth.uid()));

CREATE TABLE IF NOT EXISTS public.rd_property_billing (
  client_id uuid NOT NULL REFERENCES public.clients(id),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  direct_billed_inr numeric CHECK (direct_billed_inr >= 0),
  ota_billed_inr numeric CHECK (ota_billed_inr >= 0),
  source text NOT NULL DEFAULT 'typed',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month)
);
GRANT SELECT, INSERT, UPDATE ON public.rd_property_billing TO authenticated;
GRANT ALL ON public.rd_property_billing TO service_role;
ALTER TABLE public.rd_property_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Head and finance read billing" ON public.rd_property_billing;
CREATE POLICY "Head and finance read billing" ON public.rd_property_billing FOR SELECT TO authenticated
  USING (public.can_manage_rd(auth.uid()) OR public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Head writes billing" ON public.rd_property_billing;
CREATE POLICY "Head writes billing" ON public.rd_property_billing FOR INSERT TO authenticated WITH CHECK (public.can_manage_rd(auth.uid()));
DROP POLICY IF EXISTS "Head updates billing" ON public.rd_property_billing;
CREATE POLICY "Head updates billing" ON public.rd_property_billing FOR UPDATE TO authenticated
  USING (public.can_manage_rd(auth.uid())) WITH CHECK (public.can_manage_rd(auth.uid()));

-- 7. Grading (the personal sheet's rules)
CREATE OR REPLACE FUNCTION public.rd_grade_points(_kpi text, _v numeric) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _v IS NULL THEN 10
    WHEN _kpi = 'sales'      THEN CASE WHEN _v >= 85 THEN 25 WHEN _v >= 70 THEN 20 WHEN _v >= 55 THEN 15 ELSE 10 END
    WHEN _kpi = 'l2b'        THEN CASE WHEN _v >= 12 THEN 25 WHEN _v >= 10 THEN 20 WHEN _v >= 8 THEN 15 ELSE 10 END
    WHEN _kpi = 'connects'   THEN CASE WHEN _v >= 400 THEN 25 WHEN _v >= 300 THEN 20 WHEN _v >= 200 THEN 15 ELSE 10 END
    WHEN _kpi = 'attendance' THEN CASE WHEN _v >= 90 THEN 25 WHEN _v >= 75 THEN 20 WHEN _v >= 50 THEN 15 ELSE 10 END
  END
$$;
CREATE OR REPLACE FUNCTION public.rd_grade_label(_total int) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _total IS NULL THEN NULL WHEN _total >= 96 THEN 'A+' WHEN _total >= 86 THEN 'A'
              WHEN _total >= 71 THEN 'B' WHEN _total >= 51 THEN 'C' ELSE 'D' END
$$;
CREATE OR REPLACE FUNCTION public.rd_dials_band(_dials_per_week numeric) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _dials_per_week IS NULL THEN NULL WHEN _dials_per_week >= 1000 THEN 'green' WHEN _dials_per_week >= 800 THEN 'yellow' ELSE 'red' END
$$;

-- Weeks are Monday-start; a week belongs to the year/quarter its Thursday falls in.
CREATE OR REPLACE FUNCTION public.rd_booked(_uid uuid, _from date, _to date) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(b.deal_inr), 0) FROM public.bookings b
   WHERE b.sales_person_id = _uid AND b.status = 'BOOKED' AND b.voided_at IS NULL AND NOT b.is_demo
     AND b.booked_on >= _from AND b.booked_on < _to
$$;

-- Weekly goal = remaining yearly goal at the start of the week's quarter ÷ weeks left in the year; head override wins.
CREATE OR REPLACE FUNCTION public.rd_week_goal(_uid uuid, _week date) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wk date := date_trunc('week', _week)::date; y int; g record; qs date; ys date; ye date; st date; wl int; ov numeric;
BEGIN
  SELECT goal_inr INTO ov FROM public.rd_week_goal_overrides WHERE user_id = _uid AND week_start = wk;
  IF ov IS NOT NULL THEN RETURN ov; END IF;
  y := extract(year FROM wk + 3)::int;
  SELECT * INTO g FROM public.rd_person_goals WHERE user_id = _uid AND year = y;
  IF g IS NULL OR g.yearly_goal_inr IS NULL THEN RETURN NULL; END IF;
  ys := date_trunc('week', make_date(y, 1, 4))::date;            -- first week of the year
  ye := date_trunc('week', make_date(y, 12, 28))::date;          -- last week of the year
  qs := date_trunc('week', date_trunc('quarter', wk + 3)::date + 3)::date;   -- first week of that quarter
  st := greatest(qs, coalesce(date_trunc('week', g.starts_on)::date, ys));
  IF wk < st THEN RETURN 0; END IF;
  wl := ((ye - st) / 7) + 1;
  RETURN round(greatest(g.yearly_goal_inr - public.rd_booked(_uid, ys, st), 0) / greatest(wl, 1));
END $$;

-- All associate KPIs + grade for one person and period [_from, _to)
CREATE OR REPLACE FUNCTION public._rd_stats(_uid uuid, _from date, _to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t date := public.rd_today(); weeks int; goal numeric; gflag text; l record; b record; rev numeric;
  sales_pct numeric; l2b numeric; cpw numeric; att numeric; ps int; pl int; pc int; pa int; tot int;
BEGIN
  SELECT count(*), sum(public.rd_week_goal(_uid, m::date))
    INTO weeks, goal
    FROM generate_series(date_trunc('week', _from)::date, _to - 1, interval '7 day') m
   WHERE (m::date + 3) >= _from AND (m::date + 3) < _to;
  -- whole year asked for → the yearly goal itself
  IF _from = make_date(extract(year FROM _from)::int, 1, 1) AND _to = make_date(extract(year FROM _from)::int + 1, 1, 1) THEN
    SELECT yearly_goal_inr INTO goal FROM public.rd_person_goals WHERE user_id = _uid AND year = extract(year FROM _from)::int;
  END IF;
  SELECT flag INTO gflag FROM public.rd_person_goals WHERE user_id = _uid AND year = extract(year FROM _from)::int;
  -- weeks elapsed so far (for per-week averages)
  SELECT greatest(count(*), 1) INTO weeks
    FROM generate_series(date_trunc('week', _from)::date, least(_to - 1, t), interval '7 day') m
   WHERE (m::date + 3) >= _from AND m::date <= t;

  SELECT coalesce(sum(leads_received),0) leads, coalesce(sum(dials),0) dials, coalesce(sum(connects),0) connects,
         coalesce(sum(ta_connects),0) ta, coalesce(sum(won_deal_connects),0) won, coalesce(sum(ta_leads_moved),0) ta_moved,
         coalesce(sum(followups_due),0) fdue, coalesce(sum(followups_on_time),0) fon,
         count(*) working, count(*) FILTER (WHERE presence = 'present') present,
         count(morning_checkin) FILTER (WHERE presence = 'present') morning, count(evening_checkin) FILTER (WHERE presence = 'present') evening
    INTO l FROM public.rd_daily_logs WHERE user_id = _uid AND log_date >= _from AND log_date < _to;

  SELECT coalesce(sum(deal_inr) FILTER (WHERE status = 'BOOKED'),0) booked,
         count(*) FILTER (WHERE status = 'BOOKED') n,
         coalesce(sum(deal_inr) FILTER (WHERE status = 'CANCELLED'),0) cancelled,
         coalesce(sum(advance_inr) FILTER (WHERE status = 'BOOKED'),0) adv
    INTO b FROM public.bookings
   WHERE sales_person_id = _uid AND voided_at IS NULL AND NOT is_demo AND booked_on >= _from AND booked_on < _to;
  rev := b.booked;

  sales_pct := CASE WHEN goal > 0 THEN round(rev / goal * 100, 1) END;
  l2b := CASE WHEN l.leads > 0 THEN round(b.n::numeric / l.leads * 100, 1) END;
  cpw := round(l.connects::numeric / weeks, 0);
  att := CASE WHEN l.working > 0 THEN round(l.present::numeric / l.working * 100, 1) END;
  ps := public.rd_grade_points('sales', sales_pct); pl := public.rd_grade_points('l2b', l2b);
  pc := public.rd_grade_points('connects', cpw);   pa := public.rd_grade_points('attendance', att);
  tot := CASE WHEN goal IS NULL THEN NULL ELSE ps + pl + pc + pa END;

  RETURN jsonb_build_object(
    'revenue_booked', rev, 'goal', goal, 'goal_flag', gflag, 'sales_pct', sales_pct,
    'bookings', b.n, 'avg_booking_value', CASE WHEN b.n > 0 THEN round(rev / b.n) END,
    'leads', l.leads, 'l2b_pct', l2b,
    'dials', l.dials, 'dials_per_week', round(l.dials::numeric / weeks, 0), 'dials_band', public.rd_dials_band(round(l.dials::numeric / weeks, 0)),
    'connects', l.connects, 'connects_per_week', cpw, 'weeks', weeks,
    'followups_due', l.fdue, 'followups_on_time', l.fon,
    'followups_pct', CASE WHEN l.fdue > 0 THEN round(l.fon::numeric / l.fdue * 100, 1) END,
    'overdue_followups', (SELECT count(*) FROM public.rd_followups f WHERE f.user_id = _uid AND f.closed_at IS NULL AND f.next_followup_date < t),
    'cancelled_inr', b.cancelled,
    'cancel_pct', CASE WHEN rev + b.cancelled > 0 THEN round(b.cancelled / (rev + b.cancelled) * 100, 1) END,
    'advance_inr', b.adv, 'advance_pct', CASE WHEN rev > 0 THEN round(b.adv / rev * 100, 1) END,
    'due_balance_upcoming', (SELECT coalesce(sum(due_balance_inr),0) FROM public.bookings
                              WHERE sales_person_id = _uid AND status = 'BOOKED' AND voided_at IS NULL AND NOT is_demo AND check_in >= t),
    'working_days', l.working, 'present_days', l.present, 'attendance_pct', att,
    'morning_checkins', l.morning, 'evening_checkins', l.evening,
    'ta_connects', l.ta, 'ta_leads_moved', l.ta_moved, 'won_deal_connects', l.won,
    'points', jsonb_build_object('sales', ps, 'l2b', pl, 'connects', pc, 'attendance', pa),
    'total', tot, 'grade', public.rd_grade_label(tot));
END $$;

CREATE OR REPLACE FUNCTION public.rd_associates() RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.id, p.full_name FROM public.pipeline_members pm
    JOIN public.pipelines pl ON pl.id = pm.pipeline_id JOIN public.profiles p ON p.id = pm.user_id
   WHERE pl.code = 'reservations_desk' AND pm.active AND pm.role <> 'head' AND p.status = 'active'
$$;

-- Associates: their own row only. Head/management: everyone (or one person).
CREATE OR REPLACE FUNCTION public.rd_performance(_from date, _to date, _user uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT public.can_manage_rd(auth.uid()) THEN
    IF _user IS DISTINCT FROM auth.uid() OR NOT public.is_rd_associate(auth.uid()) THEN
      RAISE EXCEPTION 'You can only see your own performance';
    END IF;
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'full_name', a.full_name)
                                   || public._rd_stats(a.user_id, _from, _to) ORDER BY a.full_name), '[]'::jsonb)
            FROM public.rd_associates() a WHERE _user IS NULL OR a.user_id = _user);
END $$;

-- HR and team scorecard: grade, attendance and a revenue total only — no guest data or booking detail.
CREATE OR REPLACE FUNCTION public.rd_grades(_from date, _to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.can_manage_rd(auth.uid()) OR public.has_role(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'HR, the Reservation Desk head and management only';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'user_id', a.user_id, 'full_name', a.full_name,
            'grade', s->>'grade', 'total', (s->>'total')::int, 'goal_flag', s->>'goal_flag',
            'attendance_pct', (s->>'attendance_pct')::numeric, 'present_days', (s->>'present_days')::int,
            'working_days', (s->>'working_days')::int, 'morning_checkins', (s->>'morning_checkins')::int,
            'evening_checkins', (s->>'evening_checkins')::int, 'revenue_total', (s->>'revenue_booked')::numeric)
            ORDER BY a.full_name), '[]'::jsonb)
          FROM public.rd_associates() a, LATERAL public._rd_stats(a.user_id, _from, _to) s);
END $$;

-- Pacing card: remaining, weeks left, needed per week
CREATE OR REPLACE FUNCTION public.rd_pacing(_user uuid, _year int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; t date := public.rd_today(); ys date; ye date; wk date; booked numeric; wl int;
BEGIN
  IF NOT (_user = auth.uid() OR public.can_manage_rd(auth.uid())) THEN RAISE EXCEPTION 'You can only see your own goal'; END IF;
  SELECT * INTO g FROM public.rd_person_goals WHERE user_id = _user AND year = _year;
  ys := date_trunc('week', make_date(_year, 1, 4))::date; ye := date_trunc('week', make_date(_year, 12, 28))::date;
  wk := least(greatest(date_trunc('week', t)::date, ys), ye + 7);
  booked := public.rd_booked(_user, ys, ye + 7);
  wl := greatest(((ye - wk) / 7) + 1, 0);
  RETURN jsonb_build_object('year', _year, 'yearly_goal', g.yearly_goal_inr, 'flag', g.flag, 'starts_on', g.starts_on,
    'booked', booked, 'remaining', CASE WHEN g.yearly_goal_inr IS NOT NULL THEN greatest(g.yearly_goal_inr - booked, 0) END,
    'weeks_left', wl,
    'needed_per_week', CASE WHEN g.yearly_goal_inr IS NOT NULL AND wl > 0 THEN round(greatest(g.yearly_goal_inr - booked, 0) / wl) END,
    'this_week_goal', public.rd_week_goal(_user, wk),
    'this_week_booked', public.rd_booked(_user, wk, wk + 7));
END $$;

-- Head: property × month revenue (booked basis, stay month, Apr–Mar FY) vs property goals + billed where recorded
CREATE OR REPLACE FUNCTION public.rd_property_months(_fy int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.can_manage_rd(auth.uid()) OR public.can_manage_finance(auth.uid())) THEN
    RAISE EXCEPTION 'Reservation Desk head, finance and management only';
  END IF;
  RETURN (
    WITH months AS (SELECT (make_date(_fy, 4, 1) + (i || ' month')::interval)::date m, i + 1 AS mno FROM generate_series(0, 11) i),
    props AS (SELECT DISTINCT b.client_id FROM public.bookings b WHERE b.voided_at IS NULL AND NOT b.is_demo
                AND b.stay_month >= make_date(_fy, 4, 1) AND b.stay_month < make_date(_fy + 1, 4, 1)
              UNION SELECT subject_key::uuid FROM public.sales_goals WHERE scope = 'property' AND fy = _fy)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'client_id', c.id, 'hotel_name', c.hotel_name, 'client_code', c.client_code,
      'months', (SELECT jsonb_agg(jsonb_build_object(
          'month', mo.m,
          'booked', (SELECT coalesce(sum(deal_inr),0) FROM public.bookings b WHERE b.client_id = c.id AND b.status = 'BOOKED'
                       AND b.voided_at IS NULL AND NOT b.is_demo AND b.stay_month = mo.m),
          'goal', coalesce((SELECT goal_inr FROM public.sales_goals WHERE scope = 'property' AND subject_key = c.id::text AND fy = _fy AND month_no = mo.mno),
                           (SELECT round(goal_inr / 12) FROM public.sales_goals WHERE scope = 'property' AND subject_key = c.id::text AND fy = _fy AND month_no = 0)),
          'direct_billed', (SELECT direct_billed_inr FROM public.rd_property_billing pb WHERE pb.client_id = c.id AND pb.month = mo.m),
          'ota_billed', (SELECT ota_billed_inr FROM public.rd_property_billing pb WHERE pb.client_id = c.id AND pb.month = mo.m))
          ORDER BY mo.m) FROM months mo)) ORDER BY c.hotel_name), '[]'::jsonb)
    FROM props p JOIN public.clients c ON c.id = p.client_id
    WHERE NOT c.is_test);
END $$;

REVOKE ALL ON FUNCTION public.is_rd_associate(uuid), public.can_manage_rd(uuid), public.rd_booked(uuid, date, date),
  public.rd_week_goal(uuid, date), public._rd_stats(uuid, date, date), public.rd_associates(),
  public.rd_performance(date, date, uuid), public.rd_grades(date, date), public.rd_pacing(uuid, int),
  public.rd_property_months(int), public.rd_log_guard(), public.rd_today(),
  public.rd_grade_points(text, numeric), public.rd_grade_label(int), public.rd_dials_band(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_rd_associate(uuid), public.can_manage_rd(uuid), public.rd_today(),
  public.rd_grade_points(text, numeric), public.rd_grade_label(int), public.rd_dials_band(numeric),
  public.rd_performance(date, date, uuid), public.rd_grades(date, date), public.rd_pacing(uuid, int),
  public.rd_property_months(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rd_booked(uuid, date, date), public.rd_week_goal(uuid, date), public._rd_stats(uuid, date, date),
  public.rd_associates() TO service_role;