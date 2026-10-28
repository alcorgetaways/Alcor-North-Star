-- Stage 3: third-party costs term, bookings ledger + goals, commission due, invoices,
-- annual fee revision, demo markers, held outbox rows. Additive and rerunnable.

-- ---------- Third-party costs ----------
ALTER TABLE public.plan_versions
  ADD COLUMN IF NOT EXISTS third_party_costs text NOT NULL DEFAULT 'Paid by the hotel directly to the vendor',
  ADD COLUMN IF NOT EXISTS third_party_cost_items text[] NOT NULL DEFAULT ARRAY['Meta / Google ad spend','Website hosting & domain','CRM','IVR','WhatsApp API','Email software','OTA promotions','Influencer hosting'];
ALTER TABLE public.custom_plans
  ADD COLUMN IF NOT EXISTS third_party_costs text NOT NULL DEFAULT 'Paid by the hotel directly to the vendor',
  ADD COLUMN IF NOT EXISTS third_party_cost_items text[] NOT NULL DEFAULT ARRAY['Meta / Google ad spend','Website hosting & domain','CRM','IVR','WhatsApp API','Email software','OTA promotions','Influencer hosting'];

-- ---------- Annual revision + demo markers ----------
ALTER TABLE public.client_launches
  ADD COLUMN IF NOT EXISTS annual_revision_pct numeric,
  ADD COLUMN IF NOT EXISTS last_revised_on date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.gbp_kpi_entries ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.social_kpi_entries ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.pipeline_kpi_entries ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.weekly_kpi_entries ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
-- Outbox rows that must wait (e.g. until SMTP is configured) are skipped by the sender.
ALTER TABLE public.client_message_outbox ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false;

-- ---------- Role helpers ----------
CREATE OR REPLACE FUNCTION public.can_manage_finance(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'management') OR public.has_role(_uid,'finance') $$;
CREATE OR REPLACE FUNCTION public.is_res_desk_head(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.pipeline_members pm JOIN public.pipelines p ON p.id = pm.pipeline_id
                      WHERE pm.user_id = _uid AND pm.active AND pm.role = 'head' AND p.code = 'reservations_desk') $$;
REVOKE ALL ON FUNCTION public.can_manage_finance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_res_desk_head(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_res_desk_head(uuid) TO authenticated, service_role;

-- ---------- Bookings ledger ----------
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  sales_person_id uuid REFERENCES public.profiles(id),
  sales_person_name text,
  status text NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED','CANCELLED')),
  booked_on date,
  guest_name text,
  guest_city text,
  category text,
  source text,
  package text,
  room_category text,
  adults integer, kids integer, infants integer, rooms integer, nights integer,
  check_in date, check_out date,
  deal_inr numeric NOT NULL DEFAULT 0 CHECK (deal_inr >= 0),
  advance_pct numeric, advance_inr numeric, advance_deposit_date date, due_balance_inr numeric,
  special_request text,
  stay_month date NOT NULL,
  import_key text UNIQUE,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_stay_month_idx ON public.bookings (stay_month, client_id);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
REVOKE ALL ON public.bookings FROM anon;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance and reservation head read bookings" ON public.bookings;
CREATE POLICY "Finance and reservation head read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.can_manage_finance(auth.uid()) OR public.is_res_desk_head(auth.uid()));
DROP POLICY IF EXISTS "Finance writes bookings" ON public.bookings;
CREATE POLICY "Finance writes bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Finance updates bookings" ON public.bookings;
CREATE POLICY "Finance updates bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.can_manage_finance(auth.uid())) WITH CHECK (public.can_manage_finance(auth.uid()));
DROP TRIGGER IF EXISTS t_bookings_upd ON public.bookings;
CREATE TRIGGER t_bookings_upd BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Guest phone / email are personal data: finance, admin and management only.
CREATE TABLE IF NOT EXISTS public.booking_guest_contacts (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_phone text,
  guest_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.booking_guest_contacts TO authenticated;
GRANT ALL ON public.booking_guest_contacts TO service_role;
REVOKE ALL ON public.booking_guest_contacts FROM anon;
ALTER TABLE public.booking_guest_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance reads guest contacts" ON public.booking_guest_contacts;
CREATE POLICY "Finance reads guest contacts" ON public.booking_guest_contacts FOR SELECT TO authenticated USING (public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Finance writes guest contacts" ON public.booking_guest_contacts;
CREATE POLICY "Finance writes guest contacts" ON public.booking_guest_contacts FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Finance updates guest contacts" ON public.booking_guest_contacts;
CREATE POLICY "Finance updates guest contacts" ON public.booking_guest_contacts FOR UPDATE TO authenticated
  USING (public.can_manage_finance(auth.uid())) WITH CHECK (public.can_manage_finance(auth.uid()));

-- ---------- Sales goals (month_no 0 = yearly goal; 1..12 = calendar month) ----------
CREATE TABLE IF NOT EXISTS public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('property','sales_person')),
  subject_key text NOT NULL,
  fy integer NOT NULL CHECK (fy BETWEEN 2020 AND 2100),
  month_no integer NOT NULL CHECK (month_no BETWEEN 0 AND 12),
  goal_inr numeric NOT NULL CHECK (goal_inr >= 0),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, subject_key, fy, month_no)
);
GRANT SELECT, INSERT, UPDATE ON public.sales_goals TO authenticated;
GRANT ALL ON public.sales_goals TO service_role;
REVOKE ALL ON public.sales_goals FROM anon;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance and reservation head read goals" ON public.sales_goals;
CREATE POLICY "Finance and reservation head read goals" ON public.sales_goals FOR SELECT TO authenticated
  USING (public.can_manage_finance(auth.uid()) OR public.is_res_desk_head(auth.uid()));
DROP POLICY IF EXISTS "Finance writes goals" ON public.sales_goals;
CREATE POLICY "Finance writes goals" ON public.sales_goals FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Finance updates goals" ON public.sales_goals;
CREATE POLICY "Finance updates goals" ON public.sales_goals FOR UPDATE TO authenticated
  USING (public.can_manage_finance(auth.uid())) WITH CHECK (public.can_manage_finance(auth.uid()));

-- ---------- Invoices ----------
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  launch_id uuid REFERENCES public.client_launches(id),
  invoice_no text NOT NULL UNIQUE,
  period_start date, period_end date,
  invoice_type text NOT NULL CHECK (invoice_type IN ('retainer','add_on','commission','team_incentive','other')),
  amount_inr numeric NOT NULL CHECK (amount_inr > 0),
  raised_on date NOT NULL,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','part_paid','paid')),
  paid_amount_inr numeric NOT NULL DEFAULT 0 CHECK (paid_amount_inr >= 0),
  paid_on date,
  late_interest_pct numeric,
  notes text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_on >= raised_on),
  CHECK (paid_amount_inr <= amount_inr)
);
GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
REVOKE ALL ON public.invoices FROM anon;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance reads invoices" ON public.invoices;
CREATE POLICY "Finance reads invoices" ON public.invoices FOR SELECT TO authenticated USING (public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Finance creates invoices" ON public.invoices;
CREATE POLICY "Finance creates invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid()));
DROP POLICY IF EXISTS "Finance updates invoices" ON public.invoices;
CREATE POLICY "Finance updates invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (public.can_manage_finance(auth.uid())) WITH CHECK (public.can_manage_finance(auth.uid()));

-- Payment status follows the paid amount; late interest snapshots the contract's rate.
CREATE OR REPLACE FUNCTION public.invoice_before_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.status := CASE WHEN NEW.paid_amount_inr >= NEW.amount_inr THEN 'paid'
                     WHEN NEW.paid_amount_inr > 0 THEN 'part_paid' ELSE 'unpaid' END;
  IF NEW.status = 'paid' AND NEW.paid_on IS NULL THEN NEW.paid_on := (now() AT TIME ZONE 'Asia/Kolkata')::date; END IF;
  IF TG_OP = 'INSERT' AND NEW.late_interest_pct IS NULL AND NEW.launch_id IS NOT NULL THEN
    NEW.late_interest_pct := NULLIF((public._launch_terms(NEW.launch_id)->>'late_interest_pct')::numeric, 0);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_invoice_before_write ON public.invoices;
CREATE TRIGGER t_invoice_before_write BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_before_write();

CREATE OR REPLACE FUNCTION public.invoice_effective_status(_status text, _due date)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _status <> 'paid' AND _due < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'overdue' ELSE _status END $$;

-- Owner view: only their hotel's (and its child properties') invoices, never notes.
CREATE OR REPLACE FUNCTION public.my_invoices()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'hotel_name', c.hotel_name, 'invoice_no', i.invoice_no,
    'period_start', i.period_start, 'period_end', i.period_end, 'invoice_type', i.invoice_type,
    'amount_inr', i.amount_inr, 'raised_on', i.raised_on, 'due_on', i.due_on,
    'status', public.invoice_effective_status(i.status, i.due_on),
    'paid_amount_inr', i.paid_amount_inr, 'paid_on', i.paid_on, 'late_interest_pct', i.late_interest_pct
  ) ORDER BY i.raised_on DESC, i.invoice_no), '[]'::jsonb)
  FROM public.invoices i JOIN public.clients c ON c.id = i.client_id
  WHERE public.my_client_id() IS NOT NULL
    AND (i.client_id = public.my_client_id() OR c.parent_client_id = public.my_client_id())
$$;
REVOKE ALL ON FUNCTION public.my_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_invoices() TO authenticated;

-- ---------- Commission & incentive due per client for one stay month ----------
CREATE OR REPLACE FUNCTION public.commission_due(_month date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE m0 date := date_trunc('month', _month)::date; m1 date := (date_trunc('month', _month) + interval '1 month')::date;
BEGIN
  IF NOT public.can_manage_finance(auth.uid()) THEN RAISE EXCEPTION 'Finance, admin or management only'; END IF;
  RETURN (
    WITH b AS (
      SELECT bk.client_id,
             CASE WHEN coalesce(bk.category,'') ~* '(wedding|event)' THEN 'weddings'
                  WHEN coalesce(bk.source,'') ~* 'ota' THEN 'ota' ELSE 'direct' END AS bucket,
             bk.deal_inr
        FROM public.bookings bk JOIN public.clients c ON c.id = bk.client_id
       WHERE bk.status = 'BOOKED' AND NOT bk.is_demo AND NOT c.is_demo AND bk.stay_month = m0),
    agg AS (
      SELECT client_id, count(*) n,
             sum(deal_inr) FILTER (WHERE bucket='direct') direct_rev,
             sum(deal_inr) FILTER (WHERE bucket='ota') ota_rev,
             sum(deal_inr) FILTER (WHERE bucket='weddings') wed_rev,
             sum(deal_inr) total_rev
        FROM b GROUP BY client_id),
    t AS (
      SELECT a.*, c.hotel_name, l.id launch_id, coalesce(cp.name, pl.name) plan_name,
             l.commission_direct_pct dp, l.commission_ota_pct op, l.commission_weddings_pct wp,
             coalesce(l.team_incentive_pct, pv.team_incentive_pct) ip
        FROM agg a JOIN public.clients c ON c.id = a.client_id
        LEFT JOIN LATERAL (
          SELECT * FROM public.client_launches x
           WHERE x.client_id = a.client_id AND x.status NOT IN ('draft','proposed','cancelled')
             AND (x.contract_start IS NULL OR x.contract_start < m1)
             AND (x.closed_at IS NULL OR x.closed_at::date >= m0)
           ORDER BY x.contract_start DESC NULLS LAST, x.created_at DESC LIMIT 1) l ON true
        LEFT JOIN public.plans pl ON pl.id = l.plan_id
        LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
        LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'hotel_name', hotel_name, 'launch_id', launch_id, 'plan_name', plan_name, 'bookings', n,
      'revenue', jsonb_build_object('direct', coalesce(direct_rev,0), 'ota', coalesce(ota_rev,0), 'weddings', coalesce(wed_rev,0), 'total', coalesce(total_rev,0)),
      'pct', jsonb_build_object('direct', dp, 'ota', op, 'weddings', wp, 'team_incentive', ip),
      'due', jsonb_build_object(
        'direct', CASE WHEN dp IS NULL THEN NULL ELSE round(coalesce(direct_rev,0) * dp / 100, 2) END,
        'ota', CASE WHEN op IS NULL THEN NULL ELSE round(coalesce(ota_rev,0) * op / 100, 2) END,
        'weddings', CASE WHEN wp IS NULL THEN NULL ELSE round(coalesce(wed_rev,0) * wp / 100, 2) END,
        'team_incentive', CASE WHEN ip IS NULL OR ip = 0 THEN NULL ELSE round(coalesce(total_rev,0) * ip / 100, 2) END)
    ) ORDER BY hotel_name), '[]'::jsonb) FROM t);
END $$;
REVOKE ALL ON FUNCTION public.commission_due(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_due(date) TO authenticated;

-- ---------- Annual fee revision ----------
CREATE OR REPLACE FUNCTION public._revision_candidates(_on date)
 RETURNS TABLE(launch_id uuid, client_id uuid, hotel_name text, old_retainer numeric, new_retainer numeric, pct numeric, anniversary date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.id, l.client_id, c.hotel_name, l.retainer_inr,
         round(l.retainer_inr * (1 + r.pct / 100)), r.pct, _on
    FROM public.client_launches l
    JOIN public.clients c ON c.id = l.client_id
    LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
    CROSS JOIN LATERAL (SELECT CASE WHEN l.annual_revision_applicable IS FALSE THEN NULL
                                    ELSE coalesce(l.annual_revision_pct, pv.annual_revision_pct) END AS pct) r
   WHERE l.status IN ('active','live') AND l.notice_date IS NULL
     AND NOT c.is_test AND NOT c.is_demo
     AND l.contract_start IS NOT NULL AND l.retainer_inr > 0 AND coalesce(r.pct, 0) > 0
     AND extract(year FROM age(_on, l.contract_start)) >= 1
     AND (l.contract_start + (extract(year FROM age(_on, l.contract_start))::int * interval '1 year'))::date = _on
     AND l.last_revised_on IS DISTINCT FROM _on
$$;
REVOKE ALL ON FUNCTION public._revision_candidates(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_annual_revisions(_today date DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_today date := coalesce(_today, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_actor uuid; c record; m record; v_chg uuid; v_st text; notified int := 0; revised int := 0; v_title text; v_body text;
BEGIN
  SELECT p.id INTO v_actor FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'admin'
   WHERE p.status = 'active' ORDER BY p.created_at LIMIT 1;
  IF v_actor IS NULL THEN RETURN jsonb_build_object('error', 'no active admin'); END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

  -- 30-day notice to management (in-app now; email queued and held until SMTP is set up)
  FOR c IN SELECT * FROM public._revision_candidates(v_today + 30) LOOP
    v_title := 'Annual revision on ' || to_char(c.anniversary, 'DD Mon YYYY') || ': ' || c.hotel_name;
    v_body := c.hotel_name || ' retainer ₹' || to_char(c.old_retainer, 'FM99,99,99,999') || ' → ₹' || to_char(c.new_retainer, 'FM99,99,99,999')
              || ' (+' || c.pct || '%) on ' || to_char(c.anniversary, 'DD Mon YYYY') || '.';
    FOR m IN SELECT DISTINCT p.id, p.email FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
              WHERE r.role IN ('admin','management') AND p.status = 'active' LOOP
      IF NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = m.id AND n.kind = 'annual_revision' AND n.title = v_title) THEN
        INSERT INTO public.notifications (user_id, title, body, link, kind) VALUES (m.id, v_title, v_body, '/clients/' || c.client_id, 'annual_revision');
        notified := notified + 1;
      END IF;
      IF m.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.client_message_outbox o
            WHERE o.client_id = c.client_id AND o.kind = 'annual_revision_notice' AND o.subject = v_title AND o.to_address = m.email) THEN
        INSERT INTO public.client_message_outbox (client_id, channel, to_address, kind, subject, body, held)
        VALUES (c.client_id, 'email', m.email, 'annual_revision_notice', v_title, v_body, true);
      END IF;
    END LOOP;
  END LOOP;

  -- Apply revisions due today (status re-checked under lock)
  FOR c IN SELECT * FROM public._revision_candidates(v_today) LOOP
    SELECT status INTO v_st FROM public.client_launches WHERE id = c.launch_id FOR UPDATE;
    CONTINUE WHEN v_st NOT IN ('active','live');
    INSERT INTO public.commercial_term_changes (launch_id, client_id, old_terms, new_terms, reason, requested_by, decided_by, decided_at, decision_note)
    VALUES (c.launch_id, c.client_id, public._launch_terms(c.launch_id), jsonb_build_object('retainer_inr', c.new_retainer),
            'Annual revision', v_actor, v_actor, now(),
            'Automatic annual revision of ' || c.pct || '% on contract anniversary ' || to_char(c.anniversary, 'DD Mon YYYY'))
    RETURNING id INTO v_chg;
    PERFORM public._apply_term_change(v_chg);
    UPDATE public.client_launches SET last_revised_on = v_today WHERE id = c.launch_id;
    PERFORM public.log_admin_action(v_actor, 'annual_revision_applied', 'client_launch', c.launch_id::text, 'ok',
      jsonb_build_object('old', c.old_retainer, 'new', c.new_retainer, 'pct', c.pct, 'date', v_today));
    revised := revised + 1;
  END LOOP;
  RETURN jsonb_build_object('date', v_today, 'notified', notified, 'revised', revised);
END $$;
REVOKE ALL ON FUNCTION public.run_annual_revisions(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_annual_revisions(date) TO service_role;

-- ---------- Terms snapshot: annual revision % and third-party costs ----------
CREATE OR REPLACE FUNCTION public._launch_terms(_launch_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'retainer_inr', l.retainer_inr,
    'commission_direct_pct', l.commission_direct_pct,
    'commission_ota_pct', l.commission_ota_pct,
    'commission_weddings_pct', l.commission_weddings_pct,
    'setup_fee_inr', l.setup_fee_inr,
    'contract_start', l.contract_start,
    'contract_end', l.contract_end,
    'notice_days', coalesce(l.notice_days, cp.notice_days, pv.notice_days),
    'payment_cycle', coalesce(l.payment_cycle, cp.payment_cycle),
    'billing_basis', coalesce(l.billing_basis, pv.billing_basis),
    'invoice_day', coalesce(l.invoice_day, pv.invoice_day),
    'due_day', coalesce(l.due_day, pv.due_day),
    'late_interest_pct', coalesce(l.late_interest_pct, pv.late_interest_pct),
    'min_term_months', coalesce(l.min_term_months, pv.min_term_months),
    'annual_revision_applicable', coalesce(l.annual_revision_applicable, coalesce(pv.annual_revision_pct, 0) > 0),
    'team_incentive_pct', coalesce(l.team_incentive_pct, pv.team_incentive_pct),
    'commission_reconcile_day', l.commission_reconcile_day,
    'booking_advances_via_alcor', l.booking_advances_via_alcor,
    'auto_renew', coalesce(l.auto_renew, pv.auto_renew),
    'contract_signed_on', l.contract_signed_on,
    'contract_reference', l.contract_reference,
    'annual_revision_pct', CASE WHEN l.annual_revision_applicable IS FALSE THEN NULL ELSE coalesce(l.annual_revision_pct, pv.annual_revision_pct) END,
    'third_party_costs', coalesce(cp.third_party_costs, pv.third_party_costs),
    'third_party_cost_items', to_jsonb(coalesce(cp.third_party_cost_items, pv.third_party_cost_items)),
    'recurring_fees', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'monthly_inr', f.monthly_inr,
                         'starts_on', f.starts_on, 'ends_on', f.ends_on) ORDER BY f.starts_on, f.name), '[]'::jsonb)
                       FROM public.launch_recurring_fees f WHERE f.launch_id = l.id))
  FROM public.client_launches l
  LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
  LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
  WHERE l.id = _launch_id
$function$;

-- ---------- Demo data never counts in scorecards / HR ----------
CREATE OR REPLACE FUNCTION public.team_scorecard(_month date DEFAULT ((date_trunc('month'::text, (now() AT TIME ZONE 'Asia/Kolkata'::text)) - '1 mon'::interval))::date)
 RETURNS TABLE(user_id uuid, full_name text, role text, reports_due integer, reports_on_time integer, on_time_pct numeric, kpi_pct numeric, tasks_due integer, tasks_on_time integer, launch_pct numeric, open_actions integer, overdue_actions integer, red_action_score numeric, overall_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m0 date := date_trunc('month',_month)::date; m1 date := (date_trunc('month',_month) + interval '1 month')::date;
        today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; w jsonb;
BEGIN
  IF NOT (is_staff(auth.uid()) OR has_role(auth.uid(),'hr')) THEN RAISE EXCEPTION 'Staff only'; END IF;
  SELECT value INTO w FROM app_settings WHERE key='scorecard_weights';
  w := coalesce(w, '{"kpi":50,"on_time":20,"launch":20,"red_actions":10}');
  RETURN QUERY
  WITH staff AS (
    SELECT p.id, p.full_name, (SELECT string_agg(r.role::text, ',') FROM user_roles r WHERE r.user_id=p.id) AS roles
      FROM profiles p
     WHERE p.status='active' AND is_staff(p.id)
       AND (is_manager(auth.uid()) OR has_role(auth.uid(),'hr') OR p.id = auth.uid())
  ), rep AS (
    SELECT cp.manager_id uid, r.id, r.due_date, r.submitted_at, r.status,
           (SELECT avg(e.achievement_pct) FROM kpi_entries e WHERE e.report_id=r.id AND e.achievement_pct IS NOT NULL) ach
      FROM monthly_reports r JOIN client_pipelines cp ON cp.id=r.client_pipeline_id
     WHERE r.month = m0 AND NOT r.is_demo
  ), rs AS (
    SELECT uid,
      count(*) FILTER (WHERE due_date < today OR submitted_at IS NOT NULL)::int due,
      count(*) FILTER (WHERE submitted_at IS NOT NULL AND (submitted_at AT TIME ZONE 'Asia/Kolkata')::date <= due_date)::int ontime,
      avg(ach) FILTER (WHERE status IN ('submitted','review','approved')) ach
    FROM rep GROUP BY uid
  ), ts AS (
    SELECT t.assignee_id uid,
      count(*)::int due,
      count(*) FILTER (WHERE t.status='done' AND (t.done_at AT TIME ZONE 'Asia/Kolkata')::date <= t.due_date)::int ontime
    FROM client_tasks t
    WHERE t.due_date >= m0 AND t.due_date < m1 AND t.due_date < today AND t.status <> 'not_applicable' AND t.assignee_id IS NOT NULL
    GROUP BY t.assignee_id
  ), act AS (
    SELECT a.responsible_id uid, count(*)::int open_n,
           count(*) FILTER (WHERE a.due_date < today)::int overdue_n
      FROM action_items a WHERE a.status <> 'completed' AND a.responsible_id IS NOT NULL GROUP BY a.responsible_id
  ), base AS (
    SELECT s.id, s.full_name, s.roles,
      coalesce(rs.due,0) rdue, coalesce(rs.ontime,0) rok,
      CASE WHEN coalesce(rs.due,0)>0 THEN round(rs.ontime*100.0/rs.due,1) END otp,
      round(rs.ach,1) kp,
      coalesce(ts.due,0) tdue, coalesce(ts.ontime,0) tok,
      CASE WHEN coalesce(ts.due,0)>0 THEN round(100.0*ts.ontime/ts.due,1) END lp,
      coalesce(act.open_n,0) ao, coalesce(act.overdue_n,0) aod,
      GREATEST(0, 100 - 20*coalesce(act.overdue_n,0))::numeric ras
    FROM staff s LEFT JOIN rs ON rs.uid=s.id LEFT JOIN ts ON ts.uid=s.id LEFT JOIN act ON act.uid=s.id
  )
  SELECT b.id, b.full_name, b.roles, b.rdue, b.rok, b.otp, b.kp, b.tdue, b.tok, b.lp, b.ao, b.aod, b.ras,
    CASE WHEN b.kp IS NULL AND b.otp IS NULL AND b.lp IS NULL THEN NULL ELSE round(
      ( LEAST(coalesce(b.kp,0),100)*(w->>'kpi')::numeric*(b.kp IS NOT NULL)::int
      + coalesce(b.otp,0)*(w->>'on_time')::numeric*(b.otp IS NOT NULL)::int
      + coalesce(b.lp,0)*(w->>'launch')::numeric*(b.lp IS NOT NULL)::int
      + b.ras*(w->>'red_actions')::numeric )
      / ( (w->>'kpi')::numeric*(b.kp IS NOT NULL)::int + (w->>'on_time')::numeric*(b.otp IS NOT NULL)::int
        + (w->>'launch')::numeric*(b.lp IS NOT NULL)::int + (w->>'red_actions')::numeric ), 1) END
  FROM base b ORDER BY 14 DESC NULLS LAST, 2;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_staff_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'HR and management only';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(t.row ORDER BY t.full_name), '[]'::jsonb)
    FROM (
      SELECT p.full_name,
        jsonb_build_object(
          'user_id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'status', p.status,
          'department', p.department,
          'joined_on', p.joined_on,
          'roles', (SELECT coalesce(jsonb_agg(r.role::text), '[]'::jsonb) FROM public.user_roles r WHERE r.user_id = p.id),
          'pipelines', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'code', pl.code, 'name', pl.name,
                     'role', CASE WHEN pm.role = 'head' THEN 'Head' ELSE 'Team' END)
                   ORDER BY pl.sort_order), '[]'::jsonb)
            FROM public.pipeline_members pm JOIN public.pipelines pl ON pl.id = pm.pipeline_id
            WHERE pm.user_id = p.id AND pm.active),
          'assigned_clients', (
            SELECT count(DISTINCT a.client_id) FROM public.client_staff_assignments a
            WHERE a.user_id = p.id AND NOT a.excluded
              AND NOT EXISTS (SELECT 1 FROM public.clients dc WHERE dc.id = a.client_id AND (dc.is_demo OR dc.is_test)))) AS row
      FROM public.profiles p
      WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role <> 'client')
    ) t);
END;
$function$;
