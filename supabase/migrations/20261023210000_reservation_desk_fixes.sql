-- Reservation Desk fixes: follow-up on-time from records, checkout billing entry, pacing to end of previous week. Additive only.

-- 1. Follow-up actions: one row per (follow-up, due date), written only by trigger
CREATE TABLE IF NOT EXISTS public.rd_followup_actions (
  followup_id uuid NOT NULL REFERENCES public.rd_followups(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  due_date date NOT NULL,
  actioned_on date NOT NULL,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (followup_id, due_date)
);
CREATE INDEX IF NOT EXISTS rd_followup_actions_user_due ON public.rd_followup_actions (user_id, due_date);
GRANT SELECT ON public.rd_followup_actions TO authenticated;
GRANT ALL ON public.rd_followup_actions TO service_role;
ALTER TABLE public.rd_followup_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or head reads follow-up actions" ON public.rd_followup_actions;
CREATE POLICY "Own or head reads follow-up actions" ON public.rd_followup_actions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_rd(auth.uid()));

CREATE OR REPLACE FUNCTION public.rd_followup_log_action() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.closed_at IS NULL AND (NEW.outcome IS DISTINCT FROM OLD.outcome
      OR NEW.next_followup_date IS DISTINCT FROM OLD.next_followup_date
      OR NEW.notes IS DISTINCT FROM OLD.notes) THEN
    INSERT INTO public.rd_followup_actions (followup_id, user_id, due_date, actioned_on, outcome)
    VALUES (OLD.id, OLD.user_id, OLD.next_followup_date, public.rd_today(), NEW.outcome)
    ON CONFLICT (followup_id, due_date) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rd_followup_log_action() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS rd_followup_log_action ON public.rd_followups;
CREATE TRIGGER rd_followup_log_action AFTER UPDATE ON public.rd_followups FOR EACH ROW EXECUTE FUNCTION public.rd_followup_log_action();

-- 2. Checkout billing: notes + finance may enter it too
ALTER TABLE public.rd_property_billing ADD COLUMN IF NOT EXISTS notes text;
DROP POLICY IF EXISTS "Head writes billing" ON public.rd_property_billing;
CREATE POLICY "Head writes billing" ON public.rd_property_billing FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_rd(auth.uid()) OR public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Head updates billing" ON public.rd_property_billing;
CREATE POLICY "Head updates billing" ON public.rd_property_billing FOR UPDATE TO authenticated
  USING (public.can_manage_rd(auth.uid()) OR public.can_manage_finance(auth.uid()))
  WITH CHECK (public.can_manage_rd(auth.uid()) OR public.can_manage_finance(auth.uid()));
CREATE OR REPLACE FUNCTION public.rd_billing_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS rd_billing_touch ON public.rd_property_billing;
CREATE TRIGGER rd_billing_touch BEFORE INSERT OR UPDATE ON public.rd_property_billing FOR EACH ROW EXECUTE FUNCTION public.rd_billing_touch();

-- 3. Weekly goal = (yearly goal − booked up to the end of the previous week) ÷ weeks left including this week; head override wins
CREATE OR REPLACE FUNCTION public.rd_week_goal(_uid uuid, _week date) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wk date := date_trunc('week', _week)::date; y int; g record; ys date; ye date; st date; wl int; ov numeric;
BEGIN
  SELECT goal_inr INTO ov FROM public.rd_week_goal_overrides WHERE user_id = _uid AND week_start = wk;
  IF ov IS NOT NULL THEN RETURN ov; END IF;
  y := extract(year FROM wk + 3)::int;
  SELECT * INTO g FROM public.rd_person_goals WHERE user_id = _uid AND year = y;
  IF g IS NULL OR g.yearly_goal_inr IS NULL THEN RETURN NULL; END IF;
  ys := date_trunc('week', make_date(y, 1, 4))::date;
  ye := date_trunc('week', make_date(y, 12, 28))::date;
  st := coalesce(date_trunc('week', g.starts_on)::date, ys);
  IF wk < st THEN RETURN 0; END IF;
  wl := ((ye - wk) / 7) + 1;
  RETURN round(greatest(g.yearly_goal_inr - public.rd_booked(_uid, ys, wk), 0) / greatest(wl, 1));
END $$;

CREATE OR REPLACE FUNCTION public.rd_pacing(_user uuid, _year int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; t date := public.rd_today(); ys date; ye date; wk date; booked numeric; wl int;
BEGIN
  IF NOT (_user = auth.uid() OR public.can_manage_rd(auth.uid())) THEN RAISE EXCEPTION 'You can only see your own goal'; END IF;
  SELECT * INTO g FROM public.rd_person_goals WHERE user_id = _user AND year = _year;
  ys := date_trunc('week', make_date(_year, 1, 4))::date; ye := date_trunc('week', make_date(_year, 12, 28))::date;
  wk := least(greatest(date_trunc('week', t)::date, ys), ye + 7);
  booked := public.rd_booked(_user, ys, wk);             -- up to the end of the previous week, by Booked On
  wl := greatest(((ye - wk) / 7) + 1, 0);                -- weeks left including this one
  RETURN jsonb_build_object('year', _year, 'yearly_goal', g.yearly_goal_inr, 'flag', g.flag, 'starts_on', g.starts_on,
    'booked', booked, 'booked_through', wk - 1,
    'remaining', CASE WHEN g.yearly_goal_inr IS NOT NULL THEN greatest(g.yearly_goal_inr - booked, 0) END,
    'weeks_left', wl,
    'needed_per_week', CASE WHEN g.yearly_goal_inr IS NOT NULL AND wl > 0 THEN round(greatest(g.yearly_goal_inr - booked, 0) / wl) END,
    'this_week_goal', CASE WHEN wl > 0 THEN public.rd_week_goal(_user, wk) END,
    'this_week_booked', public.rd_booked(_user, wk, least(wk + 7, t + 1)));
END $$;

-- 4. Stats: follow-ups on time from records, typed numbers only for days without records
CREATE OR REPLACE FUNCTION public._rd_stats(_uid uuid, _from date, _to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t date := public.rd_today(); weeks int; goal numeric; gflag text; l record; b record; rev numeric;
  sales_pct numeric; l2b numeric; cpw numeric; att numeric; ps int; pl int; pc int; pa int; tot int;
  fr_due int; fr_on int; fr_days date[]; ft_due int; ft_on int; ft_days int; fdue int; fon int; fsrc text;
BEGIN
  SELECT count(*), sum(public.rd_week_goal(_uid, m::date))
    INTO weeks, goal
    FROM generate_series(date_trunc('week', _from)::date, _to - 1, interval '7 day') m
   WHERE (m::date + 3) >= _from AND (m::date + 3) < _to;
  IF _from = make_date(extract(year FROM _from)::int, 1, 1) AND _to = make_date(extract(year FROM _from)::int + 1, 1, 1) THEN
    SELECT yearly_goal_inr INTO goal FROM public.rd_person_goals WHERE user_id = _uid AND year = extract(year FROM _from)::int;
  END IF;
  SELECT flag INTO gflag FROM public.rd_person_goals WHERE user_id = _uid AND year = extract(year FROM _from)::int;
  SELECT greatest(count(*), 1) INTO weeks
    FROM generate_series(date_trunc('week', _from)::date, least(_to - 1, t), interval '7 day') m
   WHERE (m::date + 3) >= _from AND m::date <= t;

  SELECT coalesce(sum(leads_received),0) leads, coalesce(sum(dials),0) dials, coalesce(sum(connects),0) connects,
         coalesce(sum(ta_connects),0) ta, coalesce(sum(won_deal_connects),0) won, coalesce(sum(ta_leads_moved),0) ta_moved,
         count(*) working, count(*) FILTER (WHERE presence = 'present') present,
         count(morning_checkin) FILTER (WHERE presence = 'present') morning, count(evening_checkin) FILTER (WHERE presence = 'present') evening
    INTO l FROM public.rd_daily_logs WHERE user_id = _uid AND log_date >= _from AND log_date < _to;

  -- Records: every due date that was actioned (on time = actioned on/before it), plus open follow-ups past due with no action
  WITH rec AS (
    SELECT a.due_date d, a.actioned_on <= a.due_date ok FROM public.rd_followup_actions a
     WHERE a.user_id = _uid AND a.due_date >= _from AND a.due_date < _to
    UNION ALL
    SELECT f.next_followup_date, false FROM public.rd_followups f
     WHERE f.user_id = _uid AND f.closed_at IS NULL AND f.next_followup_date >= _from AND f.next_followup_date < least(_to, t))
  SELECT count(*), count(*) FILTER (WHERE ok), coalesce(array_agg(DISTINCT d), '{}') INTO fr_due, fr_on, fr_days FROM rec;
  SELECT coalesce(sum(followups_due),0), coalesce(sum(followups_on_time),0), count(*) FILTER (WHERE followups_due > 0)
    INTO ft_due, ft_on, ft_days
    FROM public.rd_daily_logs WHERE user_id = _uid AND log_date >= _from AND log_date < _to AND NOT (log_date = ANY (fr_days));
  fdue := fr_due + ft_due; fon := fr_on + ft_on;
  fsrc := CASE WHEN fr_due > 0 AND ft_days > 0 THEN 'mixed' WHEN fr_due > 0 THEN 'records' WHEN ft_days > 0 THEN 'typed' END;

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
    'followups_due', fdue, 'followups_on_time', fon,
    'followups_pct', CASE WHEN fdue > 0 THEN round(fon::numeric / fdue * 100, 1) END,
    'followups_source', fsrc, 'followups_from_records', fr_due, 'followups_typed', ft_due,
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

-- 5. Property months: include billing notes
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
              UNION SELECT subject_key::uuid FROM public.sales_goals WHERE scope = 'property' AND fy = _fy
              UNION SELECT pb.client_id FROM public.rd_property_billing pb WHERE pb.month >= make_date(_fy, 4, 1) AND pb.month < make_date(_fy + 1, 4, 1))
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'client_id', c.id, 'hotel_name', c.hotel_name, 'client_code', c.client_code,
      'months', (SELECT jsonb_agg(jsonb_build_object(
          'month', mo.m,
          'booked', (SELECT coalesce(sum(deal_inr),0) FROM public.bookings b WHERE b.client_id = c.id AND b.status = 'BOOKED'
                       AND b.voided_at IS NULL AND NOT b.is_demo AND b.stay_month = mo.m),
          'goal', coalesce((SELECT goal_inr FROM public.sales_goals WHERE scope = 'property' AND subject_key = c.id::text AND fy = _fy AND month_no = mo.mno),
                           (SELECT round(goal_inr / 12) FROM public.sales_goals WHERE scope = 'property' AND subject_key = c.id::text AND fy = _fy AND month_no = 0)),
          'direct_billed', (SELECT direct_billed_inr FROM public.rd_property_billing pb WHERE pb.client_id = c.id AND pb.month = mo.m),
          'ota_billed', (SELECT ota_billed_inr FROM public.rd_property_billing pb WHERE pb.client_id = c.id AND pb.month = mo.m),
          'billing_notes', (SELECT notes FROM public.rd_property_billing pb WHERE pb.client_id = c.id AND pb.month = mo.m))
          ORDER BY mo.m) FROM months mo)) ORDER BY c.hotel_name), '[]'::jsonb)
    FROM props p JOIN public.clients c ON c.id = p.client_id
    WHERE NOT c.is_test);
END $$;
