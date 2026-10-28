-- 1. Commission: NULL = "Not specified", 0 = confirmed 0%.
ALTER TABLE public.custom_plans ALTER COLUMN commission_direct_pct DROP NOT NULL;
ALTER TABLE public.custom_plans ALTER COLUMN commission_ota_pct DROP NOT NULL;
ALTER TABLE public.custom_plans ALTER COLUMN commission_weddings_pct DROP NOT NULL;
ALTER TABLE public.custom_plans ALTER COLUMN commission_direct_pct DROP DEFAULT;
ALTER TABLE public.custom_plans ALTER COLUMN commission_ota_pct DROP DEFAULT;
ALTER TABLE public.custom_plans ALTER COLUMN commission_weddings_pct DROP DEFAULT;
COMMENT ON COLUMN public.custom_plans.commission_direct_pct IS 'NULL = not specified; 0 = confirmed 0%';
COMMENT ON COLUMN public.client_launches.commission_direct_pct IS 'Source of truth for commission (active launch snapshot). NULL = not specified; 0 = confirmed 0%';

CREATE OR REPLACE FUNCTION public.client_launch_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  IF NEW.contract_end IS NOT NULL
     AND (NEW.renewal_date IS NULL OR NEW.contract_end IS DISTINCT FROM OLD.contract_end) THEN
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

CREATE TABLE IF NOT EXISTS public.client_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'contract_flag' CHECK (kind IN ('contract_flag','commission_pending','upgrade_pending','other')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  source text,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, kind, message)
);
GRANT SELECT, UPDATE ON public.client_review_items TO authenticated;
GRANT ALL ON public.client_review_items TO service_role;
ALTER TABLE public.client_review_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review items read" ON public.client_review_items;
CREATE POLICY "review items read" ON public.client_review_items FOR SELECT TO authenticated
  USING (public.can_view_commercials(auth.uid()) OR public.is_client_am(client_id));
DROP POLICY IF EXISTS "review items resolve" ON public.client_review_items;
CREATE POLICY "review items resolve" ON public.client_review_items FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.commercial_term_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL REFERENCES public.client_launches(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  old_terms jsonb NOT NULL,
  new_terms jsonb NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_term_changes_launch_idx ON public.commercial_term_changes(launch_id);
GRANT SELECT ON public.commercial_term_changes TO authenticated;
GRANT ALL ON public.commercial_term_changes TO service_role;
ALTER TABLE public.commercial_term_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "term changes read" ON public.commercial_term_changes;
CREATE POLICY "term changes read" ON public.commercial_term_changes FOR SELECT TO authenticated
  USING (public.can_view_commercials(auth.uid()));

CREATE OR REPLACE FUNCTION public._launch_terms(_launch_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'retainer_inr', l.retainer_inr,
    'commission_direct_pct', l.commission_direct_pct,
    'commission_ota_pct', l.commission_ota_pct,
    'commission_weddings_pct', l.commission_weddings_pct,
    'setup_fee_inr', l.setup_fee_inr,
    'contract_start', l.contract_start,
    'contract_end', l.contract_end,
    'notice_days', cp.notice_days)
  FROM public.client_launches l LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
  WHERE l.id = _launch_id
$$;
REVOKE ALL ON FUNCTION public._launch_terms(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._apply_term_change(_change_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  IF v_cp IS NULL THEN
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

  UPDATE public.custom_plans SET
    monthly_retainer_inr = CASE WHEN t ? 'retainer_inr' THEN (t->>'retainer_inr')::numeric ELSE monthly_retainer_inr END,
    commission_direct_pct = CASE WHEN t ? 'commission_direct_pct' THEN (t->>'commission_direct_pct')::numeric ELSE commission_direct_pct END,
    commission_ota_pct = CASE WHEN t ? 'commission_ota_pct' THEN (t->>'commission_ota_pct')::numeric ELSE commission_ota_pct END,
    commission_weddings_pct = CASE WHEN t ? 'commission_weddings_pct' THEN (t->>'commission_weddings_pct')::numeric ELSE commission_weddings_pct END,
    setup_fee_inr = CASE WHEN t ? 'setup_fee_inr' THEN (t->>'setup_fee_inr')::numeric ELSE setup_fee_inr END,
    contract_start = CASE WHEN t ? 'contract_start' THEN (t->>'contract_start')::date ELSE contract_start END,
    contract_end = CASE WHEN t ? 'contract_end' THEN (t->>'contract_end')::date ELSE contract_end END,
    notice_days = CASE WHEN t ? 'notice_days' THEN (t->>'notice_days')::int ELSE notice_days END,
    updated_at = now()
  WHERE id = v_cp;
  UPDATE public.custom_plans SET approval_status = 'approved', approved_by = ch.decided_by, approved_at = now()
   WHERE id = v_cp AND approval_status <> 'approved';

  UPDATE public.client_launches SET
    retainer_inr = CASE WHEN t ? 'retainer_inr' THEN (t->>'retainer_inr')::numeric ELSE retainer_inr END,
    commission_direct_pct = CASE WHEN t ? 'commission_direct_pct' THEN (t->>'commission_direct_pct')::numeric ELSE commission_direct_pct END,
    commission_ota_pct = CASE WHEN t ? 'commission_ota_pct' THEN (t->>'commission_ota_pct')::numeric ELSE commission_ota_pct END,
    commission_weddings_pct = CASE WHEN t ? 'commission_weddings_pct' THEN (t->>'commission_weddings_pct')::numeric ELSE commission_weddings_pct END,
    setup_fee_inr = CASE WHEN t ? 'setup_fee_inr' THEN (t->>'setup_fee_inr')::numeric ELSE setup_fee_inr END,
    contract_start = CASE WHEN t ? 'contract_start' THEN (t->>'contract_start')::date ELSE contract_start END,
    contract_end = CASE WHEN t ? 'contract_end' THEN (t->>'contract_end')::date ELSE contract_end END
  WHERE id = l.id;

  UPDATE public.commercial_term_changes SET status = 'applied', decided_at = coalesce(decided_at, now()) WHERE id = ch.id;
END $$;
REVOKE ALL ON FUNCTION public._apply_term_change(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_terms_change(_launch_id uuid, _terms jsonb, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
                 'setup_fee_inr','contract_start','contract_end','notice_days');
  FOR k IN SELECT key FROM jsonb_each(v_clean) WHERE key LIKE 'commission%' LOOP
    IF jsonb_typeof(v_clean->k) <> 'null' AND ((v_clean->>k)::numeric < 0 OR (v_clean->>k)::numeric > 100) THEN
      RAISE EXCEPTION 'Commission must be between 0 and 100%%';
    END IF;
  END LOOP;
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
END $$;
REVOKE ALL ON FUNCTION public.request_terms_change(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_terms_change(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_terms_change(_change_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ch public.commercial_term_changes%ROWTYPE;
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only management or admin can approve commercial terms'; END IF;
  SELECT * INTO ch FROM public.commercial_term_changes WHERE id = _change_id;
  IF ch.id IS NULL OR ch.status <> 'pending' THEN RAISE EXCEPTION 'This change is no longer pending'; END IF;
  UPDATE public.commercial_term_changes
     SET decided_by = auth.uid(), decided_at = now(), decision_note = _note,
         status = CASE WHEN _approve THEN status ELSE 'rejected' END
   WHERE id = _change_id;
  IF _approve THEN PERFORM public._apply_term_change(_change_id); END IF;
  PERFORM public.log_admin_action(auth.uid(), CASE WHEN _approve THEN 'commercial_terms_approved' ELSE 'commercial_terms_rejected' END,
    'client_launch', ch.launch_id::text, 'ok', jsonb_build_object('change_id', _change_id, 'note', _note));
END $$;
REVOKE ALL ON FUNCTION public.decide_terms_change(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_terms_change(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalc_client_assignments(_client_id uuid, _reset_manual boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_launch public.client_launches%ROWTYPE;
  v_parent uuid;
  v_svc record;
  v_pipeline_id uuid;
  v_pids uuid[] := '{}';
  v_unmatched text[] := '{}';
  v_count int;
BEGIN
  SELECT * INTO v_launch FROM public.client_launches
   WHERE client_id = _client_id AND status IN ('active','live')
   ORDER BY created_at DESC LIMIT 1;
  IF v_launch.id IS NULL THEN
    SELECT parent_client_id INTO v_parent FROM public.clients WHERE id = _client_id;
    IF v_parent IS NOT NULL THEN
      SELECT * INTO v_launch FROM public.client_launches
       WHERE client_id = v_parent AND status IN ('active','live')
       ORDER BY created_at DESC LIMIT 1;
    END IF;
  END IF;

  IF v_launch.id IS NULL THEN
    DELETE FROM public.client_staff_assignments WHERE client_id = _client_id;
    RETURN jsonb_build_object('client_id', _client_id, 'assigned', 0, 'unmatched', '[]'::jsonb, 'launch', null);
  END IF;

  IF _reset_manual THEN
    DELETE FROM public.client_staff_assignments WHERE client_id = _client_id;
  ELSE
    DELETE FROM public.client_staff_assignments WHERE client_id = _client_id AND source = 'auto';
  END IF;

  FOR v_svc IN
    SELECT s.service_name, s.pipeline_code FROM public.custom_plan_services s
     WHERE v_launch.custom_plan_id IS NOT NULL AND s.custom_plan_id = v_launch.custom_plan_id AND s.included
    UNION ALL
    SELECT s.service_name, s.pipeline_code FROM public.plan_services s
     WHERE v_launch.custom_plan_id IS NULL AND s.plan_version_id = v_launch.plan_version_id AND s.included
  LOOP
    SELECT id INTO v_pipeline_id FROM public.pipelines WHERE code = v_svc.pipeline_code AND active;
    IF v_pipeline_id IS NULL THEN
      v_unmatched := v_unmatched || v_svc.pipeline_code;
      CONTINUE;
    END IF;
    IF NOT v_pipeline_id = ANY(v_pids) THEN v_pids := v_pids || v_pipeline_id; END IF;
    INSERT INTO public.client_staff_assignments
      (client_id, user_id, pipeline_id, role, source, matched_service, source_launch_id, last_calculated_at)
    SELECT _client_id, pm.user_id, v_pipeline_id, pm.role, 'auto', v_svc.service_name, v_launch.id, now()
      FROM public.pipeline_members pm
     WHERE pm.pipeline_id = v_pipeline_id AND pm.active
    ON CONFLICT (client_id, user_id, pipeline_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.client_pipelines (client_id, pipeline_id, status, start_date)
  SELECT _client_id, pid, 'active', coalesce(v_launch.day0_date, v_launch.contract_start)
    FROM unnest(v_pids) AS pid
  ON CONFLICT (client_id, pipeline_id) DO UPDATE
    SET status = 'active' WHERE public.client_pipelines.status = 'ended';
  UPDATE public.client_pipelines SET status = 'ended'
   WHERE client_id = _client_id AND status <> 'ended' AND NOT (pipeline_id = ANY(v_pids));

  IF array_length(v_unmatched, 1) IS NOT NULL THEN
    UPDATE public.client_launches
       SET import_flags = coalesce(import_flags, '{}'::jsonb)
           || jsonb_build_object('unmatched_services', to_jsonb(v_unmatched))
     WHERE id = v_launch.id;
  END IF;

  UPDATE public.client_pipelines cp
     SET manager_id = (SELECT pm.user_id FROM public.pipeline_members pm
                        WHERE pm.pipeline_id = cp.pipeline_id AND pm.role = 'head' AND pm.active
                        ORDER BY pm.created_at LIMIT 1)
   WHERE cp.client_id = _client_id
     AND cp.manager_id IS DISTINCT FROM (SELECT pm.user_id FROM public.pipeline_members pm
                        WHERE pm.pipeline_id = cp.pipeline_id AND pm.role = 'head' AND pm.active
                        ORDER BY pm.created_at LIMIT 1);

  SELECT count(*) INTO v_count FROM public.client_staff_assignments
   WHERE client_id = _client_id AND NOT excluded;
  RETURN jsonb_build_object('client_id', _client_id, 'assigned', v_count,
                            'unmatched', to_jsonb(v_unmatched), 'launch', v_launch.id,
                            'pipelines', coalesce(array_length(v_pids, 1), 0));
END
$function$;

CREATE OR REPLACE FUNCTION public.client_commercials(_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  l public.client_launches%ROWTYPE;
  v_parent uuid;
  v_inherited boolean := false;
BEGIN
  IF NOT (public.can_view_commercials(auth.uid()) OR public.is_client_am(_client_id)) THEN
    RAISE EXCEPTION 'Commercial roles only';
  END IF;
  SELECT * INTO l FROM public.client_launches
   WHERE client_id = _client_id AND status IN ('active','live','on_hold')
   ORDER BY (status IN ('active','live')) DESC, created_at DESC LIMIT 1;
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
    'launch', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', l.id, 'status', l.status, 'inherited_from_parent', v_inherited,
      'plan_name', coalesce((SELECT name FROM public.custom_plans WHERE id = l.custom_plan_id),
                            (SELECT name FROM public.plans WHERE id = l.plan_id)),
      'base_plan_name', (SELECT name FROM public.plans WHERE id = l.plan_id),
      'is_custom', l.custom_plan_id IS NOT NULL,
      'approval_status', (SELECT approval_status FROM public.custom_plans WHERE id = l.custom_plan_id),
      'retainer_inr', l.retainer_inr,
      'commission_direct_pct', l.commission_direct_pct,
      'commission_ota_pct', l.commission_ota_pct,
      'commission_weddings_pct', l.commission_weddings_pct,
      'setup_fee_inr', l.setup_fee_inr,
      'deposit_inr', l.deposit_inr,
      'contract_start', l.contract_start, 'contract_end', l.contract_end,
      'renewal_date', l.renewal_date, 'notice_deadline', l.notice_deadline,
      'notice_days', (SELECT notice_days FROM public.custom_plans WHERE id = l.custom_plan_id),
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
    'term_changes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'status', c.status, 'old_terms', c.old_terms, 'new_terms', c.new_terms,
        'reason', c.reason, 'created_at', c.created_at, 'decided_at', c.decided_at,
        'requested_by', (SELECT full_name FROM public.profiles WHERE id = c.requested_by),
        'decided_by', (SELECT full_name FROM public.profiles WHERE id = c.decided_by)) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM public.commercial_term_changes c WHERE c.launch_id = l.id),
    'review_items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'message', r.message, 'status', r.status)
                                ORDER BY r.kind DESC, r.created_at), '[]'::jsonb)
      FROM public.client_review_items r WHERE r.client_id = _client_id AND r.status = 'open'));
END $$;
REVOKE ALL ON FUNCTION public.client_commercials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_commercials(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_terms_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.can_view_commercials(auth.uid()) THEN RAISE EXCEPTION 'Commercial roles only'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'client_id', c.id, 'hotel_name', c.hotel_name, 'launch_id', l.id, 'status', l.status,
      'plan_name', coalesce(cp.name, pl.name), 'base_plan_name', pl.name, 'is_custom', l.custom_plan_id IS NOT NULL,
      'retainer_inr', l.retainer_inr,
      'commission_direct_pct', l.commission_direct_pct,
      'commission_ota_pct', l.commission_ota_pct,
      'commission_weddings_pct', l.commission_weddings_pct,
      'open_flags', (SELECT count(*) FROM public.client_review_items r WHERE r.client_id = c.id AND r.status = 'open'),
      'commission_pending', EXISTS (SELECT 1 FROM public.client_review_items r
                                     WHERE r.client_id = c.id AND r.status = 'open' AND r.kind = 'commission_pending'))
      ORDER BY c.hotel_name), '[]'::jsonb)
    FROM public.client_launches l
    JOIN public.clients c ON c.id = l.client_id
    LEFT JOIN public.plans pl ON pl.id = l.plan_id
    LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
    WHERE l.status IN ('active','live') AND NOT c.is_test);
END $$;
REVOKE ALL ON FUNCTION public.commercial_terms_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_terms_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.can_view_commercials(auth.uid()) THEN RAISE EXCEPTION 'Commercial roles only'; END IF;
  RETURN jsonb_build_object(
    'mrr', (
      SELECT coalesce(sum(l.retainer_inr), 0)
      FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id
      WHERE l.status IN ('active','live') AND NOT c.is_test),
    'clients', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'hotel_name', c.hotel_name,
        'is_test', c.is_test,
        'parent_client_id', c.parent_client_id,
        'account_manager', (SELECT p.full_name FROM public.profiles p WHERE p.id = c.account_manager_id),
        'review_items', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'message', r.message) ORDER BY r.kind DESC, r.created_at), '[]'::jsonb)
                           FROM public.client_review_items r WHERE r.client_id = c.id AND r.status = 'open'),
        'launches', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id,
            'status', l.status,
            'plan_name', coalesce(cp.name, pl.name),
            'base_plan_name', pl.name,
            'plan_code', pl.code,
            'is_custom', l.custom_plan_id IS NOT NULL,
            'retainer_inr', l.retainer_inr,
            'commission_direct_pct', l.commission_direct_pct,
            'commission_ota_pct', l.commission_ota_pct,
            'commission_weddings_pct', l.commission_weddings_pct,
            'commission_other_pct', l.commission_other_pct,
            'setup_fee_inr', l.setup_fee_inr,
            'deposit_inr', l.deposit_inr,
            'advance_amount', l.advance_amount,
            'payment_reference', l.payment_reference,
            'addons', (
              SELECT coalesce(jsonb_agg(a.name), '[]'::jsonb)
              FROM public.addons_catalogue a WHERE a.id = ANY(coalesce(l.snapshot_addon_ids, '{}'))),
            'contract_start', l.contract_start,
            'contract_end', l.contract_end,
            'renewal_date', l.renewal_date,
            'notice_deadline', l.notice_deadline,
            'closing_reason_code', l.closing_reason_code,
            'closed_at', l.closed_at
          ) ORDER BY l.created_at DESC), '[]'::jsonb)
          FROM public.client_launches l
          LEFT JOIN public.plans pl ON pl.id = l.plan_id
          LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
          WHERE l.client_id = c.id)
      ) ORDER BY c.hotel_name), '[]'::jsonb)
      FROM public.clients c));
END;
$function$;

DO $do$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.access_overview'::regproc) INTO src;
  IF position('client_review_items' IN src) = 0 THEN
    src := replace(src,
      $$              SELECT 'Unmatched services'$$,
      $$              SELECT 'Review: ' || r.message
              FROM public.client_review_items r JOIN public.clients c ON c.id = r.client_id
              WHERE (c.id = p.client_id OR c.parent_client_id = p.client_id) AND r.status = 'open'
              UNION ALL
              SELECT 'Unmatched services'$$);
    EXECUTE src;
  END IF;
END
$do$;