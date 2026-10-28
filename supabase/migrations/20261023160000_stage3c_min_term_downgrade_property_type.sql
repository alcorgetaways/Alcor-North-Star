ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS notice_within_min_term boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS min_term_end date;
COMMENT ON COLUMN public.client_launches.notice_within_min_term IS 'Termination notice was recorded before the minimum term ended (warning only, never blocks).';
ALTER TABLE public.client_launches DROP CONSTRAINT IF EXISTS client_launches_change_kind_check;
ALTER TABLE public.client_launches ADD CONSTRAINT client_launches_change_kind_check CHECK (change_kind = ANY (ARRAY['upgrade','downgrade','plan_change','relaunch']));
ALTER TABLE public.client_review_items DROP CONSTRAINT IF EXISTS client_review_items_kind_check;
ALTER TABLE public.client_review_items ADD CONSTRAINT client_review_items_kind_check CHECK (kind = ANY (ARRAY['contract_flag','commission_pending','upgrade_pending','missing_in_bd_tracker','property_type_unknown','exit_date_unknown','other']));
ALTER TABLE public.clients ALTER COLUMN property_type SET DEFAULT 'Hotel';
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_property_type_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_property_type_check CHECK (property_type IS NULL OR property_type = ANY (ARRAY['Hotel','Resort','Homestay','Glamping/Camp','Clinic','Restaurant','Bar','Cafe','Other']));

CREATE OR REPLACE FUNCTION public._min_term_info(_launch_id uuid, _notice_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE l public.client_launches; m int; s date; e date; a interval;
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id;
  IF l.id IS NULL THEN RETURN NULL; END IF;
  m := coalesce(l.min_term_months, (SELECT min_term_months FROM plans WHERE id = l.plan_id), 0);
  s := coalesce(l.contract_start, l.day0_date);
  IF m <= 0 OR s IS NULL THEN
    RETURN jsonb_build_object('min_term_months', m, 'min_term_end', NULL, 'within', false, 'months_remaining', 0, 'days_remaining', 0);
  END IF;
  e := (s + make_interval(months => m))::date;
  IF _notice_date >= e THEN
    RETURN jsonb_build_object('min_term_months', m, 'min_term_end', e, 'within', false, 'months_remaining', 0, 'days_remaining', 0);
  END IF;
  a := age(e, _notice_date);
  RETURN jsonb_build_object('min_term_months', m, 'min_term_end', e, 'within', true,
    'months_remaining', extract(year FROM a)::int * 12 + extract(month FROM a)::int, 'days_remaining', extract(day FROM a)::int);
END $f$;
REVOKE ALL ON FUNCTION public._min_term_info(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.min_term_check(_launch_id uuid, _notice_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE cid uuid;
BEGIN
  SELECT client_id INTO cid FROM client_launches WHERE id = _launch_id;
  IF cid IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT (can_edit_client(cid) OR is_launch_am(_launch_id)) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  RETURN public._min_term_info(_launch_id, _notice_date);
END $f$;
REVOKE ALL ON FUNCTION public.min_term_check(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.min_term_check(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_termination_notice(_launch_id uuid, _notice_date date, _notice_from text, _reason text DEFAULT NULL::text, _notice_file_path text DEFAULT NULL::text)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l public.client_launches; pl public.plans; _exit date; n integer; mt jsonb;
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT (can_edit_client(l.client_id) OR is_launch_am(l.id)) THEN
    RAISE EXCEPTION 'Only the Account Manager, BD or management can record a notice';
  END IF;
  IF l.status NOT IN ('active','live') THEN RAISE EXCEPTION 'A notice can only be recorded on an active or live client (this one is %)', l.status; END IF;
  SELECT * INTO pl FROM plans WHERE id = l.plan_id;
  _exit := GREATEST(_notice_date + coalesce(pl.notice_days, 60),
                    (coalesce(l.day0_date, _notice_date) + make_interval(months => coalesce(pl.min_term_months, 0)))::date);
  mt := public._min_term_info(l.id, _notice_date);
  UPDATE client_launches SET status = 'offboarding',
    notice_within_min_term = coalesce((mt->>'within')::boolean, false), min_term_end = (mt->>'min_term_end')::date, notice_date = _notice_date, notice_from = _notice_from,
    notice_reason = _reason, notice_file_path = _notice_file_path, exit_date = _exit
  WHERE id = l.id;
  INSERT INTO client_tasks (launch_id, client_id, module_code, code, name, standard, week_label, week_start, week_due,
    due_date, assignee_id, backup_id, sort_order, phase)
  SELECT l.id, l.client_id, o.module_code, o.code, o.name, o.standard,
         CASE o.anchor WHEN 'notice' THEN 'Notice +' || o.offset_days || 'd'
              ELSE 'Exit ' || CASE WHEN o.offset_days >= 0 THEN '+' ELSE '' END || o.offset_days || 'd' END,
         0, 0,
         CASE o.anchor WHEN 'notice' THEN _notice_date ELSE _exit END + o.offset_days,
         a.primary_user_id, a.backup_user_id, 1000 + o.sort_order, 'offboarding'
  FROM offboarding_templates o
  JOIN client_module_assignments a ON a.launch_id = l.id AND a.module_code = o.module_code
  WHERE o.plan_id = l.plan_id AND o.active
  ON CONFLICT (launch_id, code) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT DISTINCT u, 'Termination notice · ' || (SELECT hotel_name FROM clients WHERE id = l.client_id),
         'Exit on ' || to_char(_exit, 'DD Mon YYYY') || '. ' || n || ' exit tasks created.', '/launches/' || l.id, 'offboarding'
  FROM (SELECT assignee_id u FROM client_tasks WHERE launch_id = l.id AND phase = 'offboarding'
        UNION SELECT user_id FROM user_roles WHERE role IN ('admin','management')) x
  WHERE u IS NOT NULL;
  RETURN _exit;
END $function$;

CREATE OR REPLACE FUNCTION public.activate_due_upgrades(_today date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0; v_today date := coalesce(_today, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  FOR r IN
    SELECT l.id, l.client_id, (l.change_kind = 'downgrade') AS is_down, l.upgraded_from_launch_id AS from_id, l.contract_start
      FROM client_launches l
     WHERE l.status = 'proposed' AND l.upgraded_from_launch_id IS NOT NULL
       AND l.contract_start IS NOT NULL AND l.contract_start <= v_today
     ORDER BY l.contract_start, l.created_at
  LOOP
    UPDATE client_launches SET previous_status = status, status = 'closed', closing_reason_code = CASE WHEN r.is_down THEN 'downgraded' ELSE 'upgraded' END,
           closed_reason = CASE WHEN r.is_down THEN 'Downgraded' ELSE 'Upgraded' END, closed_at = now(),
           contract_end = coalesce(contract_end, r.contract_start - 1)
     WHERE id = r.from_id AND status NOT IN ('closed','completed','cancelled');
    INSERT INTO launch_events (launch_id, user_id, kind, details)
    VALUES (r.from_id, NULL, 'closed', CASE WHEN r.is_down THEN jsonb_build_object('reason_code', 'downgraded', 'downgraded_to', r.id) ELSE jsonb_build_object('reason_code', 'upgraded', 'upgraded_to', r.id) END);
    UPDATE client_launches SET previous_status = status, status = 'active', activated_at = coalesce(activated_at, now())
     WHERE id = r.id;
    INSERT INTO launch_events (launch_id, user_id, kind, details)
    VALUES (r.id, NULL, CASE WHEN r.is_down THEN 'downgrade_activated' ELSE 'upgrade_activated' END, jsonb_build_object('from_launch', r.from_id, 'start', r.contract_start));
    PERFORM recalc_client_assignments(r.client_id, false);
    PERFORM recalc_client_assignments(c.id, false) FROM clients c WHERE c.parent_client_id = r.client_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.launch_reporting_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN jsonb_build_object(
    'unique_clients', (SELECT count(DISTINCT l.client_id) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test),
    'active_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status IN ('active','live','on_hold','offboarding')),
    'closed_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status = 'closed'),
    'churned_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id JOIN public.closing_reasons r ON r.code = l.closing_reason_code WHERE NOT c.is_test AND l.status IN ('closed','completed') AND r.is_churn),
    'completed_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status = 'completed'),
    'cancelled_before_start', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status = 'cancelled' AND l.activated_at IS NULL),
    'returning_clients', (SELECT count(*) FROM (SELECT l.client_id FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test GROUP BY l.client_id HAVING count(*) > 1) x),
    'upgrades', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND (l.change_kind IN ('upgrade','plan_change') OR (l.upgraded_from_launch_id IS NOT NULL AND l.change_kind IS DISTINCT FROM 'downgrade'))),
    'downgrades', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.change_kind = 'downgrade'),
    'churned_date_unknown', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id JOIN public.closing_reasons r ON r.code = l.closing_reason_code WHERE NOT c.is_test AND l.status IN ('closed','completed') AND r.is_churn AND l.closed_at IS NULL)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.start_upgrade(_from_launch_id uuid, _to_plan_code text, _start_date date DEFAULT NULL::date, _terms jsonb DEFAULT NULL::jsonb, _services jsonb DEFAULT NULL::jsonb, _reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.client_launches; fp public.plans; tp public.plans; pv public.plan_versions;
  new_id uuid; v_cp uuid; v_name text; t jsonb := coalesce(_terms, '{}'::jsonb);
BEGIN
  SELECT * INTO f FROM client_launches WHERE id = _from_launch_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT can_edit_client(f.client_id) THEN RAISE EXCEPTION 'Only BD or management can start an upgrade'; END IF;
  SELECT * INTO fp FROM plans WHERE id = f.plan_id;
  SELECT * INTO tp FROM plans WHERE code = _to_plan_code AND active;
  IF tp.id IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _to_plan_code; END IF;
  IF tp.sort_order <= fp.sort_order THEN RAISE EXCEPTION '% is not an upgrade from %', tp.name, fp.name; END IF;

  IF _start_date IS NULL THEN
    IF f.status <> 'live' THEN RAISE EXCEPTION 'Only a live client can be upgraded this way (management can use Change plan at any stage)'; END IF;
    INSERT INTO client_launches (client_id, plan_id, upgraded_from_launch_id, change_kind, quarterly_fee_inr, created_by)
    VALUES (f.client_id, tp.id, f.id, 'upgrade', tp.quarterly_fee_inr, auth.uid()) RETURNING id INTO new_id;
  ELSE
    IF f.status NOT IN ('active','live') THEN RAISE EXCEPTION 'Only an active launch can be upgraded'; END IF;
    IF (_terms IS NOT NULL OR _services IS NOT NULL) AND NOT public.is_manager(auth.uid()) THEN
      RAISE EXCEPTION 'Only management or admin can schedule an upgrade on custom terms';
    END IF;
    IF EXISTS (SELECT 1 FROM client_launches WHERE upgraded_from_launch_id = f.id AND status = 'proposed') THEN
      RAISE EXCEPTION 'A plan change from this launch is already scheduled';
    END IF;
    SELECT * INTO pv FROM plan_versions WHERE plan_id = tp.id AND status = 'active' ORDER BY version DESC LIMIT 1;
    IF _terms IS NOT NULL OR _services IS NOT NULL THEN
      SELECT hotel_name INTO v_name FROM clients WHERE id = f.client_id;
      INSERT INTO custom_plans (base_plan_version_id, name, created_by, status, monthly_retainer_inr,
        commission_direct_pct, commission_ota_pct, commission_weddings_pct, commission_other_pct,
        contract_start, payment_cycle, notice_days, notes)
      VALUES (pv.id, v_name || ' — ' || tp.name || ' (upgrade)', auth.uid(), 'active',
        coalesce((t->>'retainer_inr')::numeric, pv.monthly_retainer_inr),
        (t->>'commission_direct_pct')::numeric, (t->>'commission_ota_pct')::numeric, (t->>'commission_weddings_pct')::numeric, 0,
        _start_date, coalesce(t->>'payment_cycle', 'monthly'), coalesce((t->>'notice_days')::int, pv.notice_days), _reason)
      RETURNING id INTO v_cp;
      IF _services IS NOT NULL THEN
        INSERT INTO custom_plan_services (custom_plan_id, service_name, scope, frequency, pipeline_code, included, sort_order)
        SELECT v_cp, s->>'service_name', s->>'scope', s->>'frequency', s->>'pipeline_code', true, (o - 1)::int
          FROM jsonb_array_elements(_services) WITH ORDINALITY AS x(s, o)
        ON CONFLICT (custom_plan_id, service_name) DO NOTHING;
      ELSE
        INSERT INTO custom_plan_services (custom_plan_id, service_name, scope, frequency, pipeline_code, included, sort_order)
        SELECT v_cp, s.service_name, s.scope, s.frequency, s.pipeline_code, s.included, s.sort_order
          FROM plan_services s WHERE s.plan_version_id = pv.id
        ON CONFLICT (custom_plan_id, service_name) DO NOTHING;
      END IF;
      UPDATE custom_plans SET approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
       WHERE id = v_cp AND approval_status <> 'approved';
    END IF;
    INSERT INTO client_launches (client_id, plan_id, plan_version_id, custom_plan_id, upgraded_from_launch_id, previous_launch_id,
      change_kind, status, contract_start, retainer_inr, commission_direct_pct, commission_ota_pct, commission_weddings_pct,
      notice_days, min_term_months, auto_renew, payment_cycle, team_incentive_pct, contract_signed_on, contract_reference,
      bd_owner_id, internal_owner_id, quarterly_fee_inr, created_by)
    VALUES (f.client_id, tp.id, pv.id, v_cp, f.id, f.id, 'upgrade', 'proposed', _start_date,
      coalesce((t->>'retainer_inr')::numeric, pv.monthly_retainer_inr),
      (t->>'commission_direct_pct')::numeric, (t->>'commission_ota_pct')::numeric, (t->>'commission_weddings_pct')::numeric,
      (t->>'notice_days')::int, (t->>'min_term_months')::int, (t->>'auto_renew')::boolean, coalesce(t->>'payment_cycle','monthly'),
      (t->>'team_incentive_pct')::numeric, (t->>'contract_signed_on')::date, t->>'contract_reference',
      f.bd_owner_id, f.internal_owner_id, tp.quarterly_fee_inr, auth.uid())
    RETURNING id INTO new_id;
    INSERT INTO commercial_term_changes (launch_id, client_id, old_terms, new_terms, reason, status, requested_by, decided_by, decided_at, decision_note)
    VALUES (new_id, f.client_id, _launch_terms(f.id), _launch_terms(new_id), _reason, 'applied', auth.uid(), auth.uid(), now(),
            'Upgrade scheduled to start ' || to_char(_start_date, 'DD Mon YYYY'));
    PERFORM log_admin_action(auth.uid(), 'upgrade_scheduled', 'client_launch', new_id::text, 'ok',
      jsonb_build_object('from_launch', f.id, 'plan', tp.code, 'start', _start_date));
  END IF;

  INSERT INTO client_module_assignments (launch_id, client_id, module_code, primary_user_id, backup_user_id, client_contact_name, client_contact_phone)
  SELECT new_id, a.client_id, a.module_code, a.primary_user_id, a.backup_user_id, a.client_contact_name, a.client_contact_phone
  FROM client_module_assignments a JOIN plan_modules pm ON pm.plan_id = tp.id AND pm.module_code = a.module_code
  WHERE a.launch_id = f.id;
  INSERT INTO launch_events (launch_id, user_id, kind, details)
  VALUES (new_id, auth.uid(), 'upgrade_started', jsonb_build_object('from', fp.code, 'to', tp.code, 'start', _start_date));
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.start_downgrade(_from_launch_id uuid, _to_plan_code text, _start_date date, _terms jsonb DEFAULT NULL::jsonb, _services jsonb DEFAULT NULL::jsonb, _reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.client_launches; fp public.plans; tp public.plans; pv public.plan_versions;
  new_id uuid; v_cp uuid; v_name text; t jsonb := coalesce(_terms, '{}'::jsonb);
BEGIN
  SELECT * INTO f FROM client_launches WHERE id = _from_launch_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT can_edit_client(f.client_id) THEN RAISE EXCEPTION 'Only BD or management can start a downgrade'; END IF;
  SELECT * INTO fp FROM plans WHERE id = f.plan_id;
  SELECT * INTO tp FROM plans WHERE code = _to_plan_code AND active;
  IF tp.id IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _to_plan_code; END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'Pick the date the downgrade starts'; END IF;
  IF tp.sort_order > fp.sort_order OR (tp.sort_order = fp.sort_order AND _terms IS NULL AND _services IS NULL) THEN
    RAISE EXCEPTION '% is not a downgrade from %', tp.name, fp.name;
  END IF;
  IF f.status NOT IN ('active','live') THEN RAISE EXCEPTION 'Only an active launch can be downgraded'; END IF;
  IF (_terms IS NOT NULL OR _services IS NOT NULL) AND NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only management or admin can schedule a downgrade on custom terms';
  END IF;
  IF EXISTS (SELECT 1 FROM client_launches WHERE upgraded_from_launch_id = f.id AND status = 'proposed') THEN
    RAISE EXCEPTION 'A plan change from this launch is already scheduled';
  END IF;
  SELECT * INTO pv FROM plan_versions WHERE plan_id = tp.id AND status = 'active' ORDER BY version DESC LIMIT 1;
  IF _terms IS NOT NULL OR _services IS NOT NULL THEN
    SELECT hotel_name INTO v_name FROM clients WHERE id = f.client_id;
    INSERT INTO custom_plans (base_plan_version_id, name, created_by, status, monthly_retainer_inr,
      commission_direct_pct, commission_ota_pct, commission_weddings_pct, commission_other_pct,
      contract_start, payment_cycle, notice_days, notes)
    VALUES (pv.id, v_name || ' — ' || tp.name || ' (downgrade)', auth.uid(), 'active',
      coalesce((t->>'retainer_inr')::numeric, pv.monthly_retainer_inr),
      (t->>'commission_direct_pct')::numeric, (t->>'commission_ota_pct')::numeric, (t->>'commission_weddings_pct')::numeric, 0,
      _start_date, coalesce(t->>'payment_cycle', 'monthly'), coalesce((t->>'notice_days')::int, pv.notice_days), _reason)
    RETURNING id INTO v_cp;
    IF _services IS NOT NULL THEN
      INSERT INTO custom_plan_services (custom_plan_id, service_name, scope, frequency, pipeline_code, included, sort_order)
      SELECT v_cp, s->>'service_name', s->>'scope', s->>'frequency', s->>'pipeline_code', true, (o - 1)::int
        FROM jsonb_array_elements(_services) WITH ORDINALITY AS x(s, o)
      ON CONFLICT (custom_plan_id, service_name) DO NOTHING;
    ELSE
      INSERT INTO custom_plan_services (custom_plan_id, service_name, scope, frequency, pipeline_code, included, sort_order)
      SELECT v_cp, s.service_name, s.scope, s.frequency, s.pipeline_code, s.included, s.sort_order
        FROM plan_services s WHERE s.plan_version_id = pv.id
      ON CONFLICT (custom_plan_id, service_name) DO NOTHING;
    END IF;
    UPDATE custom_plans SET approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
     WHERE id = v_cp AND approval_status <> 'approved';
  END IF;
  INSERT INTO client_launches (client_id, plan_id, plan_version_id, custom_plan_id, upgraded_from_launch_id, previous_launch_id,
    change_kind, status, contract_start, retainer_inr, commission_direct_pct, commission_ota_pct, commission_weddings_pct,
    notice_days, min_term_months, auto_renew, payment_cycle, team_incentive_pct, contract_signed_on, contract_reference,
    bd_owner_id, internal_owner_id, quarterly_fee_inr, created_by)
  VALUES (f.client_id, tp.id, pv.id, v_cp, f.id, f.id, 'downgrade', 'proposed', _start_date,
    coalesce((t->>'retainer_inr')::numeric, pv.monthly_retainer_inr),
    (t->>'commission_direct_pct')::numeric, (t->>'commission_ota_pct')::numeric, (t->>'commission_weddings_pct')::numeric,
    (t->>'notice_days')::int, (t->>'min_term_months')::int, (t->>'auto_renew')::boolean, coalesce(t->>'payment_cycle','monthly'),
    (t->>'team_incentive_pct')::numeric, (t->>'contract_signed_on')::date, t->>'contract_reference',
    f.bd_owner_id, f.internal_owner_id, tp.quarterly_fee_inr, auth.uid())
  RETURNING id INTO new_id;
  INSERT INTO commercial_term_changes (launch_id, client_id, old_terms, new_terms, reason, status, requested_by, decided_by, decided_at, decision_note)
  VALUES (new_id, f.client_id, _launch_terms(f.id), _launch_terms(new_id), _reason, 'applied', auth.uid(), auth.uid(), now(),
          'Downgrade scheduled to start ' || to_char(_start_date, 'DD Mon YYYY'));
  PERFORM log_admin_action(auth.uid(), 'downgrade_scheduled', 'client_launch', new_id::text, 'ok',
    jsonb_build_object('from_launch', f.id, 'plan', tp.code, 'start', _start_date));

  INSERT INTO client_module_assignments (launch_id, client_id, module_code, primary_user_id, backup_user_id, client_contact_name, client_contact_phone)
  SELECT new_id, a.client_id, a.module_code, a.primary_user_id, a.backup_user_id, a.client_contact_name, a.client_contact_phone
  FROM client_module_assignments a JOIN plan_modules pm ON pm.plan_id = tp.id AND pm.module_code = a.module_code
  WHERE a.launch_id = f.id;
  INSERT INTO launch_events (launch_id, user_id, kind, details)
  VALUES (new_id, auth.uid(), 'downgrade_started', jsonb_build_object('from', fp.code, 'to', tp.code, 'start', _start_date));
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.client_commercials(_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l public.client_launches%ROWTYPE;
  v_parent uuid;
  v_inherited boolean := false;
  v_owner uuid;
BEGIN
  IF NOT (public.can_view_commercials(auth.uid()) OR public.is_client_am(_client_id)) THEN
    RAISE EXCEPTION 'Commercial roles only';
  END IF;
  SELECT * INTO l FROM public.client_launches
   WHERE client_id = _client_id AND status IN ('active','live','on_hold')
   ORDER BY (status IN ('active','live')) DESC, created_at DESC LIMIT 1;
  v_owner := _client_id;
  IF l.id IS NULL THEN
    SELECT parent_client_id INTO v_parent FROM public.clients WHERE id = _client_id;
    IF v_parent IS NOT NULL THEN
      SELECT * INTO l FROM public.client_launches
       WHERE client_id = v_parent AND status IN ('active','live','on_hold')
       ORDER BY created_at DESC LIMIT 1;
      v_inherited := l.id IS NOT NULL;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'launch', CASE WHEN l.id IS NULL THEN NULL ELSE public._launch_terms(l.id) || jsonb_build_object(
      'id', l.id, 'status', l.status, 'inherited_from_parent', v_inherited,
      'plan_name', coalesce((SELECT name FROM public.custom_plans WHERE id = l.custom_plan_id),
                            (SELECT name FROM public.plans WHERE id = l.plan_id)),
      'base_plan_name', (SELECT name FROM public.plans WHERE id = l.plan_id),
      'is_custom', l.custom_plan_id IS NOT NULL,
      'approval_status', (SELECT approval_status FROM public.custom_plans WHERE id = l.custom_plan_id),
      'deposit_inr', l.deposit_inr, 'plan_code', (SELECT code FROM public.plans WHERE id = l.plan_id),
      'plan_sort_order', (SELECT sort_order FROM public.plans WHERE id = l.plan_id),
      'notice_date', l.notice_date, 'exit_date', l.exit_date, 'min_term_end', l.min_term_end, 'notice_within_min_term', l.notice_within_min_term,
      'renewal_date', l.renewal_date, 'notice_deadline', l.notice_deadline,
      'services', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name) ORDER BY p.sort_order), '[]'::jsonb)
        FROM public.pipelines p
        WHERE p.code IN (
          SELECT s.pipeline_code FROM public.custom_plan_services s
           WHERE l.custom_plan_id IS NOT NULL AND s.custom_plan_id = l.custom_plan_id AND s.included
          UNION
          SELECT s.pipeline_code FROM public.plan_services s
           WHERE l.custom_plan_id IS NULL AND s.plan_version_id = l.plan_version_id AND s.included))
    ) END,
    'plan_history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'status', h.status, 'change_kind', h.change_kind,
        'upgraded_from_launch_id', h.upgraded_from_launch_id,
        'plan_name', coalesce(cp.name, pl.name), 'base_plan_name', pl.name,
        'contract_start', h.contract_start, 'contract_end', h.contract_end,
        'closed_at', h.closed_at, 'closing_reason', cr.label, 'is_churn', coalesce(cr.is_churn, false),
        'retainer_inr', h.retainer_inr,
        'commission_direct_pct', h.commission_direct_pct, 'commission_ota_pct', h.commission_ota_pct,
        'commission_weddings_pct', h.commission_weddings_pct,
        'team_incentive_pct', h.team_incentive_pct, 'notice_within_min_term', h.notice_within_min_term, 'min_term_end', h.min_term_end, 'notice_date', h.notice_date,
        'recurring_fees', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'monthly_inr', f.monthly_inr)), '[]'::jsonb)
                             FROM public.launch_recurring_fees f WHERE f.launch_id = h.id))
        ORDER BY coalesce(h.contract_start, h.created_at::date), h.created_at), '[]'::jsonb)
      FROM public.client_launches h
      LEFT JOIN public.plans pl ON pl.id = h.plan_id
      LEFT JOIN public.custom_plans cp ON cp.id = h.custom_plan_id
      LEFT JOIN public.closing_reasons cr ON cr.code = h.closing_reason_code
      WHERE h.client_id = v_owner),
    'term_changes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'status', c.status, 'old_terms', c.old_terms, 'new_terms', c.new_terms,
        'reason', c.reason, 'created_at', c.created_at, 'decided_at', c.decided_at, 'decision_note', c.decision_note,
        'requested_by', (SELECT full_name FROM public.profiles WHERE id = c.requested_by),
        'decided_by', (SELECT full_name FROM public.profiles WHERE id = c.decided_by)) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM public.commercial_term_changes c WHERE c.client_id = coalesce(l.client_id, _client_id)),
    'review_items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'message', r.message, 'status', r.status)
                                ORDER BY r.kind DESC, r.created_at), '[]'::jsonb)
      FROM public.client_review_items r WHERE r.client_id = _client_id AND r.status = 'open'));
END $function$;

CREATE OR REPLACE FUNCTION public.finance_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_ret numeric; v_add numeric;
BEGIN
  IF NOT public.can_view_commercials(auth.uid()) THEN RAISE EXCEPTION 'Commercial roles only'; END IF;
  SELECT coalesce(sum(l.retainer_inr), 0) INTO v_ret
    FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id
   WHERE l.status IN ('active','live') AND NOT c.is_test;
  SELECT coalesce(sum(f.monthly_inr), 0) INTO v_add
    FROM public.launch_recurring_fees f JOIN public.client_launches l ON l.id = f.launch_id
    JOIN public.clients c ON c.id = l.client_id
   WHERE l.status IN ('active','live') AND NOT c.is_test
     AND f.starts_on <= v_today AND (f.ends_on IS NULL OR f.ends_on >= v_today);
  RETURN jsonb_build_object(
    'mrr', v_ret + v_add,
    'mrr_retainer', v_ret,
    'mrr_recurring_addons', v_add,
    'clients', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'hotel_name', c.hotel_name, 'is_test', c.is_test, 'parent_client_id', c.parent_client_id, 'property_type', c.property_type,
        'account_manager', (SELECT p.full_name FROM public.profiles p WHERE p.id = c.account_manager_id),
        'review_items', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'message', r.message) ORDER BY r.kind DESC, r.created_at), '[]'::jsonb)
                           FROM public.client_review_items r WHERE r.client_id = c.id AND r.status = 'open'),
        'launches', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'status', l.status,
            'plan_name', coalesce(cp.name, pl.name), 'base_plan_name', pl.name, 'plan_code', pl.code,
            'is_custom', l.custom_plan_id IS NOT NULL,
            'retainer_inr', l.retainer_inr,
            'recurring_fees', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'monthly_inr', f.monthly_inr,
                                 'starts_on', f.starts_on, 'ends_on', f.ends_on) ORDER BY f.name), '[]'::jsonb)
                               FROM public.launch_recurring_fees f WHERE f.launch_id = l.id),
            'commission_direct_pct', l.commission_direct_pct, 'commission_ota_pct', l.commission_ota_pct,
            'commission_weddings_pct', l.commission_weddings_pct, 'commission_other_pct', l.commission_other_pct,
            'setup_fee_inr', l.setup_fee_inr, 'deposit_inr', l.deposit_inr,
            'advance_amount', l.advance_amount, 'payment_reference', l.payment_reference,
            'addons', (SELECT coalesce(jsonb_agg(a.name), '[]'::jsonb) FROM public.addons_catalogue a WHERE a.id = ANY(coalesce(l.snapshot_addon_ids, '{}'))),
            'payment_cycle', coalesce(l.payment_cycle, cp.payment_cycle),
            'billing_basis', coalesce(l.billing_basis, pv.billing_basis),
            'contract_start', l.contract_start, 'contract_end', l.contract_end,
            'renewal_date', l.renewal_date, 'notice_deadline', l.notice_deadline,
            'closing_reason_code', l.closing_reason_code, 'closed_at', l.closed_at,
            'upgraded_from_launch_id', l.upgraded_from_launch_id, 'change_kind', l.change_kind,
            'notice_date', l.notice_date, 'exit_date', l.exit_date, 'min_term_end', l.min_term_end, 'notice_within_min_term', l.notice_within_min_term
          ) ORDER BY l.created_at DESC), '[]'::jsonb)
          FROM public.client_launches l
          LEFT JOIN public.plans pl ON pl.id = l.plan_id
          LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
          LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
          WHERE l.client_id = c.id)
      ) ORDER BY c.hotel_name), '[]'::jsonb)
      FROM public.clients c));
END $function$;

REVOKE ALL ON FUNCTION public.start_downgrade(uuid, text, date, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_downgrade(uuid, text, date, jsonb, jsonb, text) TO authenticated;

UPDATE public.client_launches l SET notice_within_min_term = coalesce((public._min_term_info(l.id, l.notice_date)->>'within')::boolean, false),
       min_term_end = (public._min_term_info(l.id, l.notice_date)->>'min_term_end')::date
 WHERE l.notice_date IS NOT NULL;