ALTER TABLE public.clients ADD COLUMN gbp_profile_name text;
COMMENT ON COLUMN public.clients.gbp_profile_name IS 'Display name of the Google Business Profile managed for this client';
ALTER TABLE public.clients ADD COLUMN is_internal boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clients.is_internal IS 'Internal/non-hotel GBP account (Alcor''s own profile, partner clinics) — excluded from billing, MRR, sales and hotel counts';

CREATE TABLE public.staff_duty_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id),
  anchor_client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  backup_id uuid REFERENCES public.profiles(id),
  title text NOT NULL,
  details text,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('one_off','daily','weekly','twice_monthly','monthly','quarterly','ongoing','on_request')),
  due_date date,
  month_days int[],
  count_target int,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.staff_duty_templates TO authenticated;
GRANT ALL ON public.staff_duty_templates TO service_role;
ALTER TABLE public.staff_duty_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_duty_templates_read ON public.staff_duty_templates FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(),'client') AND (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'admin') OR owner_id=auth.uid() OR backup_id=auth.uid() OR EXISTS (SELECT 1 FROM public.pipeline_members pm WHERE pm.pipeline_id=staff_duty_templates.pipeline_id AND pm.user_id=auth.uid() AND pm.active)));
CREATE POLICY staff_duty_templates_insert ON public.staff_duty_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.pipeline_members pm WHERE pm.pipeline_id=staff_duty_templates.pipeline_id AND pm.user_id=auth.uid() AND pm.active));
CREATE POLICY staff_duty_templates_update ON public.staff_duty_templates FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.is_pipeline_head(auth.uid(), pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.is_pipeline_head(auth.uid(), pipeline_id));
CREATE INDEX staff_duty_templates_active_idx ON public.staff_duty_templates(active) WHERE active;

CREATE OR REPLACE FUNCTION public._duty_working_on_or_before(_d date) RETURNS date
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT max(d::date) FROM generate_series(_d - 6, _d, interval '1 day') d
  WHERE extract(isodow FROM d) <> 7 AND NOT EXISTS (SELECT 1 FROM public.activity_holidays WHERE day = d::date)
$$;

CREATE OR REPLACE FUNCTION public.generate_staff_duties(_month date DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date))
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  m date := date_trunc('month', _month)::date;
  t public.staff_duty_templates%ROWTYPE;
  v_plan uuid; v_family uuid; v_item uuid;
  v_due date; v_occ uuid; n int := 0; d date; md int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.pipeline_members pm WHERE pm.user_id=auth.uid() AND pm.role='head' AND pm.active)) THEN
    RAISE EXCEPTION 'Management or pipeline heads only';
  END IF;
  FOR t IN SELECT * FROM public.staff_duty_templates WHERE active AND frequency <> 'on_request' LOOP
    IF t.frequency = 'one_off' AND (t.due_date IS NULL OR date_trunc('month', t.due_date)::date <> m) THEN CONTINUE; END IF;
    IF t.frequency = 'quarterly' AND extract(month FROM m) NOT IN (3,6,9,12) THEN CONTINUE; END IF;
    v_family := md5('staffduty-plan:' || t.anchor_client_pipeline_id::text || ':' || m::text)::uuid;
    SELECT id INTO v_plan FROM public.activity_plans WHERE family_id = v_family;
    IF v_plan IS NULL THEN
      INSERT INTO public.activity_plans (client_pipeline_id, month, version, family_id, status, created_by, approved_by, approved_at)
      VALUES (t.anchor_client_pipeline_id, m, 1, v_family, 'approved', t.owner_id, t.owner_id, now())
      RETURNING id INTO v_plan;
    END IF;
    v_occ := md5('staffduty-item:' || t.id::text)::uuid;
    SELECT id INTO v_item FROM public.activity_items WHERE plan_id = v_plan AND occurrence_key = v_occ;
    IF v_item IS NULL THEN
      INSERT INTO public.activity_items (plan_id, occurrence_key, activity_type_id, name, quantity, publish_on, owner_id, backup_id)
      VALUES (v_plan, v_occ, NULL, t.title, greatest(coalesce(t.count_target,1),1),
              public._duty_working_on_or_before((m + interval '1 month' - interval '1 day')::date),
              t.owner_id, coalesce(t.backup_id, t.owner_id))
      RETURNING id INTO v_item;
    END IF;
    IF t.frequency = 'daily' THEN
      FOR d IN SELECT dd::date FROM generate_series(m, (m + interval '1 month' - interval '1 day')::date, interval '1 day') dd
               WHERE extract(isodow FROM dd) <> 7 AND NOT EXISTS (SELECT 1 FROM public.activity_holidays WHERE day = dd::date) LOOP
        v_occ := md5('staffduty-task:' || t.id::text || ':' || d::text)::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.recurring_tasks rt WHERE rt.family_id = v_family AND rt.occurrence_key = v_occ) THEN
          INSERT INTO public.recurring_tasks (plan_id, item_id, family_id, occurrence_key, stage, due_date, original_due_date, owner_id, backup_id, status)
          VALUES (v_plan, v_item, v_family, v_occ, 'publish', d, d, t.owner_id, coalesce(t.backup_id,t.owner_id), 'not_started');
          n := n + 1;
        END IF;
      END LOOP;
      CONTINUE;
    END IF;
    IF t.frequency IN ('weekly','twice_monthly') THEN
      FOR d IN
        SELECT dd::date FROM generate_series(m, (m + interval '1 month' - interval '1 day')::date, interval '1 day') dd
        WHERE (t.frequency = 'weekly' AND extract(isodow FROM dd) = 6)
           OR (t.frequency = 'twice_monthly' AND extract(day FROM dd) = ANY (coalesce(t.month_days, '{15,30}'::int[])))
      LOOP
        v_due := public._duty_working_on_or_before(d);
        IF date_trunc('month', v_due)::date <> m THEN v_due := d; END IF;
        v_occ := md5('staffduty-task:' || t.id::text || ':' || v_due::text)::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.recurring_tasks rt WHERE rt.family_id = v_family AND rt.occurrence_key = v_occ) THEN
          INSERT INTO public.recurring_tasks (plan_id, item_id, family_id, occurrence_key, stage, due_date, original_due_date, owner_id, backup_id, status)
          VALUES (v_plan, v_item, v_family, v_occ, 'publish', v_due, d, t.owner_id, coalesce(t.backup_id,t.owner_id), 'not_started');
          n := n + 1;
        END IF;
      END LOOP;
      CONTINUE;
    END IF;
    -- monthly / quarterly / ongoing / one_off: single task on (or before) the month's last working day
    v_due := CASE WHEN t.frequency = 'one_off' THEN t.due_date
                  ELSE public._duty_working_on_or_before((m + interval '1 month' - interval '1 day')::date) END;
    v_occ := md5('staffduty-task:' || t.id::text || ':' || m::text)::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.recurring_tasks rt WHERE rt.family_id = v_family AND rt.occurrence_key = v_occ) THEN
      INSERT INTO public.recurring_tasks (plan_id, item_id, family_id, occurrence_key, stage, due_date, original_due_date, owner_id, backup_id, status, notes)
      VALUES (v_plan, v_item, v_family, v_occ, 'publish', v_due, v_due, t.owner_id, coalesce(t.backup_id,t.owner_id), 'not_started',
              CASE WHEN t.frequency = 'ongoing' THEN 'Ongoing duty — log progress here; no fixed deadline.' ELSE NULL END);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $fn$;
SELECT cron.schedule('north-star-staff-duties','30 1 * * *','SELECT public.generate_staff_duties();');

CREATE OR REPLACE FUNCTION public.targets_due(_month date DEFAULT ((date_trunc('month'::text, (now() AT TIME ZONE 'Asia/Kolkata'::text)) + '1 mon'::interval))::date)
 RETURNS TABLE(client_pipeline_id uuid, client_id uuid, hotel_name text, client_code text, pipeline_code text, pipeline_name text, kpi_definition_id uuid, kpi_name text, unit text, direction text, prev_actual numeric, suggested numeric, target_id uuid, target numeric, status text, baseline boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT cp.id, c.id, c.hotel_name, c.client_code, p.code, p.name, k.id, k.name, k.unit, k.direction, x.pa,
         CASE WHEN x.pa IS NULL THEN NULL WHEN k.direction = 'higher_better' THEN round(x.pa * 1.1, 2) ELSE x.pa END,
         t.id, t.target, t.status, (x.pa IS NULL AND t.id IS NULL)
    FROM client_pipelines cp
    JOIN clients c ON c.id = cp.client_id AND NOT c.is_demo AND NOT c.is_test AND NOT c.is_internal
    JOIN pipelines p ON p.id = cp.pipeline_id
    JOIN kpi_definitions k ON k.pipeline_id = cp.pipeline_id AND k.active
    LEFT JOIN client_kpi_targets t ON t.client_pipeline_id = cp.id AND t.kpi_definition_id = k.id AND t.month = date_trunc('month', _month)::date
    CROSS JOIN LATERAL (SELECT public.kpi_prev_actual(cp.id, k.id, _month) pa) x
   WHERE cp.status = 'active' AND NOT public.client_on_hold(c.id)
     AND (is_manager(auth.uid()) OR (public.is_pipeline_head(auth.uid(), cp.pipeline_id) AND public.can_view_pipeline(cp.id)))
   ORDER BY c.hotel_name, p.name, k.sort_order;
$function$;

CREATE OR REPLACE FUNCTION public.notify_targets_due(_today date DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata'::text))::date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    JOIN clients c ON c.id = cp.client_id AND NOT c.is_test AND NOT c.is_internal
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
END $function$;

CREATE OR REPLACE FUNCTION public.update_recurring_task(_task uuid, _status text, _due date DEFAULT NULL::date, _reason text DEFAULT NULL::text, _owner uuid DEFAULT NULL::uuid, _backup uuid DEFAULT NULL::uuid, _evidence text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t recurring_tasks;p activity_plans;cp client_pipelines;head boolean; BEGIN PERFORM activity_require_ready(); SELECT * INTO t FROM recurring_tasks WHERE id=_task FOR UPDATE; SELECT * INTO p FROM activity_plans WHERE id=t.plan_id; SELECT * INTO cp FROM client_pipelines WHERE id=p.client_pipeline_id; IF t.status IN('not_started','in_progress') AND (p.month+interval '1 month')::date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND t.due_date<(now() AT TIME ZONE 'Asia/Kolkata')::date THEN t.status:='missed_review'; END IF; IF t.id IS NULL OR NOT activity_can_read(cp.id) OR has_role(auth.uid(),'client') THEN RAISE EXCEPTION 'Task not available'; END IF; head:=activity_can_head(cp.id); IF client_on_hold(cp.client_id) THEN RAISE EXCEPTION 'This hotel is on hold'; END IF; IF t.status IN('done','closed','superseded') THEN RAISE EXCEPTION 'Completed and historical tasks are preserved'; END IF; IF NOT(head OR t.owner_id=auth.uid() OR t.backup_id=auth.uid()) THEN RAISE EXCEPTION 'Task owner, backup or head only'; END IF;
 IF t.status='missed_review' AND _due IS NULL AND _status<>'closed' THEN RAISE EXCEPTION 'Head must reschedule or close missed tasks with a reason'; END IF; IF _due IS NOT NULL OR _status='closed' OR _owner IS NOT NULL OR _backup IS NOT NULL THEN IF NOT head OR coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Head review and a reason are required'; END IF; END IF;
 IF _due IS NOT NULL AND _status='closed' THEN RAISE EXCEPTION 'Choose reschedule or close'; END IF;
 IF _due IS NOT NULL AND t.status<>'missed_review' THEN RAISE EXCEPTION 'Only missed tasks can be rescheduled after review'; END IF; IF _status='done' AND t.stage='approval' AND EXISTS(SELECT 1 FROM task_approval_blockers b WHERE b.task_kind='recurring' AND b.task_id=t.id AND b.owner_approved_at IS NULL AND b.resolved_at IS NULL) THEN RAISE EXCEPTION 'The client must approve this item first'; END IF; IF _due IS NULL AND _status NOT IN('not_started','in_progress','blocked','waiting_client','done','closed') THEN RAISE EXCEPTION 'Invalid task status'; END IF;
 IF _owner IS NOT NULL OR _backup IS NOT NULL THEN IF (coalesce(_owner,t.owner_id)=coalesce(_backup,t.backup_id) AND NOT is_pipeline_head(coalesce(_owner,t.owner_id),cp.pipeline_id)) OR (SELECT count(DISTINCT a.user_id) FROM client_staff_assignments a WHERE a.client_id=cp.client_id AND a.pipeline_id=cp.pipeline_id AND NOT a.excluded AND a.user_id IN(coalesce(_owner,t.owner_id),coalesce(_backup,t.backup_id)))<>(CASE WHEN coalesce(_owner,t.owner_id)=coalesce(_backup,t.backup_id) THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'Owner and backup must be different assigned people'; END IF; END IF;
 INSERT INTO activity_task_history(task_id,actor,action,reason,old_due,new_due) VALUES(t.id,auth.uid(),CASE WHEN _due IS NOT NULL THEN 'rescheduled' ELSE _status END,_reason,t.due_date,coalesce(_due,t.due_date)); UPDATE recurring_tasks SET status=CASE WHEN _due IS NOT NULL THEN 'not_started' ELSE _status END,due_date=coalesce(_due,due_date),owner_id=coalesce(_owner,owner_id),backup_id=coalesce(_backup,backup_id),done_at=CASE WHEN _status='done' THEN now() END,done_by=CASE WHEN _status='done' THEN auth.uid() END,review_reason=coalesce(_reason,review_reason),notes=CASE WHEN coalesce(btrim(_evidence),'')<>'' THEN btrim(_evidence) ELSE notes END WHERE id=t.id; END $function$;