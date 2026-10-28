
-- ===== Helpers =====
CREATE OR REPLACE FUNCTION public.is_client_am(_client_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_module_assignments a
    WHERE a.client_id = _client_id AND a.module_code = 'AM'
      AND (a.primary_user_id = auth.uid() OR a.backup_user_id = auth.uid()));
$$;

-- Full hotel view: management, BD, the hotel's Account Manager (staff only).
CREATE OR REPLACE FUNCTION public.can_view_client_full(_client_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(auth.uid()) AND (
    public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager') OR public.is_client_am(_client_id));
$$;

-- One pipeline of one hotel (staff only).
CREATE OR REPLACE FUNCTION public.can_view_pipeline(_client_pipeline_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_pipelines cp
    WHERE cp.id = _client_pipeline_id
      AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()
           OR public.can_view_client_full(cp.client_id)));
$$;

CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_tasks t
    WHERE t.id = _task_id AND (
      t.assignee_id = auth.uid() OR t.backup_id = auth.uid()
      OR public.can_view_client_full(t.client_id)
      OR EXISTS (SELECT 1 FROM public.client_module_assignments a
        WHERE a.launch_id = t.launch_id AND a.module_code = t.module_code
          AND (a.primary_user_id = auth.uid() OR a.backup_user_id = auth.uid()))));
$$;

CREATE OR REPLACE FUNCTION public.can_view_action(_client_id uuid, _pipeline_id uuid, _responsible uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(auth.uid()) AND (
    _responsible = auth.uid()
    OR public.can_view_client_full(_client_id)
    OR (_pipeline_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.client_pipelines cp
          WHERE cp.client_id = _client_id AND cp.pipeline_id = _pipeline_id
            AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()))));
$$;

-- Reports: owners see approved only; staff per pipeline.
CREATE OR REPLACE FUNCTION public.can_view_report(_client_id uuid, _client_pipeline_id uuid, _status report_status) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.my_client_id() = _client_id THEN _status = 'approved'
    ELSE public.can_view_pipeline(_client_pipeline_id) END;
$$;

-- Owner's Account Manager contact.
CREATE OR REPLACE FUNCTION public.get_my_alcor_contact()
RETURNS TABLE(full_name text, email text, mobile text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.full_name, p.email, p.mobile
  FROM public.client_module_assignments a
  JOIN public.client_launches l ON l.id = a.launch_id
  JOIN public.profiles p ON p.id = a.primary_user_id
  WHERE public.my_client_id() IS NOT NULL AND a.client_id = public.my_client_id()
    AND a.module_code = 'AM' AND l.status <> 'draft'
  ORDER BY (l.status = 'closed'), l.created_at DESC
  LIMIT 1;
$$;

-- GBP files: GBP pipeline managers/backups (+ AM), owner, BD, management.
CREATE OR REPLACE FUNCTION public.can_read_client_file(_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _parts text[] := storage.foldername(_name); _cid uuid;
BEGIN
  IF public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager') THEN RETURN true; END IF;
  IF _parts[1] <> 'gbp' THEN RETURN false; END IF;
  BEGIN _cid := _parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.my_client_id() = _cid OR public.can_view_client_full(_cid)
    OR EXISTS (SELECT 1 FROM public.client_pipelines cp JOIN public.pipelines pl ON pl.id = cp.pipeline_id
      WHERE cp.client_id = _cid AND pl.code = 'gbp' AND public.is_staff(auth.uid())
        AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()));
END $$;

-- ===== SELECT policies =====
DROP POLICY IF EXISTS "cp read" ON public.client_pipelines;
CREATE POLICY "cp read" ON public.client_pipelines FOR SELECT TO authenticated
  USING (public.my_client_id() = client_id OR public.can_view_pipeline(id));

DROP POLICY IF EXISTS "weekly_select" ON public.weekly_kpi_entries;
CREATE POLICY "weekly_select" ON public.weekly_kpi_entries FOR SELECT TO authenticated
  USING (public.can_view_pipeline(client_pipeline_id));

DROP POLICY IF EXISTS "social_select" ON public.social_kpi_entries;
CREATE POLICY "social_select" ON public.social_kpi_entries FOR SELECT TO authenticated
  USING (public.can_view_pipeline(client_pipeline_id));

DROP POLICY IF EXISTS "gbp_kpi_select" ON public.gbp_kpi_entries;
CREATE POLICY "gbp_kpi_select" ON public.gbp_kpi_entries FOR SELECT TO authenticated
  USING (public.can_view_pipeline(client_pipeline_id));

DROP POLICY IF EXISTS "gbp_goal_select" ON public.gbp_monthly_goals;
CREATE POLICY "gbp_goal_select" ON public.gbp_monthly_goals FOR SELECT TO authenticated
  USING (public.can_view_pipeline(client_pipeline_id));

DROP POLICY IF EXISTS "gbp_report_select" ON public.gbp_reports;
CREATE POLICY "gbp_report_select" ON public.gbp_reports FOR SELECT TO authenticated
  USING (public.my_client_id() = client_id OR public.can_view_pipeline(client_pipeline_id));

DROP POLICY IF EXISTS "ota read" ON public.ota_records;
CREATE POLICY "ota read" ON public.ota_records FOR SELECT TO authenticated
  USING (((report_id IS NOT NULL) AND public.is_staff(auth.uid()) AND public.report_visible(report_id))
      OR ((client_pipeline_id IS NOT NULL) AND public.can_view_pipeline(client_pipeline_id)));

DROP POLICY IF EXISTS "pke staff read" ON public.pipeline_kpi_entries;
CREATE POLICY "pke staff read" ON public.pipeline_kpi_entries FOR SELECT TO authenticated
  USING (public.can_view_pipeline(client_pipeline_id));

DROP POLICY IF EXISTS "targets read" ON public.client_kpi_targets;
CREATE POLICY "targets read" ON public.client_kpi_targets FOR SELECT TO authenticated
  USING (public.can_view_pipeline(client_pipeline_id)
    OR EXISTS (SELECT 1 FROM public.client_pipelines cp
      WHERE cp.id = client_kpi_targets.client_pipeline_id AND cp.client_id = public.my_client_id()));

DROP POLICY IF EXISTS "actions read" ON public.action_items;
CREATE POLICY "actions read" ON public.action_items FOR SELECT TO authenticated
  USING (public.can_view_action(client_id, pipeline_id, responsible_id));
DROP POLICY IF EXISTS "actions write" ON public.action_items;
CREATE POLICY "actions write" ON public.action_items FOR ALL TO authenticated
  USING (public.can_view_action(client_id, pipeline_id, responsible_id))
  WITH CHECK (public.can_view_action(client_id, pipeline_id, responsible_id));

DROP POLICY IF EXISTS "task_read" ON public.client_tasks;
CREATE POLICY "task_read" ON public.client_tasks FOR SELECT TO authenticated
  USING (public.can_view_task(id));

DROP POLICY IF EXISTS "activity_read" ON public.task_activity;
CREATE POLICY "activity_read" ON public.task_activity FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));
DROP POLICY IF EXISTS "activity_insert" ON public.task_activity;
CREATE POLICY "activity_insert" ON public.task_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_task(task_id));

DROP POLICY IF EXISTS "notes read" ON public.internal_notes;
CREATE POLICY "notes read" ON public.internal_notes FOR SELECT TO authenticated
  USING (public.can_view_client_full(client_id));
DROP POLICY IF EXISTS "notes write" ON public.internal_notes;
CREATE POLICY "notes write" ON public.internal_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_client_full(client_id));

DROP POLICY IF EXISTS "docs read" ON public.documents;
CREATE POLICY "docs read" ON public.documents FOR SELECT TO authenticated
  USING (public.can_view_client_full(client_id));

DROP POLICY IF EXISTS "assets viewable" ON public.client_assets;
CREATE POLICY "assets viewable" ON public.client_assets FOR SELECT TO authenticated
  USING (public.can_view_client_full(client_id));

DROP POLICY IF EXISTS "checklist viewable" ON public.client_checklist_items;
CREATE POLICY "checklist viewable" ON public.client_checklist_items FOR SELECT TO authenticated
  USING (public.can_view_client_full(client_id));

DROP POLICY IF EXISTS "audit viewable" ON public.onboarding_audit_log;
CREATE POLICY "audit viewable" ON public.onboarding_audit_log FOR SELECT TO authenticated
  USING (public.can_view_client_full(client_id));

DROP POLICY IF EXISTS "profiles staff read" ON public.profiles;
CREATE POLICY "profiles staff read" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND (client_id IS NULL OR public.can_view_client(client_id)));

-- ===== Function hardening =====
CREATE OR REPLACE FUNCTION public.create_monthly_reports(_month date DEFAULT (date_trunc('month', now()) - interval '1 month')::date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; m date := date_trunc('month',_month)::date;
BEGIN
 IF coalesce(current_setting('role', true),'none') IN ('authenticated','anon') AND NOT is_manager(auth.uid()) THEN
   RAISE EXCEPTION 'Management only';
 END IF;
 INSERT INTO monthly_reports (client_id, client_pipeline_id, month, status, created_by)
 SELECT cp.client_id, cp.id, m, 'draft', cp.manager_id
  FROM client_pipelines cp
 WHERE cp.status = 'active' AND cp.manager_id IS NOT NULL
  AND coalesce(cp.start_date, m) < (m + interval '1 month')::date
  AND EXISTS (SELECT 1 FROM kpi_definitions k WHERE k.pipeline_id = cp.pipeline_id AND k.active)
 ON CONFLICT (client_pipeline_id, month) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 INSERT INTO notifications (user_id, title, body, link)
 SELECT r.created_by, 'Monthly reports opened', count(*) || ' report(s) for ' || to_char(m,'Mon YYYY') || ' are due by ' || to_char(max(r.due_date),'DD Mon'), '/reports'
  FROM monthly_reports r WHERE r.month = m AND r.status='draft' AND r.created_at > now() - interval '5 minutes' AND r.created_by IS NOT NULL
 GROUP BY r.created_by;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_report_kpis(_report_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF coalesce(current_setting('role', true),'none') IN ('authenticated','anon') AND NOT public.report_editable(_report_id) THEN
   RAISE EXCEPTION 'This report is locked or you cannot edit it';
 END IF;
 RETURN public._refresh_report_kpis(_report_id);
END $$;

CREATE OR REPLACE FUNCTION public.hotel_scorecard(_client_id uuid, _month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m0 date := date_trunc('month',_month)::date; is_owner boolean := coalesce(my_client_id() = _client_id, false); res jsonb;
BEGIN
 IF NOT (is_owner OR (is_staff(auth.uid()) AND can_view_client(_client_id))) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 WITH r AS (
  SELECT r.id, r.status, pl.code, pl.name, coalesce(cp.weight, pl.default_weight, 1) wt
   FROM monthly_reports r JOIN client_pipelines cp ON cp.id=r.client_pipeline_id JOIN pipelines pl ON pl.id=cp.pipeline_id
  WHERE r.client_id=_client_id AND r.month=m0
    AND (r.status='approved' OR (NOT is_owner AND r.status <> 'draft'))
    AND (is_owner OR can_view_pipeline(cp.id))
 ), p AS (
  SELECT r.code, r.name, r.status, r.wt,
   round(avg(e.achievement_pct),1) score,
   jsonb_agg(jsonb_build_object('kpi',k.name,'definition',k.definition,'unit',k.unit,'direction',k.direction,
    'target',e.target,'actual',e.actual,'achievement',e.achievement_pct,
    'red_reason',e.red_reason,'corrective_action',e.corrective_action) ORDER BY k.sort_order) kpis
  FROM r JOIN kpi_entries e ON e.report_id=r.id JOIN kpi_definitions k ON k.id=e.kpi_definition_id
  GROUP BY r.code, r.name, r.status, r.wt
 )
 SELECT jsonb_build_object(
  'month', m0,
  'overall', (SELECT round(sum(score*wt)/nullif(sum(wt) FILTER (WHERE score IS NOT NULL),0),1) FROM p WHERE score IS NOT NULL),
  'band', NULL,
  'pipelines', coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'status',status,'weight',wt,'score',score,'kpis',kpis) ORDER BY name),'[]'))
 INTO res FROM p;
 res := jsonb_set(res, '{band}', to_jsonb(CASE WHEN (res->>'overall') IS NULL THEN NULL
      WHEN (res->>'overall')::numeric >= 90 THEN 'green' WHEN (res->>'overall')::numeric >= 70 THEN 'amber' ELSE 'red' END));
 RETURN res;
END $$;

-- ===== EXECUTE grants =====
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f' LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN (
             'escalate_overdue_tasks','remind_client_approvals','remind_report_deadlines','_refresh_report_kpis',
             'kpi_source_value','kpi_target_for','report_after_insert','report_set_due','report_submit_guard',
             'client_task_after','client_task_guard','gate_ready_notify','kpi_source_changed','guard_last_admin',
             'kpi_entry_compute','kpi_approval_guard','handle_new_user','guard_profile_self_update','set_updated_at') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.setup_required() TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
