-- 1. Pipelines: client_facing flag, final catalogue, merge b2b into email_marketing
ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS client_facing boolean NOT NULL DEFAULT false;

INSERT INTO public.pipelines (code, name, icon, sort_order, active, client_facing)
SELECT v.code, v.name, 'layers', v.so, true, v.cf FROM (VALUES
  ('website_seo','Website SEO',2,true),
  ('marketing_funnel','Marketing Funnel Development',8,true),
  ('business_development','Business Development',11,false)
) AS v(code,name,so,cf)
WHERE NOT EXISTS (SELECT 1 FROM public.pipelines p WHERE p.code = v.code);

UPDATE public.pipelines SET name='GMB SEO', client_facing=true, sort_order=1, active=true WHERE code='gbp';
UPDATE public.pipelines SET name='Website SEO', client_facing=true, sort_order=2, active=true WHERE code='website_seo';
UPDATE public.pipelines SET name='Influencer Marketing', client_facing=true, sort_order=3, active=true WHERE code='influencer';
UPDATE public.pipelines SET name='Social Media Marketing', client_facing=true, sort_order=4, active=true WHERE code='social_media';
UPDATE public.pipelines SET name='Performance Marketing', client_facing=true, sort_order=5, active=true WHERE code='performance_marketing';
UPDATE public.pipelines SET name='Email Marketing', client_facing=true, sort_order=6, active=true WHERE code='email_marketing';
UPDATE public.pipelines SET name='WhatsApp Marketing', client_facing=true, sort_order=7, active=true WHERE code='whatsapp';
UPDATE public.pipelines SET name='Marketing Funnel Development', client_facing=true, sort_order=8, active=true WHERE code='marketing_funnel';
UPDATE public.pipelines SET name='OTA Marketing', client_facing=true, sort_order=9, active=true WHERE code='ota';
UPDATE public.pipelines SET name='Corporate Design and Communication', client_facing=false, sort_order=10, active=true WHERE code='corporate_comms';
UPDATE public.pipelines SET name='Business Development', client_facing=false, sort_order=11, active=true WHERE code='business_development';
UPDATE public.pipelines SET name='Reservation Desk', client_facing=false, sort_order=12, active=true WHERE code='reservations_desk';

-- Merge b2b into email_marketing (rows move; b2b is then retired, never deleted)
UPDATE public.client_pipelines cp SET pipeline_id = em.id
FROM public.pipelines em, public.pipelines b
WHERE em.code='email_marketing' AND b.code='b2b' AND cp.pipeline_id = b.id
  AND NOT EXISTS (SELECT 1 FROM public.client_pipelines x WHERE x.client_id = cp.client_id AND x.pipeline_id = em.id);
UPDATE public.kpi_definitions k SET pipeline_id = em.id
FROM public.pipelines em, public.pipelines b
WHERE em.code='email_marketing' AND b.code='b2b' AND k.pipeline_id = b.id;
UPDATE public.client_tasks SET module_code='email_marketing' WHERE module_code='b2b';
UPDATE public.checklist_templates SET module_code='email_marketing' WHERE module_code='b2b';
UPDATE public.action_items a SET pipeline_id = em.id FROM public.pipelines em, public.pipelines b
WHERE em.code='email_marketing' AND b.code='b2b' AND a.pipeline_id = b.id;
UPDATE public.client_questions q SET pipeline_id = em.id FROM public.pipelines em, public.pipelines b
WHERE em.code='email_marketing' AND b.code='b2b' AND q.pipeline_id = b.id;
UPDATE public.pipelines SET active=false, client_facing=false WHERE code='b2b';

-- 2. Pipeline membership + vendors (tables before the helper functions that read them)
CREATE TABLE IF NOT EXISTS public.pipeline_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('head','team_member')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto','manual')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pipeline_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_members TO authenticated;
GRANT ALL ON public.pipeline_members TO service_role;
ALTER TABLE public.pipeline_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pipeline_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_vendors TO authenticated;
GRANT ALL ON public.pipeline_vendors TO service_role;
ALTER TABLE public.pipeline_vendors ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pipeline_activation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','activated','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS par_one_pending ON public.pipeline_activation_requests (client_id, pipeline_id) WHERE status='pending';
GRANT SELECT, INSERT, UPDATE ON public.pipeline_activation_requests TO authenticated;
GRANT ALL ON public.pipeline_activation_requests TO service_role;
ALTER TABLE public.pipeline_activation_requests ENABLE ROW LEVEL SECURITY;

-- 3. Membership helpers
CREATE OR REPLACE FUNCTION public.is_pipeline_head(_user_id uuid, _pipeline_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.pipeline_members
    WHERE user_id = _user_id AND pipeline_id = _pipeline_id AND role='head' AND active);
$$;
CREATE OR REPLACE FUNCTION public.is_pipeline_member(_user_id uuid, _pipeline_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.pipeline_members
    WHERE user_id = _user_id AND pipeline_id = _pipeline_id AND active);
$$;

-- 4. RLS on the new tables
DROP POLICY IF EXISTS pm_read ON public.pipeline_members;
DROP POLICY IF EXISTS pm_write_mgr ON public.pipeline_members;
DROP POLICY IF EXISTS pm_insert_head ON public.pipeline_members;
DROP POLICY IF EXISTS pm_update_head ON public.pipeline_members;
DROP POLICY IF EXISTS pm_delete_head ON public.pipeline_members;
CREATE POLICY pm_read ON public.pipeline_members FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY pm_write_mgr ON public.pipeline_members FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY pm_insert_head ON public.pipeline_members FOR INSERT TO authenticated
  WITH CHECK (public.is_pipeline_head(auth.uid(), pipeline_id));
CREATE POLICY pm_update_head ON public.pipeline_members FOR UPDATE TO authenticated
  USING (public.is_pipeline_head(auth.uid(), pipeline_id)) WITH CHECK (public.is_pipeline_head(auth.uid(), pipeline_id));
CREATE POLICY pm_delete_head ON public.pipeline_members FOR DELETE TO authenticated
  USING (public.is_pipeline_head(auth.uid(), pipeline_id));

DROP POLICY IF EXISTS pv_read ON public.pipeline_vendors;
DROP POLICY IF EXISTS pv_write ON public.pipeline_vendors;
CREATE POLICY pv_read ON public.pipeline_vendors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY pv_write ON public.pipeline_vendors FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR public.is_pipeline_head(auth.uid(), pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.is_pipeline_head(auth.uid(), pipeline_id));
INSERT INTO public.pipeline_vendors (pipeline_id, name, note)
SELECT id, 'MateRevenue', 'RM Team' FROM public.pipelines WHERE code='ota'
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS par_read ON public.pipeline_activation_requests;
DROP POLICY IF EXISTS par_insert ON public.pipeline_activation_requests;
DROP POLICY IF EXISTS par_update ON public.pipeline_activation_requests;
CREATE POLICY par_read ON public.pipeline_activation_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR client_id = public.my_client_id()
         OR public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager')
         OR public.is_pipeline_head(auth.uid(), pipeline_id));
CREATE POLICY par_insert ON public.pipeline_activation_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND client_id = public.my_client_id());
CREATE POLICY par_update ON public.pipeline_activation_requests FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager')
         OR public.is_pipeline_head(auth.uid(), pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager')
         OR public.is_pipeline_head(auth.uid(), pipeline_id));
DROP TRIGGER IF EXISTS par_updated ON public.pipeline_activation_requests;
CREATE TRIGGER par_updated BEFORE UPDATE ON public.pipeline_activation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Helper updates for membership + account manager
CREATE OR REPLACE FUNCTION public.can_view_pipeline(_client_pipeline_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_pipelines cp
    WHERE cp.id = _client_pipeline_id
      AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()
           OR public.is_pipeline_member(auth.uid(), cp.pipeline_id)
           OR public.can_view_client_full(cp.client_id)));
$$;

CREATE OR REPLACE FUNCTION public.can_view_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_manager(auth.uid())
      OR public.has_role(auth.uid(),'bd_manager')
      OR public.my_client_id() = _client_id
      OR EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = _client_id AND c.parent_client_id = public.my_client_id())
      OR EXISTS (SELECT 1 FROM public.client_pipelines cp
                 WHERE cp.client_id = _client_id
                   AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()
                        OR public.is_pipeline_member(auth.uid(), cp.pipeline_id)))
      OR EXISTS (SELECT 1 FROM public.client_module_assignments a
                 WHERE a.client_id = _client_id
                   AND (a.primary_user_id = auth.uid() OR a.backup_user_id = auth.uid()));
$$;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS account_manager_id uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.is_client_am(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_module_assignments a
    WHERE a.client_id = _client_id AND a.module_code = 'AM'
      AND (a.primary_user_id = auth.uid() OR a.backup_user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.clients c
    WHERE c.id = _client_id AND c.account_manager_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.guard_account_manager()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.account_manager_id IS DISTINCT FROM OLD.account_manager_id
     AND auth.uid() IS NOT NULL
     AND NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only admin or management can change the Account Manager';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_account_manager ON public.clients;
CREATE TRIGGER guard_account_manager BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_manager();

-- 6. Activation request + owner pipeline status RPCs
CREATE OR REPLACE FUNCTION public.request_pipeline_activation(_pipeline_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_client uuid := public.my_client_id(); v_pipe public.pipelines%ROWTYPE; v_hotel text;
BEGIN
  IF v_client IS NULL THEN RAISE EXCEPTION 'Only a hotel owner can request activation'; END IF;
  SELECT * INTO v_pipe FROM public.pipelines WHERE code = _pipeline_code AND active AND client_facing;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown pipeline'; END IF;
  IF EXISTS (SELECT 1 FROM public.pipeline_activation_requests
             WHERE client_id = v_client AND pipeline_id = v_pipe.id AND status='pending') THEN
    RETURN 'already_pending';
  END IF;
  SELECT hotel_name INTO v_hotel FROM public.clients WHERE id = v_client;
  INSERT INTO public.pipeline_activation_requests (client_id, user_id, pipeline_id)
  VALUES (v_client, auth.uid(), v_pipe.id);
  INSERT INTO public.notifications (user_id, title, body, link, kind)
  SELECT pm.user_id, 'Pipeline activation requested',
         v_hotel || ' requested ' || v_pipe.name, '/activation-requests', 'pipeline_activation'
  FROM public.pipeline_members pm JOIN public.pipelines p ON p.id = pm.pipeline_id
  WHERE pm.active AND pm.role='head' AND p.code IN ('business_development', _pipeline_code);
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.my_pipeline_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'code', p.code, 'name', p.name,
      'active', coalesce(svc.included, false),
      'pending', coalesce(req.pending, false)) ORDER BY p.sort_order), '[]'::jsonb)
  FROM public.pipelines p
  LEFT JOIN LATERAL (
    SELECT true AS included FROM public.client_launches l
    WHERE l.client_id = public.my_client_id() AND l.status IN ('active','live')
      AND (EXISTS (SELECT 1 FROM public.plan_services ps
                   WHERE ps.plan_version_id = l.plan_version_id AND ps.pipeline_code = p.code AND ps.included)
           OR EXISTS (SELECT 1 FROM public.custom_plan_services cps
                      WHERE cps.custom_plan_id = l.custom_plan_id AND cps.pipeline_code = p.code AND cps.included))
    LIMIT 1
  ) svc ON true
  LEFT JOIN LATERAL (
    SELECT true AS pending FROM public.pipeline_activation_requests r
    WHERE r.client_id = public.my_client_id() AND r.pipeline_id = p.id AND r.status='pending' LIMIT 1
  ) req ON true
  WHERE p.active AND p.client_facing AND public.my_client_id() IS NOT NULL;
$$;

-- 7. finance read access (plan/launch history, no KPIs)
DROP POLICY IF EXISTS clients_read_finance ON public.clients;
CREATE POLICY clients_read_finance ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS launch_read_finance ON public.client_launches;
CREATE POLICY launch_read_finance ON public.client_launches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS plans_read_finance ON public.plans;
CREATE POLICY plans_read_finance ON public.plans FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS plan_versions_read_finance ON public.plan_versions;
CREATE POLICY plan_versions_read_finance ON public.plan_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS plan_services_read_finance ON public.plan_services;
CREATE POLICY plan_services_read_finance ON public.plan_services FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS addons_read_finance ON public.addons_catalogue;
CREATE POLICY addons_read_finance ON public.addons_catalogue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance'));

-- 8. team_scorecard: hr sees every staff row
CREATE OR REPLACE FUNCTION public.team_scorecard(_month date DEFAULT ((date_trunc('month'::text, (now() AT TIME ZONE 'Asia/Kolkata'::text)) - '1 mon'::interval))::date)
 RETURNS TABLE(user_id uuid, full_name text, role text, reports_due integer, reports_on_time integer, on_time_pct numeric, kpi_pct numeric, tasks_due integer, tasks_on_time integer, launch_pct numeric, open_actions integer, overdue_actions integer, red_action_score numeric, overall_score numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
     WHERE r.month = m0
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

-- 9. Function grants
REVOKE ALL ON FUNCTION public.is_pipeline_head(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_pipeline_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_pipeline_activation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_pipeline_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pipeline_head(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pipeline_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_pipeline_activation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pipeline_status() TO authenticated;