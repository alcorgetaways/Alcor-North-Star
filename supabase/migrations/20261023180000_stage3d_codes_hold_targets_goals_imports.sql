-- ===== Q24 client codes =====
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_code text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_client_code_key ON public.clients (client_code);
CREATE SEQUENCE IF NOT EXISTS public.client_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.demo_code_seq;

CREATE OR REPLACE FUNCTION public._code_num(_n bigint) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT lpad(_n::text, greatest(3, length(_n::text)), '0') $$;

DO $$
DECLARE r record; n bigint; d bigint; k int; pc text;
BEGIN
  SELECT coalesce(max(substring(client_code from 5)::int), 0) INTO n FROM clients WHERE client_code ~ '^ALC-[0-9]+$';
  SELECT coalesce(max(substring(client_code from 6)::int), 0) INTO d FROM clients WHERE client_code ~ '^DEMO-[0-9]+$';
  FOR r IN
    SELECT c.id FROM clients c
    LEFT JOIN LATERAL (SELECT l.contract_start, l.source_row FROM client_launches l JOIN clients x ON x.id = l.client_id
                        WHERE x.id = c.id OR x.parent_client_id = c.id
                        ORDER BY l.contract_start NULLS LAST, l.source_row NULLS LAST LIMIT 1) e ON true
    WHERE c.client_code IS NULL AND c.parent_client_id IS NULL AND NOT c.is_test AND NOT c.is_demo
    ORDER BY e.contract_start NULLS LAST, e.source_row NULLS LAST, c.created_at, c.hotel_name
  LOOP
    n := n + 1; UPDATE clients SET client_code = 'ALC-' || public._code_num(n) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT c.id FROM clients c WHERE c.client_code IS NULL AND (c.is_test OR c.is_demo) ORDER BY c.created_at LOOP
    d := d + 1; UPDATE clients SET client_code = 'DEMO-' || public._code_num(d) WHERE id = r.id;
  END LOOP;
  FOR r IN
    SELECT c.id, c.parent_client_id FROM clients c
    LEFT JOIN LATERAL (SELECT l.contract_start, l.source_row FROM client_launches l WHERE l.client_id = c.id
                        ORDER BY l.contract_start NULLS LAST, l.source_row NULLS LAST LIMIT 1) e ON true
    WHERE c.client_code IS NULL AND c.parent_client_id IS NOT NULL
    ORDER BY c.parent_client_id, e.contract_start NULLS LAST, e.source_row NULLS LAST, c.hotel_name
  LOOP
    SELECT client_code INTO pc FROM clients WHERE id = r.parent_client_id;
    IF pc IS NULL THEN
      n := n + 1; UPDATE clients SET client_code = 'ALC-' || public._code_num(n) WHERE id = r.id;
    ELSE
      SELECT coalesce(max(substring(client_code from length(pc) + 2)::int), 0) + 1 INTO k FROM clients
       WHERE parent_client_id = r.parent_client_id AND client_code LIKE pc || '-%'
         AND substring(client_code from length(pc) + 2) ~ '^[0-9]+$';
      UPDATE clients SET client_code = pc || '-' || k WHERE id = r.id;
    END IF;
  END LOOP;
  IF n > 0 THEN PERFORM setval('public.client_code_seq', n, true); END IF;
  IF d > 0 THEN PERFORM setval('public.demo_code_seq', d, true); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.client_code_assign() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pc text; k int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.client_code IS NOT NULL AND NEW.client_code IS DISTINCT FROM OLD.client_code THEN
      RAISE EXCEPTION 'Client codes are permanent (%) and cannot be changed', OLD.client_code;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.is_test OR NEW.is_demo THEN
    NEW.client_code := 'DEMO-' || public._code_num(nextval('public.demo_code_seq'));
  ELSIF NEW.parent_client_id IS NOT NULL THEN
    SELECT client_code INTO pc FROM clients WHERE id = NEW.parent_client_id;
    IF pc IS NULL THEN
      NEW.client_code := 'ALC-' || public._code_num(nextval('public.client_code_seq'));
    ELSE
      SELECT coalesce(max(substring(client_code from length(pc) + 2)::int), 0) + 1 INTO k FROM clients
       WHERE parent_client_id = NEW.parent_client_id AND client_code LIKE pc || '-%'
         AND substring(client_code from length(pc) + 2) ~ '^[0-9]+$';
      NEW.client_code := pc || '-' || k;
    END IF;
  ELSE
    NEW.client_code := 'ALC-' || public._code_num(nextval('public.client_code_seq'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_clients_code ON public.clients;
CREATE TRIGGER t_clients_code BEFORE INSERT OR UPDATE OF client_code ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.client_code_assign();

CREATE OR REPLACE FUNCTION public.client_codes() RETURNS TABLE(id uuid, client_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.client_code FROM clients c
   WHERE auth.uid() IS NOT NULL AND (is_staff(auth.uid()) OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'hr'));
$$;

-- ===== Q22 on hold =====
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS on_hold_since date;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS on_hold_reason text;

CREATE OR REPLACE FUNCTION public.client_on_hold(_client_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (SELECT _client_id AS id UNION SELECT parent_client_id FROM clients WHERE id = _client_id AND parent_client_id IS NOT NULL)
  SELECT EXISTS (SELECT 1 FROM client_launches l WHERE l.client_id IN (SELECT id FROM ids) AND l.status = 'on_hold')
     AND NOT EXISTS (SELECT 1 FROM client_launches l WHERE l.client_id IN (SELECT id FROM ids) AND l.status IN ('active','live','offboarding'));
$$;

CREATE OR REPLACE FUNCTION public.hold_launch(_launch_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l client_launches;
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT (is_manager(auth.uid()) OR is_launch_am(_launch_id)) THEN RAISE EXCEPTION 'Only the Account Manager or management can put a launch on hold'; END IF;
  IF l.status NOT IN ('draft','awaiting_day0','active','live') THEN RAISE EXCEPTION 'Only an open launch can be put on hold (this one is %)', l.status; END IF;
  IF coalesce(trim(_reason), '') = '' THEN RAISE EXCEPTION 'Give a reason for the hold'; END IF;
  UPDATE client_launches SET previous_status = l.status, status = 'on_hold',
         on_hold_since = (now() AT TIME ZONE 'Asia/Kolkata')::date, on_hold_reason = _reason WHERE id = _launch_id;
  INSERT INTO launch_events (launch_id, user_id, kind, details) VALUES (_launch_id, auth.uid(), 'on_hold', jsonb_build_object('reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.resume_launch(_launch_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l client_launches; days int := 0; st text; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT (is_manager(auth.uid()) OR is_launch_am(_launch_id)) THEN RAISE EXCEPTION 'Only the Account Manager or management can resume a launch'; END IF;
  IF l.status <> 'on_hold' THEN RAISE EXCEPTION 'This launch is not on hold'; END IF;
  st := coalesce(l.previous_status, CASE WHEN l.activated_at IS NOT NULL THEN 'active' WHEN l.day0_date IS NOT NULL THEN 'awaiting_day0' ELSE 'draft' END);
  IF l.on_hold_since IS NOT NULL THEN days := greatest(0, today - l.on_hold_since); END IF;
  IF days > 0 THEN
    UPDATE client_gates SET due_date = due_date + days WHERE launch_id = l.id AND status <> 'signed' AND due_date IS NOT NULL;
    UPDATE client_tasks SET due_date = due_date + days, escalation_level = 0
     WHERE launch_id = l.id AND status NOT IN ('done','not_applicable') AND due_date IS NOT NULL;
  END IF;
  UPDATE client_launches SET status = st, previous_status = NULL, on_hold_since = NULL, on_hold_reason = NULL,
         launch_date = CASE WHEN launch_date IS NOT NULL THEN launch_date + days END WHERE id = l.id;
  INSERT INTO launch_events (launch_id, user_id, kind, details)
  VALUES (l.id, auth.uid(), 'resumed', jsonb_build_object('status', st, 'days_shifted', days, 'held_since', l.on_hold_since));
  RETURN st;
END $$;

CREATE OR REPLACE FUNCTION public.block_kpi_on_hold() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'kpi_entries' THEN SELECT client_id INTO cid FROM monthly_reports WHERE id = NEW.report_id;
  ELSE cid := NEW.client_id; END IF;
  IF public.client_on_hold(cid) THEN
    RAISE EXCEPTION 'This hotel is on hold. KPI entry is paused until the launch is resumed.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_hold_gbp ON public.gbp_kpi_entries;
CREATE TRIGGER t_hold_gbp BEFORE INSERT OR UPDATE ON public.gbp_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();
DROP TRIGGER IF EXISTS t_hold_social ON public.social_kpi_entries;
CREATE TRIGGER t_hold_social BEFORE INSERT OR UPDATE ON public.social_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();
DROP TRIGGER IF EXISTS t_hold_weekly ON public.weekly_kpi_entries;
CREATE TRIGGER t_hold_weekly BEFORE INSERT OR UPDATE ON public.weekly_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();
DROP TRIGGER IF EXISTS t_hold_pke ON public.pipeline_kpi_entries;
CREATE TRIGGER t_hold_pke BEFORE INSERT OR UPDATE ON public.pipeline_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();
DROP TRIGGER IF EXISTS t_hold_ota ON public.ota_records;
CREATE TRIGGER t_hold_ota BEFORE INSERT OR UPDATE ON public.ota_records FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();
DROP TRIGGER IF EXISTS t_hold_reports ON public.monthly_reports;
CREATE TRIGGER t_hold_reports BEFORE INSERT ON public.monthly_reports FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();
DROP TRIGGER IF EXISTS t_hold_entries ON public.kpi_entries;
CREATE TRIGGER t_hold_entries BEFORE INSERT OR UPDATE OF actual, text_value ON public.kpi_entries FOR EACH ROW EXECUTE FUNCTION public.block_kpi_on_hold();

CREATE OR REPLACE FUNCTION public.create_monthly_reports(_month date DEFAULT ((date_trunc('month'::text, now()) - '1 mon'::interval))::date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  AND NOT public.client_on_hold(cp.client_id)
 ON CONFLICT (client_pipeline_id, month) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 INSERT INTO notifications (user_id, title, body, link)
 SELECT r.created_by, 'Monthly reports opened', count(*) || ' report(s) for ' || to_char(m,'Mon YYYY') || ' are due by ' || to_char(max(r.due_date),'DD Mon'), '/reports'
  FROM monthly_reports r WHERE r.month = m AND r.status='draft' AND r.created_at > now() - interval '5 minutes' AND r.created_by IS NOT NULL
 GROUP BY r.created_by;
 RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.remind_report_deadlines()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; n int := 0; k int;
BEGIN
  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT cp.manager_id, 'Report due in 2 days', count(*) || ' monthly report(s) are due on ' || to_char(min(r.due_date),'DD Mon'), '/reports', 'report'
    FROM monthly_reports r JOIN client_pipelines cp ON cp.id=r.client_pipeline_id
   WHERE r.status='draft' AND r.due_date = today + 2 AND cp.manager_id IS NOT NULL AND NOT public.client_on_hold(r.client_id) GROUP BY cp.manager_id;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT cp.manager_id, 'Report overdue', count(*) || ' monthly report(s) are past the deadline', '/reports', 'report'
    FROM monthly_reports r JOIN client_pipelines cp ON cp.id=r.client_pipeline_id
   WHERE r.status='draft' AND r.due_date < today AND cp.manager_id IS NOT NULL AND NOT public.client_on_hold(r.client_id) GROUP BY cp.manager_id;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT ur.user_id, 'Overdue reports', x.c || ' monthly report(s) are past the deadline', '/reports', 'report'
    FROM (SELECT count(*) c FROM monthly_reports WHERE status='draft' AND due_date < today AND NOT public.client_on_hold(client_id)) x
    JOIN user_roles ur ON ur.role IN ('admin','management') JOIN profiles p ON p.id=ur.user_id AND p.status='active'
   WHERE x.c > 0 AND extract(isodow FROM today) = 1;
  GET DIAGNOSTICS k = ROW_COUNT; RETURN n + k;
END $function$;

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
     WHERE r.month = m0 AND NOT r.is_demo AND NOT public.client_on_hold(r.client_id)
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
    FROM client_tasks t JOIN client_launches lh ON lh.id = t.launch_id AND lh.status <> 'on_hold'
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

-- ===== Q42 Day 0 =====
CREATE OR REPLACE FUNCTION public._day0_missing(l public.client_launches) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pl plans; since timestamptz; m text[] := '{}';
BEGIN
  SELECT * INTO pl FROM plans WHERE id = l.plan_id;
  since := CASE WHEN l.change_kind IN ('upgrade','relaunch') THEN l.created_at ELSE '-infinity'::timestamptz END;
  IF NOT EXISTS (SELECT 1 FROM documents WHERE client_id = l.client_id AND doc_type ILIKE 'Agreement%'
                 AND status IN ('uploaded','verified') AND greatest(created_at, updated_at) >= since)
    THEN m := array_append(m, CASE WHEN since > '-infinity' THEN 'a new signed agreement for this plan' ELSE 'signed agreement' END); END IF;
  IF coalesce(pl.day0_requires_noc, false) AND NOT EXISTS (SELECT 1 FROM documents WHERE client_id = l.client_id AND doc_type ILIKE 'NOC%'
                 AND status IN ('uploaded','verified') AND greatest(created_at, updated_at) >= since)
    THEN m := array_append(m, 'signed NOC'); END IF;
  IF coalesce(l.advance_amount, 0) <= 0 THEN m := array_append(m, 'advance amount'); END IF;
  IF l.advance_received_at IS NULL THEN m := array_append(m, 'advance payment date'); END IF;
  IF coalesce(trim(l.payment_reference), '') = '' AND coalesce(trim(l.payment_screenshot_path), '') = '' THEN
    m := array_append(m, 'payment reference or screenshot'); END IF;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.day0_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m text[];
BEGIN
  IF NEW.day0_date IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.day0_date IS NULL) THEN
    m := public._day0_missing(NEW);
    IF coalesce(array_length(m, 1), 0) > 0 THEN
      RAISE EXCEPTION 'Day 0 cannot start. Missing: %', array_to_string(m, ', ');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_day0_guard ON public.client_launches;
CREATE TRIGGER t_day0_guard BEFORE INSERT OR UPDATE OF day0_date ON public.client_launches
  FOR EACH ROW EXECUTE FUNCTION public.day0_guard();

CREATE OR REPLACE FUNCTION public.confirm_day0(_launch_id uuid, _day0 date DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata'::text))::date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE l public.client_launches; pl public.plans; missing text[];
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT can_edit_client(l.client_id) THEN RAISE EXCEPTION 'Only BD or management can confirm Day 0'; END IF;
  IF l.status NOT IN ('draft','awaiting_day0') THEN RAISE EXCEPTION 'Day 0 is already confirmed'; END IF;
  IF _day0 IS NULL THEN RAISE EXCEPTION 'Choose the Day 0 date'; END IF;
  IF _day0 > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Day 0 cannot be in the future'; END IF;
  SELECT * INTO pl FROM plans WHERE id = l.plan_id;
  missing := public._day0_missing(l);
  IF coalesce(array_length(missing,1),0) > 0 THEN RAISE EXCEPTION 'Day 0 cannot start. Missing: %', array_to_string(missing, ', '); END IF;
  UPDATE client_launches SET day0_date = _day0, launch_date = _day0 + pl.launch_day, status = 'awaiting_day0' WHERE id = _launch_id;
  INSERT INTO launch_events (launch_id, user_id, kind, details) VALUES (_launch_id, auth.uid(), 'day0_confirmed', jsonb_build_object('day0', _day0));
END $function$;

CREATE OR REPLACE FUNCTION public.day0_readiness(_launch_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l client_launches; m text[]; noc boolean;
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT (can_edit_client(l.client_id) OR is_launch_am(_launch_id)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  m := public._day0_missing(l);
  SELECT coalesce(day0_requires_noc, false) INTO noc FROM plans WHERE id = l.plan_id;
  RETURN jsonb_build_object('ready', coalesce(array_length(m,1),0) = 0, 'missing', to_jsonb(m), 'noc_required', noc);
END $$;

-- ===== Q49 KPI targets =====
ALTER TABLE public.client_kpi_targets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.client_kpi_targets ADD COLUMN IF NOT EXISTS suggested numeric;
ALTER TABLE public.client_kpi_targets ADD COLUMN IF NOT EXISTS proposed_by uuid;
ALTER TABLE public.client_kpi_targets ADD COLUMN IF NOT EXISTS proposed_at timestamptz;
ALTER TABLE public.client_kpi_targets ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.client_kpi_targets ADD COLUMN IF NOT EXISTS approved_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_kpi_targets_status_check') THEN
    ALTER TABLE public.client_kpi_targets ADD CONSTRAINT client_kpi_targets_status_check CHECK (status IN ('provisional','approved'));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.client_kpi_targets TO authenticated;
GRANT ALL ON public.client_kpi_targets TO service_role;

ALTER TABLE public.kpi_entries ADD COLUMN IF NOT EXISTS target_status text;
ALTER TABLE public.kpi_entries ADD COLUMN IF NOT EXISTS provisional_target numeric;

CREATE OR REPLACE FUNCTION public.kpi_target_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mgr boolean := auth.uid() IS NULL OR coalesce(is_manager(auth.uid()), false);
BEGIN
  IF NEW.month IS NOT NULL THEN NEW.month := date_trunc('month', NEW.month)::date; END IF;
  IF NOT mgr THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
      RAISE EXCEPTION 'This target is already approved. Only management can change it.';
    END IF;
    IF NEW.month IS NULL THEN RAISE EXCEPTION 'Proposed targets need a month'; END IF;
    NEW.status := 'provisional'; NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.proposed_by := auth.uid(); NEW.proposed_at := now();
  ELSIF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved' OR NEW.target IS DISTINCT FROM OLD.target) THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_kpi_target_guard ON public.client_kpi_targets;
CREATE TRIGGER a_kpi_target_guard BEFORE INSERT OR UPDATE ON public.client_kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.kpi_target_guard();

DROP POLICY IF EXISTS "heads propose targets" ON public.client_kpi_targets;
CREATE POLICY "heads propose targets" ON public.client_kpi_targets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_pipelines cp WHERE cp.id = client_pipeline_id
                       AND public.is_pipeline_head(auth.uid(), cp.pipeline_id))
              AND public.can_view_pipeline(client_pipeline_id));
DROP POLICY IF EXISTS "heads revise proposals" ON public.client_kpi_targets;
CREATE POLICY "heads revise proposals" ON public.client_kpi_targets FOR UPDATE TO authenticated
  USING (status = 'provisional' AND EXISTS (SELECT 1 FROM public.client_pipelines cp WHERE cp.id = client_pipeline_id
                       AND public.is_pipeline_head(auth.uid(), cp.pipeline_id))
         AND public.can_view_pipeline(client_pipeline_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_pipelines cp WHERE cp.id = client_pipeline_id
                       AND public.is_pipeline_head(auth.uid(), cp.pipeline_id))
              AND public.can_view_pipeline(client_pipeline_id));

CREATE OR REPLACE FUNCTION public.kpi_target_for(_cp uuid, _def uuid, _month date)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT t.target FROM client_kpi_targets t
   WHERE t.client_pipeline_id=_cp AND t.kpi_definition_id=_def AND t.month <= date_trunc('month',_month)::date
     AND t.target IS NOT NULL AND t.status = 'approved'
   ORDER BY t.month DESC LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.kpi_prev_actual(_cp uuid, _def uuid, _month date) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pm date := (date_trunc('month', _month) - interval '1 month')::date; v numeric; d record;
BEGIN
  SELECT e.actual INTO v FROM kpi_entries e JOIN monthly_reports r ON r.id = e.report_id
   WHERE r.client_pipeline_id = _cp AND r.month = pm AND e.kpi_definition_id = _def;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT source_key, kpi_type, unit INTO d FROM kpi_definitions WHERE id = _def;
  IF d.source_key IS NOT NULL THEN
    v := public.kpi_source_value(_cp, pm, d.source_key, d.kpi_type IN ('percentage','rating') OR d.unit IN ('minutes','rank'));
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_suggest_target(_cp uuid, _def uuid, _month date) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN x.pa IS NULL THEN NULL WHEN k.direction = 'higher_better' THEN round(x.pa * 1.1, 2) ELSE x.pa END
    FROM kpi_definitions k CROSS JOIN LATERAL (SELECT public.kpi_prev_actual(_cp, _def, _month) pa) x WHERE k.id = _def;
$$;

CREATE OR REPLACE FUNCTION public.kpi_target_state(_cp uuid, _def uuid, _month date, OUT target numeric, OUT status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  target := public.kpi_target_for(_cp, _def, _month);
  IF target IS NOT NULL THEN status := 'approved'; RETURN; END IF;
  SELECT t.target INTO target FROM client_kpi_targets t
   WHERE t.client_pipeline_id = _cp AND t.kpi_definition_id = _def AND t.month = date_trunc('month', _month)::date AND t.status = 'provisional';
  IF target IS NOT NULL THEN status := 'provisional'; RETURN; END IF;
  status := CASE WHEN public.kpi_prev_actual(_cp, _def, _month) IS NULL THEN 'baseline' ELSE 'missing' END;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_entry_compute()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record; r record; _issue text; _src numeric; ratio numeric; ts record;
BEGIN
  SELECT direction, name, pipeline_id, source_key, kpi_type, unit INTO d FROM kpi_definitions WHERE id = NEW.kpi_definition_id;
  SELECT client_id, client_pipeline_id, month INTO r FROM monthly_reports WHERE id = NEW.report_id;
  -- scoring uses approved targets only; provisional targets are shown as "not scored yet"
  SELECT * INTO ts FROM public.kpi_target_state(r.client_pipeline_id, NEW.kpi_definition_id, r.month);
  NEW.target_status := ts.status;
  NEW.target := CASE WHEN ts.status = 'approved' THEN ts.target END;
  NEW.provisional_target := CASE WHEN ts.status = 'provisional' THEN ts.target END;
  IF d.source_key IS NOT NULL THEN
    NEW.actual := public.kpi_source_value(r.client_pipeline_id, r.month, d.source_key,
                    d.kpi_type IN ('percentage','rating') OR d.unit IN ('minutes','rank'));
  END IF;

  IF NEW.target IS NULL OR NEW.actual IS NULL OR NEW.target <= 0 THEN
    NEW.achievement_pct := NULL;
  ELSIF d.direction = 'lower_better' THEN
    NEW.achievement_pct := CASE WHEN NEW.actual <= 0 THEN 120 ELSE LEAST(120, round(NEW.target / NEW.actual * 100, 2)) END;
  ELSIF d.direction = 'within_budget' THEN
    ratio := NEW.actual / NEW.target;
    NEW.achievement_pct := CASE WHEN ratio BETWEEN 0.9 AND 1.0 THEN 100
                                WHEN ratio < 0.9 THEN round(ratio / 0.9 * 100, 2)
                                ELSE GREATEST(0, round((2 - ratio) * 100, 2)) END;
  ELSE
    NEW.achievement_pct := LEAST(120, round(NEW.actual / NEW.target * 100, 2));
  END IF;

  IF NEW.achievement_pct IS NOT NULL AND NEW.achievement_pct < 70
     AND coalesce(trim(NEW.red_reason),'') <> '' AND coalesce(trim(NEW.corrective_action),'') <> ''
     AND NEW.action_owner_id IS NOT NULL AND NEW.action_deadline IS NOT NULL THEN
    _issue := d.name || ' below target (' || to_char(r.month,'Mon YYYY') || '): ' || NEW.red_reason;
    IF NEW.action_item_id IS NOT NULL AND EXISTS (SELECT 1 FROM action_items WHERE id = NEW.action_item_id) THEN
      UPDATE action_items SET issue=_issue, action_required=NEW.corrective_action,
        responsible_id=NEW.action_owner_id, due_date=NEW.action_deadline WHERE id = NEW.action_item_id;
    ELSE
      INSERT INTO action_items (client_id, pipeline_id, issue, action_required, responsible_id, priority, due_date, status, created_by)
      VALUES (r.client_id, d.pipeline_id, _issue, NEW.corrective_action, NEW.action_owner_id, 'high', NEW.action_deadline, 'not_started', auth.uid())
      RETURNING id INTO NEW.action_item_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.report_submit_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE missing text;
BEGIN
  IF NEW.status <> 'draft' AND OLD.status = 'draft' THEN
    PERFORM public.refresh_report_kpis(NEW.id);
    SELECT string_agg(k.name, ', ' ORDER BY k.sort_order) INTO missing
      FROM kpi_entries e JOIN kpi_definitions k ON k.id=e.kpi_definition_id
     WHERE e.report_id = NEW.id AND coalesce(e.target_status, CASE WHEN e.target IS NULL THEN 'missing' ELSE 'approved' END) = 'missing';
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'No target yet for: %. The pipeline head proposes targets and management approves them before submitting.', missing;
    END IF;
    IF EXISTS (SELECT 1 FROM kpi_entries e WHERE e.report_id = NEW.id AND e.achievement_pct < 70
      AND (coalesce(trim(e.red_reason),'') = '' OR coalesce(trim(e.corrective_action),'') = ''
           OR e.action_owner_id IS NULL OR e.action_deadline IS NULL)) THEN
      RAISE EXCEPTION 'Every red KPI needs what went wrong, corrective action, owner and deadline before submitting';
    END IF;
    NEW.submitted_at := coalesce(NEW.submitted_at, now());
  END IF;
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NOT public.is_manager(auth.uid()) AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Only management can approve reports'; END IF;
    NEW.approved_at := now(); NEW.approved_by := auth.uid();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.targets_due(_month date DEFAULT ((date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 month'))::date)
RETURNS TABLE(client_pipeline_id uuid, client_id uuid, hotel_name text, client_code text, pipeline_code text, pipeline_name text,
              kpi_definition_id uuid, kpi_name text, unit text, direction text, prev_actual numeric, suggested numeric,
              target_id uuid, target numeric, status text, baseline boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.id, c.id, c.hotel_name, c.client_code, p.code, p.name, k.id, k.name, k.unit, k.direction, x.pa,
         CASE WHEN x.pa IS NULL THEN NULL WHEN k.direction = 'higher_better' THEN round(x.pa * 1.1, 2) ELSE x.pa END,
         t.id, t.target, t.status, (x.pa IS NULL AND t.id IS NULL)
    FROM client_pipelines cp
    JOIN clients c ON c.id = cp.client_id AND NOT c.is_demo AND NOT c.is_test
    JOIN pipelines p ON p.id = cp.pipeline_id
    JOIN kpi_definitions k ON k.pipeline_id = cp.pipeline_id AND k.active
    LEFT JOIN client_kpi_targets t ON t.client_pipeline_id = cp.id AND t.kpi_definition_id = k.id AND t.month = date_trunc('month', _month)::date
    CROSS JOIN LATERAL (SELECT public.kpi_prev_actual(cp.id, k.id, _month) pa) x
   WHERE cp.status = 'active' AND NOT public.client_on_hold(c.id)
     AND (is_manager(auth.uid()) OR (public.is_pipeline_head(auth.uid(), cp.pipeline_id) AND public.can_view_pipeline(cp.id)))
   ORDER BY c.hotel_name, p.name, k.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.approve_kpi_targets(_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only management can approve targets'; END IF;
  UPDATE client_kpi_targets SET status = 'approved' WHERE id = ANY(_ids) AND status = 'provisional';
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.notify_targets_due(_today date DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata'))::date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := (date_trunc('month', _today) + interval '1 month')::date; n int := 0; k int;
BEGIN
  IF coalesce(current_setting('role', true),'none') IN ('authenticated','anon') AND NOT is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Management only';
  END IF;
  IF extract(day FROM _today) <> 25 THEN RETURN 0; END IF;
  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT pm.user_id, 'Targets due for ' || to_char(m, 'Mon YYYY'),
         count(*) || ' KPI target(s) to propose for ' || to_char(m, 'Mon YYYY') || '. Suggested values are pre-filled.', '/targets', 'report'
    FROM pipeline_members pm
    JOIN profiles pr ON pr.id = pm.user_id AND pr.status = 'active'
    JOIN client_pipelines cp ON cp.pipeline_id = pm.pipeline_id AND cp.status = 'active'
    JOIN client_staff_assignments a ON a.client_id = cp.client_id AND a.pipeline_id = cp.pipeline_id AND a.user_id = pm.user_id AND NOT a.excluded
    JOIN clients c ON c.id = cp.client_id AND NOT c.is_test
    JOIN kpi_definitions kd ON kd.pipeline_id = cp.pipeline_id AND kd.active
   WHERE pm.role = 'head' AND pm.active AND NOT public.client_on_hold(cp.client_id)
     AND NOT EXISTS (SELECT 1 FROM client_kpi_targets t WHERE t.client_pipeline_id = cp.id AND t.kpi_definition_id = kd.id AND t.month = m)
     AND public.kpi_prev_actual(cp.id, kd.id, m) IS NOT NULL
   GROUP BY pm.user_id;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT ur.user_id, 'Targets awaiting approval', x.c || ' proposed KPI target(s) for ' || to_char(m, 'Mon YYYY') || ' need approval.', '/targets', 'report'
    FROM (SELECT count(*) c FROM client_kpi_targets WHERE status = 'provisional' AND month = m) x
    JOIN user_roles ur ON ur.role = 'management' JOIN profiles p ON p.id = ur.user_id AND p.status = 'active'
   WHERE x.c > 0;
  GET DIAGNOSTICS k = ROW_COUNT; RETURN n + k;
END $$;

-- ===== Q28 property goals =====
DROP POLICY IF EXISTS "BD reads goals" ON public.sales_goals;
CREATE POLICY "BD reads goals" ON public.sales_goals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'bd_manager'));

CREATE OR REPLACE FUNCTION public.property_goal_progress(_client_id uuid, _fy integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE yearly numeric; res jsonb;
BEGIN
  IF NOT (can_manage_finance(auth.uid()) OR is_res_desk_head(auth.uid()) OR has_role(auth.uid(), 'bd_manager')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT goal_inr INTO yearly FROM sales_goals WHERE scope = 'property' AND subject_key = _client_id::text AND fy = _fy AND month_no = 0;
  WITH months AS (SELECT (make_date(_fy, 4, 1) + (i || ' month')::interval)::date m FROM generate_series(0, 11) i),
  rows AS (
    SELECT mo.m,
      coalesce((SELECT g.goal_inr FROM sales_goals g WHERE g.scope = 'property' AND g.subject_key = _client_id::text
                 AND g.fy = _fy AND g.month_no = extract(month FROM mo.m)::int), round(yearly / 12, 0)) goal,
      (SELECT coalesce(sum(b.deal_inr), 0) FROM bookings b WHERE b.client_id = _client_id AND b.status = 'BOOKED'
          AND b.voided_at IS NULL AND NOT b.is_demo AND b.stay_month = mo.m) achieved
    FROM months mo)
  SELECT jsonb_build_object('fy', _fy, 'yearly_goal', yearly,
     'achieved', (SELECT sum(achieved) FROM rows),
     'months', coalesce(jsonb_agg(jsonb_build_object('month', m, 'goal', goal, 'achieved', achieved,
                 'pct', CASE WHEN coalesce(goal, 0) > 0 THEN round(achieved * 100 / goal, 1) END) ORDER BY m), '[]'))
    INTO res FROM rows;
  RETURN res;
END $$;

-- ===== Q20 brand roll-up =====
CREATE OR REPLACE FUNCTION public.brand_rollup(_parent uuid, _month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m0 date := date_trunc('month', _month)::date; res jsonb;
BEGIN
  IF NOT (is_staff(auth.uid()) AND can_view_client(_parent)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  WITH kids AS (SELECT id, hotel_name, client_code FROM clients WHERE parent_client_id = _parent),
  e AS (
    SELECT k.id cid, pl.name pipeline, kd.id kid, kd.name kpi, kd.unit, kd.direction, kd.sort_order,
           (kd.kpi_type IN ('percentage','rating') OR kd.unit IN ('minutes','rank')) is_rate,
           en.actual, en.target, en.achievement_pct
      FROM kids k JOIN monthly_reports r ON r.client_id = k.id AND r.month = m0 AND r.status <> 'draft'
      JOIN client_pipelines cp ON cp.id = r.client_pipeline_id JOIN pipelines pl ON pl.id = cp.pipeline_id
      JOIN kpi_entries en ON en.report_id = r.id JOIN kpi_definitions kd ON kd.id = en.kpi_definition_id),
  props AS (
    SELECT k.id, k.hotel_name, k.client_code, (SELECT round(avg(achievement_pct), 1) FROM e WHERE e.cid = k.id) score,
           (SELECT count(DISTINCT pipeline) FROM e WHERE e.cid = k.id) pipelines
      FROM kids k)
  SELECT jsonb_build_object('month', m0,
    'brand_score', (SELECT round(avg(score), 1) FROM props WHERE score IS NOT NULL),
    'properties', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', hotel_name, 'code', client_code, 'score', score, 'pipelines', pipelines) ORDER BY client_code) FROM props), '[]'),
    'kpis', coalesce((SELECT jsonb_agg(x ORDER BY x->>'pipeline', (x->>'sort')::int) FROM (
        SELECT jsonb_build_object('pipeline', pipeline, 'kpi', kpi, 'unit', unit, 'direction', direction, 'sort', min(sort_order),
               'rate', bool_or(is_rate),
               'actual', CASE WHEN bool_or(is_rate) THEN round(avg(actual), 2) ELSE sum(actual) END,
               'target', CASE WHEN bool_or(is_rate) THEN round(avg(target), 2) ELSE sum(target) END,
               'properties', count(DISTINCT cid)) x
          FROM e GROUP BY pipeline, kpi, unit, direction) s), '[]'))
  INTO res;
  RETURN res;
END $$;

-- ===== BD tracker tabs =====
CREATE TABLE IF NOT EXISTS public.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  source_name text NOT NULL,
  month date NOT NULL,
  status text NOT NULL DEFAULT 'submitted_imported' CHECK (status IN ('submitted_imported')),
  flag text,
  source text NOT NULL DEFAULT 'BD tracker workbook, tab: Hotel Growth Report',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_name, month)
);
GRANT SELECT ON public.report_history TO authenticated;
GRANT ALL ON public.report_history TO service_role;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read report history" ON public.report_history;
CREATE POLICY "staff read report history" ON public.report_history FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR (client_id IS NOT NULL AND public.is_staff(auth.uid()) AND public.can_view_client(client_id)));

CREATE TABLE IF NOT EXISTS public.imported_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'BD tracker workbook, tab: Issue Logs',
  issue_no integer NOT NULL,
  raised_on date,
  category text,
  issue text NOT NULL,
  action_taken text,
  status text NOT NULL,
  raised_by text,
  owner_name text,
  owner_id uuid REFERENCES public.profiles(id),
  candidate_client_ids uuid[] NOT NULL DEFAULT '{}',
  client_id uuid REFERENCES public.clients(id),
  action_item_id uuid REFERENCES public.action_items(id),
  flag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, issue_no)
);
GRANT SELECT ON public.imported_issues TO authenticated;
GRANT ALL ON public.imported_issues TO service_role;
ALTER TABLE public.imported_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read imported issues" ON public.imported_issues;
CREATE POLICY "staff read imported issues" ON public.imported_issues FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR owner_id = auth.uid()
         OR (client_id IS NOT NULL AND public.is_staff(auth.uid()) AND public.can_view_client(client_id)));

CREATE OR REPLACE FUNCTION public.assign_imported_issue(_issue_id uuid, _client_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i imported_issues; aid uuid; pid uuid;
BEGIN
  IF NOT is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only management can assign an imported issue to a client'; END IF;
  SELECT * INTO i FROM imported_issues WHERE id = _issue_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Issue not found'; END IF;
  IF i.action_item_id IS NOT NULL THEN RETURN i.action_item_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = _client_id) THEN RAISE EXCEPTION 'Client not found'; END IF;
  SELECT id INTO pid FROM pipelines WHERE code = CASE WHEN i.category ILIKE 'social%' THEN 'social_media' ELSE NULL END;
  INSERT INTO action_items (client_id, pipeline_id, issue, action_required, responsible_id, priority, due_date, status, comments, created_by, created_at)
  VALUES (_client_id, pid, i.issue, i.action_taken, i.owner_id, 'medium', NULL,
          CASE WHEN i.status ILIKE 'resolved%' THEN 'completed'::action_status ELSE 'in_progress'::action_status END,
          'Imported from ' || i.source || ' #' || i.issue_no || coalesce('. Raised by ' || i.raised_by, ''), auth.uid(),
          coalesce(i.raised_on::timestamptz, now()))
  RETURNING id INTO aid;
  UPDATE imported_issues SET client_id = _client_id, action_item_id = aid, flag = NULL WHERE id = _issue_id;
  RETURN aid;
END $$;

CREATE TABLE IF NOT EXISTS public.bd_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bd_user_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN ('monthly_retainer','new_clients')),
  plan_code text,
  target_value numeric NOT NULL CHECK (target_value >= 0),
  period_start date,
  due_date date,
  notes text,
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'monthly_retainer' OR plan_code IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS bd_targets_unique ON public.bd_targets (bd_user_id, kind, coalesce(plan_code, ''), coalesce(due_date, '1900-01-01'::date));
GRANT SELECT, INSERT, UPDATE ON public.bd_targets TO authenticated;
GRANT ALL ON public.bd_targets TO service_role;
ALTER TABLE public.bd_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bd targets read" ON public.bd_targets;
CREATE POLICY "bd targets read" ON public.bd_targets FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR bd_user_id = auth.uid() OR public.has_role(auth.uid(), 'bd_manager'));
DROP POLICY IF EXISTS "bd targets insert" ON public.bd_targets;
CREATE POLICY "bd targets insert" ON public.bd_targets FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
DROP POLICY IF EXISTS "bd targets update" ON public.bd_targets;
CREATE POLICY "bd targets update" ON public.bd_targets FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.bd_target_progress() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT (is_manager(auth.uid()) OR has_role(auth.uid(), 'bd_manager')) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'bd_user_id', t.bd_user_id, 'bd_name', p.full_name, 'kind', t.kind, 'plan_code', t.plan_code,
      'plan_name', pl.name, 'target', t.target_value, 'period_start', t.period_start, 'due_date', t.due_date,
      'past', t.due_date IS NOT NULL AND t.due_date < today, 'notes', t.notes,
      'actual', CASE WHEN t.kind = 'monthly_retainer' THEN
          (SELECT coalesce(sum(l.retainer_inr), 0) FROM client_launches l JOIN clients c ON c.id = l.client_id
            WHERE l.status IN ('active','live') AND NOT c.is_test AND (l.bd_owner_id = t.bd_user_id OR l.bd_owner_id IS NULL))
        ELSE
          (SELECT count(*) FROM client_launches l JOIN clients c ON c.id = l.client_id JOIN plans lp ON lp.id = l.plan_id
            WHERE NOT c.is_test AND lp.code = t.plan_code AND l.change_kind IS NULL
              AND l.status NOT IN ('draft','proposed','cancelled')
              AND l.contract_start >= coalesce(t.period_start, '-infinity'::date) AND l.contract_start <= coalesce(t.due_date, today)
              AND (l.bd_owner_id = t.bd_user_id OR l.bd_owner_id IS NULL))
        END) ORDER BY t.kind, t.due_date NULLS FIRST, t.plan_code)
    FROM bd_targets t JOIN profiles p ON p.id = t.bd_user_id LEFT JOIN plans pl ON pl.code = t.plan_code
   WHERE is_manager(auth.uid()) OR t.bd_user_id = auth.uid() OR has_role(auth.uid(), 'bd_manager')), '[]'::jsonb);
END $$;

-- ===== function grants =====
REVOKE EXECUTE ON FUNCTION public._code_num(bigint), public.client_code_assign(), public.block_kpi_on_hold(), public.day0_guard(),
  public._day0_missing(public.client_launches), public.kpi_target_guard(), public.notify_targets_due(date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_codes(), public.client_on_hold(uuid), public.hold_launch(uuid, text), public.resume_launch(uuid),
  public.day0_readiness(uuid), public.kpi_prev_actual(uuid, uuid, date), public.kpi_suggest_target(uuid, uuid, date),
  public.kpi_target_state(uuid, uuid, date), public.targets_due(date), public.approve_kpi_targets(uuid[]),
  public.property_goal_progress(uuid, integer), public.brand_rollup(uuid, date), public.assign_imported_issue(uuid, uuid),
  public.bd_target_progress(), public.create_monthly_reports(date), public.remind_report_deadlines(), public.team_scorecard(date),
  public.confirm_day0(uuid, date), public.kpi_target_for(uuid, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_codes(), public.client_on_hold(uuid), public.hold_launch(uuid, text), public.resume_launch(uuid),
  public.day0_readiness(uuid), public.kpi_suggest_target(uuid, uuid, date), public.targets_due(date), public.approve_kpi_targets(uuid[]),
  public.property_goal_progress(uuid, integer), public.brand_rollup(uuid, date), public.assign_imported_issue(uuid, uuid),
  public.bd_target_progress(), public.team_scorecard(date), public.confirm_day0(uuid, date), public.create_monthly_reports(date)
  TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;