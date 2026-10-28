-- Contract decisions support: richer launch terms snapshot, recurring add-on fees,
-- scheduled upgrades and the daily upgrade activation step. Additive and rerunnable.

INSERT INTO public.closing_reasons (code, label, is_churn, requires_notes, sort_order)
VALUES ('upgraded', 'Upgraded', false, false, 8) ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.client_launches
  ADD COLUMN IF NOT EXISTS payment_cycle text,
  ADD COLUMN IF NOT EXISTS billing_basis text,
  ADD COLUMN IF NOT EXISTS invoice_day integer,
  ADD COLUMN IF NOT EXISTS due_day integer,
  ADD COLUMN IF NOT EXISTS late_interest_pct numeric,
  ADD COLUMN IF NOT EXISTS min_term_months integer,
  ADD COLUMN IF NOT EXISTS annual_revision_applicable boolean,
  ADD COLUMN IF NOT EXISTS team_incentive_pct numeric,
  ADD COLUMN IF NOT EXISTS commission_reconcile_day integer,
  ADD COLUMN IF NOT EXISTS booking_advances_via_alcor boolean,
  ADD COLUMN IF NOT EXISTS auto_renew boolean,
  ADD COLUMN IF NOT EXISTS notice_days integer,
  ADD COLUMN IF NOT EXISTS contract_signed_on date,
  ADD COLUMN IF NOT EXISTS contract_reference text;

CREATE TABLE IF NOT EXISTS public.launch_recurring_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL REFERENCES public.client_launches(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  pipeline_code text,
  monthly_inr numeric NOT NULL CHECK (monthly_inr > 0),
  starts_on date NOT NULL,
  ends_on date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (launch_id, name)
);
GRANT SELECT ON public.launch_recurring_fees TO authenticated;
GRANT ALL ON public.launch_recurring_fees TO service_role;
REVOKE ALL ON public.launch_recurring_fees FROM anon;
ALTER TABLE public.launch_recurring_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Commercial roles read recurring fees" ON public.launch_recurring_fees;
CREATE POLICY "Commercial roles read recurring fees" ON public.launch_recurring_fees
  FOR SELECT TO authenticated USING (public.can_view_commercials(auth.uid()));

-- Snapshot trigger: launch-level notice days win over plan defaults.
CREATE OR REPLACE FUNCTION public.client_launch_snapshot()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  pv public.plan_versions%ROWTYPE;
  cp public.custom_plans%ROWTYPE;
  v_notice_days integer;
BEGIN
  IF NEW.plan_version_id IS NULL AND NEW.plan_id IS NOT NULL AND NEW.custom_plan_id IS NULL THEN
    SELECT * INTO pv FROM public.plan_versions
    WHERE plan_id = NEW.plan_id AND status = 'active'
    ORDER BY version DESC LIMIT 1;
    IF pv.id IS NOT NULL THEN
      NEW.plan_version_id := pv.id;
      NEW.retainer_inr := COALESCE(NEW.retainer_inr, pv.monthly_retainer_inr);
      v_notice_days := pv.notice_days;
    END IF;
  END IF;

  IF NEW.custom_plan_id IS NOT NULL THEN
    SELECT * INTO cp FROM public.custom_plans WHERE id = NEW.custom_plan_id;
    IF cp.id IS NOT NULL THEN
      NEW.plan_version_id := COALESCE(NEW.plan_version_id, cp.base_plan_version_id);
      NEW.retainer_inr := COALESCE(NEW.retainer_inr, cp.monthly_retainer_inr);
      IF TG_OP = 'INSERT' OR NEW.custom_plan_id IS DISTINCT FROM OLD.custom_plan_id THEN
        NEW.commission_direct_pct := COALESCE(NEW.commission_direct_pct, cp.commission_direct_pct);
        NEW.commission_ota_pct := COALESCE(NEW.commission_ota_pct, cp.commission_ota_pct);
        NEW.commission_weddings_pct := COALESCE(NEW.commission_weddings_pct, cp.commission_weddings_pct);
        NEW.commission_other_pct := COALESCE(NEW.commission_other_pct, cp.commission_other_pct);
      END IF;
      NEW.setup_fee_inr := COALESCE(NEW.setup_fee_inr, cp.setup_fee_inr);
      NEW.snapshot_addon_ids := CASE WHEN array_length(NEW.snapshot_addon_ids,1) IS NULL THEN cp.addon_ids ELSE NEW.snapshot_addon_ids END;
      NEW.contract_start := COALESCE(NEW.contract_start, cp.contract_start);
      NEW.contract_end := COALESCE(NEW.contract_end, cp.contract_end);
      v_notice_days := COALESCE(cp.notice_days, (SELECT notice_days FROM public.plan_versions WHERE id = cp.base_plan_version_id));
    END IF;
  END IF;
  v_notice_days := COALESCE(NEW.notice_days, v_notice_days);

  IF NEW.contract_end IS NOT NULL
     AND (NEW.renewal_date IS NULL OR NEW.contract_end IS DISTINCT FROM OLD.contract_end
          OR NEW.notice_days IS DISTINCT FROM OLD.notice_days) THEN
    NEW.renewal_date := NEW.contract_end;
    NEW.notice_deadline := NEW.contract_end - COALESCE(v_notice_days,
      (SELECT notice_days FROM public.plan_versions WHERE id = NEW.plan_version_id), 0);
  END IF;

  IF NEW.status IN ('closed','completed','cancelled')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.closing_reason_code IS NULL THEN
    NEW.closing_reason_code := 'other';
  END IF;
  RETURN NEW;
END $function$;

-- Full terms snapshot of a launch (used for history old/new values).
CREATE OR REPLACE FUNCTION public._launch_terms(_launch_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    'recurring_fees', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'monthly_inr', f.monthly_inr,
                         'starts_on', f.starts_on, 'ends_on', f.ends_on) ORDER BY f.starts_on, f.name), '[]'::jsonb)
                       FROM public.launch_recurring_fees f WHERE f.launch_id = l.id))
  FROM public.client_launches l
  LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
  LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
  WHERE l.id = _launch_id
$function$;

CREATE OR REPLACE FUNCTION public.request_terms_change(_launch_id uuid, _terms jsonb, _reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l public.client_launches%ROWTYPE;
  v_mgr boolean := public.is_manager(auth.uid());
  v_id uuid;
  v_clean jsonb;
  k text;
BEGIN
  IF auth.uid() IS NULL OR NOT (v_mgr OR public.has_role(auth.uid(), 'bd_manager')) THEN
    RAISE EXCEPTION 'Only admin, management or BD can edit commercial terms';
  END IF;
  SELECT * INTO l FROM public.client_launches WHERE id = _launch_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF l.status NOT IN ('active','live','on_hold','draft','proposed','awaiting_day0') THEN
    RAISE EXCEPTION 'Closed launches keep their terms as history and cannot be edited';
  END IF;
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_clean
    FROM jsonb_each(coalesce(_terms, '{}'::jsonb))
   WHERE key IN ('retainer_inr','commission_direct_pct','commission_ota_pct','commission_weddings_pct',
                 'setup_fee_inr','contract_start','contract_end','notice_days',
                 'payment_cycle','billing_basis','invoice_day','due_day','late_interest_pct','min_term_months',
                 'annual_revision_applicable','team_incentive_pct','commission_reconcile_day',
                 'booking_advances_via_alcor','auto_renew','contract_signed_on','contract_reference',
                 'add_recurring_fee');
  FOR k IN SELECT key FROM jsonb_each(v_clean) WHERE key LIKE 'commission%pct' OR key IN ('late_interest_pct','team_incentive_pct') LOOP
    IF jsonb_typeof(v_clean->k) <> 'null' AND ((v_clean->>k)::numeric < 0 OR (v_clean->>k)::numeric > 100) THEN
      RAISE EXCEPTION 'Percentages must be between 0 and 100%%';
    END IF;
  END LOOP;
  FOR k IN SELECT key FROM jsonb_each(v_clean) WHERE key IN ('invoice_day','due_day','commission_reconcile_day') LOOP
    IF jsonb_typeof(v_clean->k) <> 'null' AND ((v_clean->>k)::int < 1 OR (v_clean->>k)::int > 31) THEN
      RAISE EXCEPTION 'Day of month must be between 1 and 31';
    END IF;
  END LOOP;
  IF v_clean ? 'billing_basis' AND jsonb_typeof(v_clean->'billing_basis') <> 'null'
     AND v_clean->>'billing_basis' NOT IN ('advance','postpaid') THEN
    RAISE EXCEPTION 'Billing basis must be advance or postpaid';
  END IF;
  IF v_clean ? 'payment_cycle' AND v_clean->>'payment_cycle' NOT IN ('monthly','quarterly','half_yearly','yearly') THEN
    RAISE EXCEPTION 'Unknown billing cycle';
  END IF;
  IF v_clean ? 'add_recurring_fee' AND (
       coalesce(btrim(v_clean->'add_recurring_fee'->>'name'), '') = ''
       OR coalesce((v_clean->'add_recurring_fee'->>'monthly_inr')::numeric, 0) <= 0) THEN
    RAISE EXCEPTION 'A recurring add-on needs a name and a monthly amount';
  END IF;
  IF v_clean = '{}'::jsonb THEN RAISE EXCEPTION 'Nothing to change'; END IF;
  IF EXISTS (SELECT 1 FROM public.commercial_term_changes WHERE launch_id = _launch_id AND status = 'pending') THEN
    RAISE EXCEPTION 'A change for this launch is already waiting for management approval';
  END IF;

  INSERT INTO public.commercial_term_changes (launch_id, client_id, old_terms, new_terms, reason, requested_by,
                                              decided_by, decided_at)
  VALUES (_launch_id, l.client_id, public._launch_terms(_launch_id), v_clean, _reason, auth.uid(),
          CASE WHEN v_mgr THEN auth.uid() END, CASE WHEN v_mgr THEN now() END)
  RETURNING id INTO v_id;

  IF v_mgr THEN PERFORM public._apply_term_change(v_id); END IF;
  PERFORM public.log_admin_action(auth.uid(), 'commercial_terms_' || CASE WHEN v_mgr THEN 'applied' ELSE 'requested' END,
    'client_launch', _launch_id::text, 'ok', jsonb_build_object('change_id', v_id, 'new_terms', v_clean));
  RETURN jsonb_build_object('id', v_id, 'status', CASE WHEN v_mgr THEN 'applied' ELSE 'pending' END);
END $function$;

CREATE OR REPLACE FUNCTION public._apply_term_change(_change_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ch public.commercial_term_changes%ROWTYPE;
  l public.client_launches%ROWTYPE;
  t jsonb;
  v_cp uuid;
  v_name text;
BEGIN
  SELECT * INTO ch FROM public.commercial_term_changes WHERE id = _change_id FOR UPDATE;
  SELECT * INTO l FROM public.client_launches WHERE id = ch.launch_id FOR UPDATE;
  t := ch.new_terms;
  v_cp := l.custom_plan_id;
  -- A standard-plan launch becomes a custom plan only when money terms change.
  IF v_cp IS NULL AND t ?| ARRAY['retainer_inr','commission_direct_pct','commission_ota_pct','commission_weddings_pct','setup_fee_inr'] THEN
    SELECT hotel_name INTO v_name FROM public.clients WHERE id = l.client_id;
    INSERT INTO public.custom_plans (base_plan_version_id, name, created_by, status, monthly_retainer_inr,
      commission_direct_pct, commission_ota_pct, commission_weddings_pct, commission_other_pct,
      setup_fee_inr, contract_start, contract_end, notes)
    VALUES (l.plan_version_id, v_name || ' — custom terms', ch.requested_by, 'active', l.retainer_inr,
      l.commission_direct_pct, l.commission_ota_pct, l.commission_weddings_pct, coalesce(l.commission_other_pct, 0),
      l.setup_fee_inr, l.contract_start, l.contract_end, 'Created from the standard plan when terms were edited')
    RETURNING id INTO v_cp;
    INSERT INTO public.custom_plan_services (custom_plan_id, service_name, scope, frequency, pipeline_code, included, sort_order)
    SELECT v_cp, s.service_name, s.scope, s.frequency, s.pipeline_code, s.included, s.sort_order
      FROM public.plan_services s WHERE s.plan_version_id = l.plan_version_id
    ON CONFLICT (custom_plan_id, service_name) DO NOTHING;
    UPDATE public.client_launches SET custom_plan_id = v_cp WHERE id = l.id;
  END IF;

  IF v_cp IS NOT NULL THEN
    UPDATE public.custom_plans SET
      monthly_retainer_inr = CASE WHEN t ? 'retainer_inr' THEN (t->>'retainer_inr')::numeric ELSE monthly_retainer_inr END,
      commission_direct_pct = CASE WHEN t ? 'commission_direct_pct' THEN (t->>'commission_direct_pct')::numeric ELSE commission_direct_pct END,
      commission_ota_pct = CASE WHEN t ? 'commission_ota_pct' THEN (t->>'commission_ota_pct')::numeric ELSE commission_ota_pct END,
      commission_weddings_pct = CASE WHEN t ? 'commission_weddings_pct' THEN (t->>'commission_weddings_pct')::numeric ELSE commission_weddings_pct END,
      setup_fee_inr = CASE WHEN t ? 'setup_fee_inr' THEN (t->>'setup_fee_inr')::numeric ELSE setup_fee_inr END,
      contract_start = CASE WHEN t ? 'contract_start' THEN (t->>'contract_start')::date ELSE contract_start END,
      contract_end = CASE WHEN t ? 'contract_end' THEN (t->>'contract_end')::date ELSE contract_end END,
      notice_days = CASE WHEN t ? 'notice_days' THEN (t->>'notice_days')::int ELSE notice_days END,
      payment_cycle = CASE WHEN t ? 'payment_cycle' THEN t->>'payment_cycle' ELSE payment_cycle END,
      updated_at = now()
    WHERE id = v_cp;
    UPDATE public.custom_plans SET approval_status = 'approved', approved_by = ch.decided_by, approved_at = now()
     WHERE id = v_cp AND approval_status <> 'approved';
  END IF;

  UPDATE public.client_launches SET
    retainer_inr = CASE WHEN t ? 'retainer_inr' THEN (t->>'retainer_inr')::numeric ELSE retainer_inr END,
    commission_direct_pct = CASE WHEN t ? 'commission_direct_pct' THEN (t->>'commission_direct_pct')::numeric ELSE commission_direct_pct END,
    commission_ota_pct = CASE WHEN t ? 'commission_ota_pct' THEN (t->>'commission_ota_pct')::numeric ELSE commission_ota_pct END,
    commission_weddings_pct = CASE WHEN t ? 'commission_weddings_pct' THEN (t->>'commission_weddings_pct')::numeric ELSE commission_weddings_pct END,
    setup_fee_inr = CASE WHEN t ? 'setup_fee_inr' THEN (t->>'setup_fee_inr')::numeric ELSE setup_fee_inr END,
    contract_start = CASE WHEN t ? 'contract_start' THEN (t->>'contract_start')::date ELSE contract_start END,
    contract_end = CASE WHEN t ? 'contract_end' THEN (t->>'contract_end')::date ELSE contract_end END,
    notice_days = CASE WHEN t ? 'notice_days' THEN (t->>'notice_days')::int ELSE notice_days END,
    payment_cycle = CASE WHEN t ? 'payment_cycle' THEN t->>'payment_cycle' ELSE payment_cycle END,
    billing_basis = CASE WHEN t ? 'billing_basis' THEN t->>'billing_basis' ELSE billing_basis END,
    invoice_day = CASE WHEN t ? 'invoice_day' THEN (t->>'invoice_day')::int ELSE invoice_day END,
    due_day = CASE WHEN t ? 'due_day' THEN (t->>'due_day')::int ELSE due_day END,
    late_interest_pct = CASE WHEN t ? 'late_interest_pct' THEN (t->>'late_interest_pct')::numeric ELSE late_interest_pct END,
    min_term_months = CASE WHEN t ? 'min_term_months' THEN (t->>'min_term_months')::int ELSE min_term_months END,
    annual_revision_applicable = CASE WHEN t ? 'annual_revision_applicable' THEN (t->>'annual_revision_applicable')::boolean ELSE annual_revision_applicable END,
    team_incentive_pct = CASE WHEN t ? 'team_incentive_pct' THEN (t->>'team_incentive_pct')::numeric ELSE team_incentive_pct END,
    commission_reconcile_day = CASE WHEN t ? 'commission_reconcile_day' THEN (t->>'commission_reconcile_day')::int ELSE commission_reconcile_day END,
    booking_advances_via_alcor = CASE WHEN t ? 'booking_advances_via_alcor' THEN (t->>'booking_advances_via_alcor')::boolean ELSE booking_advances_via_alcor END,
    auto_renew = CASE WHEN t ? 'auto_renew' THEN (t->>'auto_renew')::boolean ELSE auto_renew END,
    contract_signed_on = CASE WHEN t ? 'contract_signed_on' THEN (t->>'contract_signed_on')::date ELSE contract_signed_on END,
    contract_reference = CASE WHEN t ? 'contract_reference' THEN t->>'contract_reference' ELSE contract_reference END
  WHERE id = l.id;

  IF t ? 'add_recurring_fee' THEN
    INSERT INTO public.launch_recurring_fees (launch_id, client_id, name, pipeline_code, monthly_inr, starts_on, created_by)
    VALUES (l.id, l.client_id, btrim(t->'add_recurring_fee'->>'name'), t->'add_recurring_fee'->>'pipeline_code',
            (t->'add_recurring_fee'->>'monthly_inr')::numeric,
            coalesce((t->'add_recurring_fee'->>'starts_on')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
            ch.requested_by)
    ON CONFLICT (launch_id, name) DO UPDATE SET monthly_inr = EXCLUDED.monthly_inr, ends_on = NULL;
  END IF;

  UPDATE public.commercial_term_changes SET status = 'applied', decided_at = coalesce(decided_at, now()) WHERE id = ch.id;
END $function$;

-- Upgrade: the original two-argument call keeps working; with a start date it schedules
-- a proposed launch (custom terms/services optional, management only for custom terms).
DROP FUNCTION IF EXISTS public.start_upgrade(uuid, text);
CREATE OR REPLACE FUNCTION public.start_upgrade(_from_launch_id uuid, _to_plan_code text,
  _start_date date DEFAULT NULL, _terms jsonb DEFAULT NULL, _services jsonb DEFAULT NULL, _reason text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
      RAISE EXCEPTION 'An upgrade from this launch is already scheduled';
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
REVOKE ALL ON FUNCTION public.start_upgrade(uuid, text, date, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_upgrade(uuid, text, date, jsonb, jsonb, text) TO authenticated;

-- Daily step: activate scheduled upgrades whose start date has arrived (IST), close the predecessor
-- as "Upgraded" (not churn) and recalculate pipelines + assignments. Never acts before the start date.
CREATE OR REPLACE FUNCTION public.activate_due_upgrades(_today date DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0; v_today date := coalesce(_today, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  FOR r IN
    SELECT l.id, l.client_id, l.upgraded_from_launch_id AS from_id, l.contract_start
      FROM client_launches l
     WHERE l.status = 'proposed' AND l.upgraded_from_launch_id IS NOT NULL
       AND l.contract_start IS NOT NULL AND l.contract_start <= v_today
     ORDER BY l.contract_start, l.created_at
  LOOP
    UPDATE client_launches SET previous_status = status, status = 'closed', closing_reason_code = 'upgraded',
           closed_reason = 'Upgraded', closed_at = now(),
           contract_end = coalesce(contract_end, r.contract_start - 1)
     WHERE id = r.from_id AND status NOT IN ('closed','completed','cancelled');
    INSERT INTO launch_events (launch_id, user_id, kind, details)
    VALUES (r.from_id, NULL, 'closed', jsonb_build_object('reason_code', 'upgraded', 'upgraded_to', r.id));
    UPDATE client_launches SET previous_status = status, status = 'active', activated_at = coalesce(activated_at, now())
     WHERE id = r.id;
    INSERT INTO launch_events (launch_id, user_id, kind, details)
    VALUES (r.id, NULL, 'upgrade_activated', jsonb_build_object('from_launch', r.from_id, 'start', r.contract_start));
    PERFORM recalc_client_assignments(r.client_id, false);
    PERFORM recalc_client_assignments(c.id, false) FROM clients c WHERE c.parent_client_id = r.client_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.activate_due_upgrades(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_due_upgrades(date) TO service_role;

-- MRR = active retainers + recurring add-on fees in force today. Deposits/one-time fees excluded.
CREATE OR REPLACE FUNCTION public.finance_overview()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
        'id', c.id, 'hotel_name', c.hotel_name, 'is_test', c.is_test, 'parent_client_id', c.parent_client_id,
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
            'upgraded_from_launch_id', l.upgraded_from_launch_id
          ) ORDER BY l.created_at DESC), '[]'::jsonb)
          FROM public.client_launches l
          LEFT JOIN public.plans pl ON pl.id = l.plan_id
          LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
          LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
          WHERE l.client_id = c.id)
      ) ORDER BY c.hotel_name), '[]'::jsonb)
      FROM public.clients c));
END $function$;

-- Client commercials: full current terms, recurring add-ons and the plan history (oldest first).
CREATE OR REPLACE FUNCTION public.client_commercials(_client_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
      'deposit_inr', l.deposit_inr,
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
        'team_incentive_pct', h.team_incentive_pct,
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
