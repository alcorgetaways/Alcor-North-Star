CREATE OR REPLACE FUNCTION public.generate_staff_duties(_month date DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date))
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  m date := date_trunc('month', _month)::date;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  t public.staff_duty_templates%ROWTYPE;
  v_plan uuid; v_family uuid; v_item uuid;
  v_due date; v_occ uuid; n int := 0; d date;
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
        IF m = date_trunc('month', today)::date AND d < today THEN CONTINUE; END IF;
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
        IF m = date_trunc('month', today)::date AND v_due < today THEN CONTINUE; END IF;
        v_occ := md5('staffduty-task:' || t.id::text || ':' || v_due::text)::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.recurring_tasks rt WHERE rt.family_id = v_family AND rt.occurrence_key = v_occ) THEN
          INSERT INTO public.recurring_tasks (plan_id, item_id, family_id, occurrence_key, stage, due_date, original_due_date, owner_id, backup_id, status)
          VALUES (v_plan, v_item, v_family, v_occ, 'publish', v_due, d, t.owner_id, coalesce(t.backup_id,t.owner_id), 'not_started');
          n := n + 1;
        END IF;
      END LOOP;
      CONTINUE;
    END IF;
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