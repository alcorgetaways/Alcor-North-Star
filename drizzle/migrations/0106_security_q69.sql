-- Security Q69: lock down definer functions, caller checks, active-only role helpers,
-- notification insert limits. No data changes.

CREATE OR REPLACE FUNCTION public._is_backend_caller()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT auth.uid() IS NULL AND coalesce(auth.role(), '') NOT IN ('anon', 'authenticated');
$$;
REVOKE EXECUTE ON FUNCTION public._is_backend_caller() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._is_backend_caller() TO service_role;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role IN ('admin','management') AND p.status = 'active');
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role = _role AND p.status = 'active');
$$;
CREATE OR REPLACE FUNCTION public.can_read_fetched(_cp uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'bd_manager')
      OR (public.is_staff(auth.uid()) AND EXISTS (
        SELECT 1 FROM client_pipelines cp
        JOIN client_staff_assignments a ON a.client_id = cp.client_id AND a.pipeline_id = cp.pipeline_id
        WHERE cp.id = _cp AND a.user_id = auth.uid() AND NOT coalesce(a.excluded, false)));
$$;

CREATE OR REPLACE FUNCTION public._rd_caller_ok(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._is_backend_caller() OR (auth.uid() IS NOT NULL AND (
    (_uid = auth.uid() AND public.is_staff(auth.uid()))
    OR public.can_manage_rd(auth.uid()) OR public.has_role(auth.uid(), 'hr')));
$$;
CREATE OR REPLACE FUNCTION public._kpi_caller_ok(_cp uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._is_backend_caller() OR (auth.uid() IS NOT NULL AND (
    public.is_manager(auth.uid()) OR public.can_view_pipeline(_cp) OR public.can_read_fetched(_cp)
    OR EXISTS (SELECT 1 FROM client_pipelines cp WHERE cp.id = _cp
               AND (public.is_pipeline_head(auth.uid(), cp.pipeline_id)
                    OR (public.has_role(auth.uid(), 'client') AND cp.client_id = public.my_client_id())))));
$$;
REVOKE EXECUTE ON FUNCTION public._rd_caller_ok(uuid), public._kpi_caller_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._rd_caller_ok(uuid), public._kpi_caller_ok(uuid) TO service_role;

ALTER FUNCTION public.rd_booked(uuid, date, date) RENAME TO _rd_booked_core;
ALTER FUNCTION public._rd_stats(uuid, date, date) RENAME TO _rd_stats_core;
ALTER FUNCTION public.rd_associates() RENAME TO _rd_associates_core;
ALTER FUNCTION public.kpi_prev_actual(uuid, uuid, date) RENAME TO _kpi_prev_actual_core;
ALTER FUNCTION public.kpi_target_state(uuid, uuid, date) RENAME TO _kpi_target_state_core;
REVOKE EXECUTE ON FUNCTION public._rd_booked_core(uuid, date, date), public._rd_stats_core(uuid, date, date),
  public._rd_associates_core(), public._kpi_prev_actual_core(uuid, uuid, date), public._kpi_target_state_core(uuid, uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._rd_booked_core(uuid, date, date), public._rd_stats_core(uuid, date, date),
  public._rd_associates_core(), public._kpi_prev_actual_core(uuid, uuid, date), public._kpi_target_state_core(uuid, uuid, date)
  TO service_role;

DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('rd_performance','rd_grades','rd_week_goal','rd_pacing',
             'kpi_suggest_target','targets_due','notify_targets_due','kpi_entry_compute','_kpi_target_state_core')
  LOOP
    d := pg_get_functiondef(r.oid);
    d := regexp_replace(d, '(public\.)?\mrd_booked\(', 'public._rd_booked_core(', 'g');
    d := regexp_replace(d, '(public\.)?\m_rd_stats\(', 'public._rd_stats_core(', 'g');
    d := regexp_replace(d, '(public\.)?\mrd_associates\(', 'public._rd_associates_core(', 'g');
    d := regexp_replace(d, '(public\.)?\mkpi_prev_actual\(', 'public._kpi_prev_actual_core(', 'g');
    d := regexp_replace(d, '(public\.)?\mkpi_target_state\(', 'public._kpi_target_state_core(', 'g');
    EXECUTE d;
  END LOOP;
END $$;

CREATE FUNCTION public.rd_booked(_uid uuid, _from date, _to date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._rd_caller_ok(_uid) THEN RAISE EXCEPTION 'You can only see your own performance'; END IF;
  RETURN public._rd_booked_core(_uid, _from, _to);
END $$;
CREATE FUNCTION public._rd_stats(_uid uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._rd_caller_ok(_uid) THEN RAISE EXCEPTION 'You can only see your own performance'; END IF;
  RETURN public._rd_stats_core(_uid, _from, _to);
END $$;
CREATE FUNCTION public.rd_associates()
RETURNS TABLE(user_id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.user_id, a.full_name FROM public._rd_associates_core() a
   WHERE public._is_backend_caller() OR public.can_manage_rd(auth.uid()) OR public.has_role(auth.uid(), 'hr')
      OR (a.user_id = auth.uid() AND public.is_staff(auth.uid()));
$$;
CREATE FUNCTION public.kpi_prev_actual(_cp uuid, _def uuid, _month date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pm date := (date_trunc('month', _month) - interval '1 month')::date;
BEGIN
  IF NOT public._kpi_caller_ok(_cp) THEN RAISE EXCEPTION 'Not allowed for this pipeline'; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'client') AND NOT public.is_staff(auth.uid()) THEN
    RETURN (SELECT e.actual FROM kpi_entries e JOIN monthly_reports r ON r.id = e.report_id
             WHERE r.client_pipeline_id = _cp AND r.month = pm AND e.kpi_definition_id = _def AND r.status = 'approved');
  END IF;
  RETURN public._kpi_prev_actual_core(_cp, _def, _month);
END $$;
CREATE FUNCTION public.kpi_target_state(_cp uuid, _def uuid, _month date, OUT target numeric, OUT status text)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  IF NOT public._kpi_caller_ok(_cp) THEN RAISE EXCEPTION 'Not allowed for this pipeline'; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'client') AND NOT public.is_staff(auth.uid()) THEN
    target := public.kpi_target_for(_cp, _def, _month);
    status := CASE WHEN target IS NOT NULL THEN 'approved' END;
    RETURN;
  END IF;
  SELECT * INTO s FROM public._kpi_target_state_core(_cp, _def, _month);
  target := s.target; status := s.status;
END $$;
REVOKE EXECUTE ON FUNCTION public.rd_booked(uuid, date, date), public._rd_stats(uuid, date, date), public.rd_associates(),
  public.kpi_prev_actual(uuid, uuid, date), public.kpi_target_state(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rd_booked(uuid, date, date), public._rd_stats(uuid, date, date), public.rd_associates(),
  public.kpi_prev_actual(uuid, uuid, date), public.kpi_target_state(uuid, uuid, date) TO authenticated, service_role;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.generate_staff_duties(date)'::regprocedure);
  IF position('IF auth.uid() IS NOT NULL AND NOT (' IN d) = 0 THEN RAISE EXCEPTION 'generate_staff_duties guard not found'; END IF;
  d := replace(d, 'IF auth.uid() IS NOT NULL AND NOT (', 'IF NOT public._is_backend_caller() AND NOT (');
  EXECUTE d;
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_staff_duties(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_staff_duties(date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recalc_client_assignments(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_client_assignments(uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_recurring_task(uuid, text, date, text, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gbp_profile_names() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.scorecard_band(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_recurring_task(uuid, text, date, text, uuid, uuid, text),
  public.gbp_profile_names(), public.scorecard_band(numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shares_work_with(_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM client_staff_assignments a JOIN client_staff_assignments b ON b.client_id = a.client_id
                  WHERE a.user_id = auth.uid() AND b.user_id = _target AND NOT a.excluded AND NOT b.excluded)
      OR EXISTS (SELECT 1 FROM pipeline_members a JOIN pipeline_members b ON b.pipeline_id = a.pipeline_id
                  WHERE a.user_id = auth.uid() AND b.user_id = _target AND a.active AND b.active)
      OR EXISTS (SELECT 1 FROM profiles t JOIN client_staff_assignments a ON a.client_id = t.client_id
                  WHERE t.id = _target AND a.user_id = auth.uid() AND NOT a.excluded);
$$;
REVOKE EXECUTE ON FUNCTION public.shares_work_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_work_with(uuid) TO authenticated, service_role;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_link_relative
  CHECK (link IS NULL OR (link ~ '^/' AND link !~ '^//' AND position(E'\\' IN link) = 0));
DROP POLICY IF EXISTS "notif insert" ON public.notifications;
CREATE POLICY "notif insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid())
    AND (user_id = auth.uid() OR public.is_manager(auth.uid()) OR public.shares_work_with(user_id)));
