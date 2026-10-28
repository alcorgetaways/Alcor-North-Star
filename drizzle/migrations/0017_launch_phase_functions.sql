CREATE OR REPLACE FUNCTION public.activate_client_launch(_launch_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l public.client_launches; prev public.client_launches; unassigned text; n integer; tp public.plans;
  pipe_map jsonb := '{"meta_ads":"performance_marketing","google_ads":"performance_marketing","social":"social_media",
  "gmb":"gbp","ota":"ota","b2b":"email_marketing","influencer":"influencer","whatsapp":"whatsapp","reservations":"reservations_desk",
  "website":"website_seo","funnel":"marketing_funnel"}';
BEGIN
  SELECT * INTO l FROM client_launches WHERE id = _launch_id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT can_edit_client(l.client_id) THEN RAISE EXCEPTION 'Only BD or management can activate'; END IF;
  IF l.status NOT IN ('draft','awaiting_day0') THEN RAISE EXCEPTION 'Launch is already %', l.status; END IF;
  IF l.day0_date IS NULL THEN RAISE EXCEPTION 'Confirm Day 0 first'; END IF;
  SELECT * INTO tp FROM plans WHERE id = l.plan_id;
  SELECT * INTO prev FROM client_launches WHERE id = l.upgraded_from_launch_id;

  SELECT string_agg(m.name, ', ') INTO unassigned
  FROM plan_modules pm JOIN launch_modules m ON m.code = pm.module_code
  LEFT JOIN client_module_assignments a ON a.launch_id = l.id AND a.module_code = pm.module_code
  LEFT JOIN profiles pr ON pr.id = a.primary_user_id
  WHERE pm.plan_id = l.plan_id
    AND (a.primary_user_id IS NULL OR pr.status <> 'active' OR (m.client_side AND a.client_contact_name IS NULL));
  IF unassigned IS NOT NULL THEN RAISE EXCEPTION 'Assign an active owner (and the hotel contact for client-side departments) for: %', unassigned; END IF;

  -- Canonical templates only: tagged to the plan, or (custom plans) matching the custom services' pipelines + P0 core.
  INSERT INTO client_tasks (launch_id, client_id, template_id, module_code, code, name, standard,
    week_label, week_start, week_due, due_date, requires_client_approval, assignee_id, backup_id, sort_order,
    status, done_at, done_by, client_approved_at, evidence_url, notes, carried_from_task_id, phase_code, pipeline_code)
  SELECT l.id, l.client_id, t.id, t.module_code, t.code, t.name, t.standard, t.week_label,
         t.week_start, t.week_due, launch_due_date(l.day0_date, t.week_due),
         t.requires_client_approval, a.primary_user_id, a.backup_user_id, t.sort_order,
         CASE WHEN c.ok THEN 'done' ELSE 'not_started' END,
         CASE WHEN c.ok THEN c.done_at END, CASE WHEN c.ok THEN c.done_by END,
         CASE WHEN c.ok THEN c.approved_at END, CASE WHEN c.ok THEN c.evidence END,
         CASE WHEN c.ok THEN 'Carried over from the previous plan (' || c.codes || ')' END,
         CASE WHEN c.ok THEN c.first_task END,
         t.phase_code, t.pipeline_code
  FROM checklist_templates t
  JOIN client_module_assignments a ON a.launch_id = l.id AND a.module_code = t.module_code
  LEFT JOIN LATERAL (
    SELECT bool_and(pt.status = 'done') AND count(pt.id) = count(*) AS ok,
           max(pt.done_at) AS done_at, (array_agg(pt.done_by ORDER BY pt.done_at DESC))[1] AS done_by,
           max(pt.client_approved_at) AS approved_at,
           (array_agg(pt.evidence_url) FILTER (WHERE pt.evidence_url IS NOT NULL))[1] AS evidence,
           string_agg(co.from_code, ' + ' ORDER BY co.from_code) AS codes,
           (array_agg(pt.id))[1] AS first_task
    FROM plan_task_carryover co
    LEFT JOIN client_tasks pt ON pt.launch_id = prev.id AND pt.code = co.from_code AND pt.phase = 'onboarding'
    WHERE prev.id IS NOT NULL AND co.from_plan_id = prev.plan_id AND co.to_plan_id = l.plan_id AND co.to_code = t.code
    HAVING count(*) > 0
  ) c ON true
  WHERE t.active AND t.superseded_by IS NULL
    AND (
      (l.custom_plan_id IS NULL AND EXISTS (
        SELECT 1 FROM checklist_template_plans ctp WHERE ctp.template_id = t.id AND ctp.plan_id = l.plan_id))
      OR (l.custom_plan_id IS NOT NULL AND (
           t.phase_code = 'P0'
           OR t.pipeline_code IN (SELECT cps.pipeline_code FROM custom_plan_services cps
                                  WHERE cps.custom_plan_id = l.custom_plan_id AND cps.included AND cps.pipeline_code IS NOT NULL)))
    )
    AND NOT (t.code IN ('BRD.07','BRD.08','BRD.09','BRD.10') AND NOT ('landing_page' = ANY(l.addons)))
  ON CONFLICT (launch_id, code) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO client_gates (launch_id, client_id, gate_code, gate_name, due_week, due_date, signer_role, rule, criteria, phase_code)
  SELECT l.id, l.client_id, g.gate_code, min(g.gate_name), min(g.due_week),
         launch_due_date(l.day0_date, min(g.due_week)), min(g.signer_role), min(g.rule),
         array_agg(g.criterion ORDER BY g.sort_order), min(g.phase_code)
  FROM gate_criteria g WHERE g.plan_id = l.plan_id GROUP BY g.gate_code
  ON CONFLICT (launch_id, gate_code) DO NOTHING;

  INSERT INTO client_pipelines (client_id, pipeline_id, manager_id, backup_manager_id, start_date, status)
  SELECT DISTINCT ON (p.id) l.client_id, p.id, a.primary_user_id, a.backup_user_id, l.launch_date, 'onboarding'
  FROM client_module_assignments a JOIN launch_modules m ON m.code = a.module_code
  JOIN pipelines p ON p.code = pipe_map ->> m.kpi_pipeline_code
  WHERE a.launch_id = l.id
  ORDER BY p.id, m.kpi_primary DESC, a.module_code
  ON CONFLICT (client_id, pipeline_id) DO UPDATE SET status = CASE WHEN client_pipelines.status = 'ended' THEN 'onboarding' ELSE client_pipelines.status END;

  -- pipelines the new plan no longer includes stop
  UPDATE client_pipelines cp SET status = 'ended'
  WHERE cp.client_id = l.client_id AND cp.status <> 'ended' AND NOT EXISTS (
    SELECT 1 FROM plan_modules pm JOIN launch_modules m ON m.code = pm.module_code JOIN pipelines p ON p.code = pipe_map ->> m.kpi_pipeline_code
    WHERE pm.plan_id = l.plan_id AND p.id = cp.pipeline_id);

  UPDATE client_launches SET status = 'active', activated_at = now(), activated_by = auth.uid() WHERE id = l.id;
  UPDATE clients SET onboarding_status = 'in_progress', status = 'active' WHERE id = l.client_id;
  IF prev.id IS NOT NULL THEN
    UPDATE client_launches SET status = 'closed', closed_at = coalesce(closed_at, now()),
      closed_reason = coalesce(closed_reason, 'Replaced by ' || tp.name) WHERE id = prev.id AND status <> 'closed';
    UPDATE client_tasks SET status = 'not_applicable', notes = coalesce(notes || ' · ', '') || 'Superseded by ' || tp.name
    WHERE launch_id = prev.id AND phase = 'onboarding' AND status NOT IN ('done','not_applicable');
  END IF;
  PERFORM refresh_gate_status(l.id);
  INSERT INTO launch_events (launch_id, user_id, kind, details) VALUES (l.id, auth.uid(), 'activated', jsonb_build_object('tasks', n));

  INSERT INTO notifications (user_id, title, body, link, kind)
  SELECT t.assignee_id,
         CASE WHEN prev.id IS NULL THEN 'New client launch assigned' ELSE 'Client moved to ' || tp.name END,
         count(*) FILTER (WHERE t.status <> 'done') || ' open tasks for ' || (SELECT hotel_name FROM clients WHERE id = l.client_id) ||
         coalesce('. First due ' || to_char(min(t.due_date) FILTER (WHERE t.status <> 'done'),'DD Mon'), ''),
         '/launches/' || l.id, 'assignment'
  FROM client_tasks t WHERE t.launch_id = l.id AND t.assignee_id IS NOT NULL GROUP BY t.assignee_id;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_launch()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'plan', p.name, 'status', l.status, 'day0', l.day0_date, 'launch_date', l.launch_date,
    'total_weeks', p.duration_weeks,
    'week', CASE WHEN l.day0_date IS NULL THEN 0 ELSE GREATEST(0, LEAST(p.duration_weeks, CEIL(((now() AT TIME ZONE 'Asia/Kolkata')::date - l.day0_date) / 7.0)::int)) END,
    'upgraded_from', (SELECT pp.name FROM client_launches pl2 JOIN plans pp ON pp.id = pl2.plan_id WHERE pl2.id = l.upgraded_from_launch_id),
    'exit_date', l.exit_date,
    'progress_pct', (SELECT round(100.0 * count(*) FILTER (WHERE status IN ('done','not_applicable')) / NULLIF(count(*),0))
                     FROM client_tasks WHERE launch_id = l.id AND phase = 'onboarding'),
    'gates', (SELECT jsonb_agg(jsonb_build_object('name', g.gate_name, 'due', g.due_date, 'status', g.status,
                     'phase', g.phase_code, 'phase_name', ph.name, 'phase_sort', ph.sort_order)
                     ORDER BY ph.sort_order NULLS LAST, g.due_week, g.gate_name)
              FROM client_gates g LEFT JOIN launch_phases ph ON ph.code = g.phase_code WHERE g.launch_id = l.id),
    'waiting_on_you', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'standard', standard,
                         'evidence_url', evidence_url, 'requested', client_approval_requested_at) ORDER BY due_date), '[]')
              FROM client_tasks WHERE launch_id = l.id AND status = 'waiting_client' AND client_approved_at IS NULL),
    'approved_by_you', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'approved', client_approved_at) ORDER BY client_approved_at DESC), '[]')
              FROM client_tasks WHERE launch_id = l.id AND client_approved_at IS NOT NULL),
    'modules', (SELECT jsonb_agg(jsonb_build_object('module', m.name, 'phase', x.phase_code, 'phase_name', ph.name,
                       'phase_sort', ph.sort_order, 'done', x.done, 'total', x.total)
                       ORDER BY ph.sort_order NULLS LAST, m.code)
              FROM (SELECT module_code, min(phase_code) AS phase_code, count(*) total,
                           count(*) FILTER (WHERE status IN ('done','not_applicable')) done
                    FROM client_tasks WHERE launch_id = l.id AND phase = 'onboarding' GROUP BY module_code) x
              JOIN launch_modules m ON m.code = x.module_code
              LEFT JOIN launch_phases ph ON ph.code = x.phase_code))
  FROM client_launches l JOIN plans p ON p.id = l.plan_id
  WHERE l.id = (SELECT id FROM client_launches
                WHERE client_id = my_client_id() AND status IN ('active','awaiting_day0','live','offboarding')
                ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'offboarding' THEN 1 WHEN 'awaiting_day0' THEN 2 ELSE 3 END, created_at DESC LIMIT 1);
$function$;