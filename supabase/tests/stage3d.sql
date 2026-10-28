-- Stage 3 Q20–Q49 tests: KPI target rules (Q49 a–e), on hold (Q22), Day 0 (Q42), client codes (Q24), goals (Q28).
-- Always aborts at the end so nothing is kept. Success = error text "STAGE3D TESTS PASSED: n/n FAILS:" with nothing after FAILS.
DO $$
DECLARE
  head uuid := gen_random_uuid(); mgr uuid; hx uuid := gen_random_uuid(); hy uuid := gen_random_uuid(); hz uuid := gen_random_uuid();
  pid uuid; cp uuid; cpy uuid; rjan uuid; rfeb uuid; lz uuid; ld uuid; k_enq uuid; k_resp uuid; k_conv uuid; k_fu uuid; k_miss uuid;
  n int; v numeric; s text; j jsonb; ok boolean; c1 text; c2 text; tid uuid;
  passed int := 0; total int := 0; fails text := '';
BEGIN
  SELECT id INTO mgr FROM profiles WHERE email = 'mohnish@group2001.in';
  SELECT id INTO pid FROM pipelines WHERE code = 'reservations_desk';
  SELECT id INTO k_enq FROM kpi_definitions WHERE pipeline_id = pid AND source_key = 'pke.enquiries_handled';
  SELECT id INTO k_resp FROM kpi_definitions WHERE pipeline_id = pid AND source_key = 'pke.avg_response_min';
  SELECT id INTO k_conv FROM kpi_definitions WHERE pipeline_id = pid AND source_key = 'pke.conversion_rate';
  SELECT id INTO k_fu FROM kpi_definitions WHERE pipeline_id = pid AND source_key = 'pke.follow_ups';
  SELECT id INTO k_miss FROM kpi_definitions WHERE pipeline_id = pid AND source_key = 'pke.missed_calls';

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (head, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-head3d@test.local', '{}', now(), now());
  INSERT INTO profiles (id, full_name, status) VALUES (head, 'T Head', 'active')
    ON CONFLICT (id) DO UPDATE SET status = 'active', client_id = NULL;
  DELETE FROM user_roles WHERE user_id = head;
  INSERT INTO user_roles (user_id, role) VALUES (head, 'pipeline_manager');
  INSERT INTO clients (id, hotel_name) VALUES (hx, 'ZZ Target Hotel'), (hy, 'ZZ Other Hotel'), (hz, 'ZZ Hold Hotel');
  INSERT INTO pipeline_members (user_id, pipeline_id, role) VALUES (head, pid, 'head');
  INSERT INTO client_pipelines (client_id, pipeline_id, manager_id, status) VALUES (hx, pid, head, 'active') RETURNING id INTO cp;
  INSERT INTO client_pipelines (client_id, pipeline_id, status) VALUES (hy, pid, 'active') RETURNING id INTO cpy;
  INSERT INTO client_staff_assignments (client_id, user_id, pipeline_id, role, source) VALUES (hx, head, pid, 'head', 'manual')
    ON CONFLICT DO NOTHING;

  -- (c) Month 1 baseline: no previous actual → no target, nothing suggested, report submits without a score
  PERFORM set_config('request.jwt.claims', json_build_object('sub', head, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) FILTER (WHERE baseline AND suggested IS NULL), count(*) INTO n, total FROM targets_due('2026-01-01') WHERE client_pipeline_id = cp;
  EXECUTE 'RESET ROLE';
  total := 1; IF n = 5 THEN passed := passed + 1; ELSE fails := fails || ' baseline list ' || n || ';'; END IF;
  INSERT INTO monthly_reports (client_id, client_pipeline_id, month, status, created_by) VALUES (hx, cp, '2026-01-01', 'draft', head) RETURNING id INTO rjan;
  total := total + 1;
  BEGIN
    UPDATE monthly_reports SET status = 'submitted', no_data_reason = 'Baseline month — nothing to report yet' WHERE id = rjan;
    IF NOT EXISTS (SELECT 1 FROM kpi_entries WHERE report_id = rjan AND (target_status <> 'baseline' OR achievement_pct IS NOT NULL))
    THEN passed := passed + 1; ELSE fails := fails || ' baseline scored;'; END IF;
  EXCEPTION WHEN others THEN fails := fails || ' baseline blocked: ' || SQLERRM || ';'; END;

  -- (b) Pre-fill: higher-better = last actual + 10%, lower-better = same as last actual
  INSERT INTO pipeline_kpi_entries (client_id, client_pipeline_id, month, metrics)
  VALUES (hx, cp, '2026-01-01', '{"enquiries_handled":100,"avg_response_min":30,"conversion_rate":20,"follow_ups":50,"missed_calls":5}');
  total := total + 1;
  IF kpi_suggest_target(cp, k_enq, '2026-02-01') = 110 AND kpi_suggest_target(cp, k_conv, '2026-02-01') = 22
     AND kpi_suggest_target(cp, k_resp, '2026-02-01') = 30 AND kpi_suggest_target(cp, k_miss, '2026-02-01') = 5
  THEN passed := passed + 1; ELSE fails := fails || ' prefill ' || coalesce(kpi_suggest_target(cp, k_enq, '2026-02-01')::text, 'null') || ';'; END IF;

  -- (a) Head proposes → stored as Provisional even if they ask for approved
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO client_kpi_targets (client_pipeline_id, kpi_definition_id, month, target, suggested, status)
  VALUES (cp, k_enq, '2026-02-01', 110, 110, 'approved'), (cp, k_resp, '2026-02-01', 30, 30, 'provisional'),
         (cp, k_conv, '2026-02-01', 22, 22, 'provisional'), (cp, k_fu, '2026-02-01', 55, 55, 'provisional');
  EXECUTE 'RESET ROLE';
  total := total + 1;
  IF (SELECT count(*) FROM client_kpi_targets WHERE client_pipeline_id = cp AND status = 'provisional' AND proposed_by = head) = 4
  THEN passed := passed + 1; ELSE fails := fails || ' head approved own target;'; END IF;

  -- (a) Head cannot propose for a hotel they do not cover
  total := total + 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO client_kpi_targets (client_pipeline_id, kpi_definition_id, month, target) VALUES (cpy, k_enq, '2026-02-01', 1);
    fails := fails || ' head proposed for other hotel;';
  EXCEPTION WHEN others THEN passed := passed + 1; END;
  EXECUTE 'RESET ROLE';

  -- (d) Submit blocked while one KPI has no target (missed calls), allowed once every KPI is provisional
  INSERT INTO pipeline_kpi_entries (client_id, client_pipeline_id, month, metrics)
  VALUES (hx, cp, '2026-02-01', '{"enquiries_handled":121,"avg_response_min":25,"conversion_rate":22,"follow_ups":55,"missed_calls":4}');
  INSERT INTO monthly_reports (client_id, client_pipeline_id, month, status, created_by) VALUES (hx, cp, '2026-02-01', 'draft', head) RETURNING id INTO rfeb;
  total := total + 1;
  BEGIN
    UPDATE monthly_reports SET status = 'submitted' WHERE id = rfeb;
    fails := fails || ' submitted with a missing target;';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'No target yet for: Missed calls%' THEN passed := passed + 1; ELSE fails := fails || ' wrong block: ' || SQLERRM || ';'; END IF;
  END;
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO client_kpi_targets (client_pipeline_id, kpi_definition_id, month, target) VALUES (cp, k_miss, '2026-02-01', 5);
  EXECUTE 'RESET ROLE';
  total := total + 1;
  BEGIN
    UPDATE monthly_reports SET status = 'submitted' WHERE id = rfeb;
    IF NOT EXISTS (SELECT 1 FROM kpi_entries WHERE report_id = rfeb AND (target_status <> 'provisional' OR achievement_pct IS NOT NULL OR provisional_target IS NULL))
    THEN passed := passed + 1; ELSE fails := fails || ' provisional was scored;'; END IF;
  EXCEPTION WHEN others THEN fails := fails || ' provisional blocked: ' || SQLERRM || ';'; END;

  -- (e) Approval queue: head cannot approve; management approves → scored only against approved targets
  total := total + 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM approve_kpi_targets(ARRAY(SELECT id FROM client_kpi_targets WHERE client_pipeline_id = cp)); fails := fails || ' head approved;';
  EXCEPTION WHEN others THEN passed := passed + 1; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  n := approve_kpi_targets(ARRAY(SELECT id FROM client_kpi_targets WHERE client_pipeline_id = cp AND kpi_definition_id <> k_fu));
  EXECUTE 'RESET ROLE';
  PERFORM refresh_report_kpis(rfeb);
  total := total + 1;
  IF n = 4 AND (SELECT achievement_pct FROM kpi_entries WHERE report_id = rfeb AND kpi_definition_id = k_enq) = 110
     AND (SELECT achievement_pct FROM kpi_entries WHERE report_id = rfeb AND kpi_definition_id = k_resp) = 120
     AND (SELECT target_status = 'provisional' AND achievement_pct IS NULL FROM kpi_entries WHERE report_id = rfeb AND kpi_definition_id = k_fu)
     AND (SELECT approved_by FROM client_kpi_targets WHERE client_pipeline_id = cp AND kpi_definition_id = k_enq) = mgr
  THEN passed := passed + 1; ELSE fails := fails || ' approve/score n=' || n || ';'; END IF;

  -- (a) Management can edit an approved target any time; the head cannot
  total := total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', head, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE client_kpi_targets SET target = 1 WHERE client_pipeline_id = cp AND kpi_definition_id = k_enq;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  UPDATE client_kpi_targets SET target = 100 WHERE client_pipeline_id = cp AND kpi_definition_id = k_resp;
  EXECUTE 'RESET ROLE';
  IF (SELECT target FROM client_kpi_targets WHERE client_pipeline_id = cp AND kpi_definition_id = k_enq) = 110
     AND (SELECT target FROM client_kpi_targets WHERE client_pipeline_id = cp AND kpi_definition_id = k_resp) = 100
  THEN passed := passed + 1; ELSE fails := fails || ' approved-edit rules;'; END IF;

  -- (e) 25th: head gets "Targets due", management gets the approval queue; other days nothing
  INSERT INTO client_kpi_targets (client_pipeline_id, kpi_definition_id, month, target, status) VALUES (cp, k_enq, '2026-03-01', 130, 'provisional');
  total := total + 1;
  n := notify_targets_due('2026-02-24');
  v := notify_targets_due('2026-02-25');
  IF n = 0 AND v >= 2
     AND EXISTS (SELECT 1 FROM notifications WHERE user_id = head AND title = 'Targets due for Mar 2026' AND link = '/targets')
     AND EXISTS (SELECT 1 FROM notifications WHERE user_id = mgr AND title = 'Targets awaiting approval')
  THEN passed := passed + 1; ELSE fails := fails || ' targets-due notifications;'; END IF;

  -- Q22 on hold: no KPI entry, no report, resume returns to where it stopped
  INSERT INTO client_launches (client_id, plan_id, status) SELECT hz, id, 'on_hold' FROM plans WHERE code = 'gmb_seo' RETURNING id INTO lz;
  INSERT INTO client_pipelines (client_id, pipeline_id, manager_id, status) VALUES (hz, pid, head, 'active') ON CONFLICT DO NOTHING;
  total := total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO pipeline_kpi_entries (client_id, client_pipeline_id, month, metrics)
    SELECT hz, id, '2026-03-01', '{}' FROM client_pipelines WHERE client_id = hz LIMIT 1;
    fails := fails || ' kpi entered on hold;';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%on hold%' THEN passed := passed + 1; ELSE fails := fails || ' hold err ' || SQLERRM || ';'; END IF; END;
  n := create_monthly_reports('2026-03-01');
  s := resume_launch(lz);
  EXECUTE 'RESET ROLE';
  total := total + 1;
  IF NOT EXISTS (SELECT 1 FROM monthly_reports WHERE client_id = hz) AND s = 'draft'
     AND (SELECT status FROM client_launches WHERE id = lz) = 'draft' AND NOT client_on_hold(hz)
  THEN passed := passed + 1; ELSE fails := fails || ' hold report/resume ' || s || ';'; END IF;

  -- Q42 Day 0 needs agreement + advance amount, date and reference/screenshot — enforced even on a direct update
  INSERT INTO client_launches (client_id, plan_id, status, advance_amount) SELECT hy, id, 'draft', 10000 FROM plans WHERE code = 'gmb_seo' RETURNING id INTO ld;
  total := total + 1;
  BEGIN
    UPDATE client_launches SET day0_date = '2026-03-01' WHERE id = ld;
    fails := fails || ' day0 set without paperwork;';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%signed agreement%advance payment date%payment reference or screenshot%' AND SQLERRM NOT LIKE '%advance amount%'
    THEN passed := passed + 1; ELSE fails := fails || ' day0 msg ' || SQLERRM || ';'; END IF;
  END;
  INSERT INTO documents (client_id, doc_type, status, file_path) VALUES (hy, 'Agreement', 'uploaded', 'x/agreement.pdf');
  UPDATE client_launches SET advance_received_at = now(), payment_reference = 'UTR123' WHERE id = ld;
  total := total + 1;
  BEGIN
    UPDATE client_launches SET day0_date = '2026-03-01' WHERE id = ld;
    passed := passed + 1;
  EXCEPTION WHEN others THEN fails := fails || ' day0 blocked when complete: ' || SQLERRM || ';'; END;

  -- Q24 codes: next number at creation, Excel child gets the parent's code + next suffix, codes are permanent
  INSERT INTO clients (hotel_name) VALUES ('ZZ New Code Hotel') RETURNING client_code INTO c1;
  INSERT INTO clients (hotel_name, parent_client_id) SELECT 'ZZ Excel Child', id FROM clients WHERE hotel_name = 'Excel Main Brand' RETURNING client_code INTO c2;
  total := total + 1;
  ok := false;
  BEGIN UPDATE clients SET client_code = 'ALC-999' WHERE id = hx; EXCEPTION WHEN others THEN ok := true; END;
  IF c1 = 'ALC-' || lpad((SELECT max(substring(client_code from 5)::int) FROM clients WHERE client_code ~ '^ALC-[0-9]+$')::text, greatest(3,length((SELECT max(substring(client_code from 5)::int) FROM clients WHERE client_code ~ '^ALC-[0-9]+$')::text)), '0')
     AND c2 = 'ALC-037-6' AND ok
     AND (SELECT client_code FROM clients WHERE hotel_name = 'The Palm Spring Resort') = 'DEMO-001'
  THEN passed := passed + 1; ELSE fails := fails || ' codes ' || c1 || '/' || c2 || ';'; END IF;

  -- Q28 goals: yearly in rupees, month = yearly ÷ 12 by default; staff-only
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := property_goal_progress((SELECT id FROM clients WHERE hotel_name = 'Hardys Retreat'), 2026);
  EXECUTE 'RESET ROLE';
  UPDATE pipeline_members SET active = false WHERE user_id = head;  -- no longer Reservation Desk head → plain staff
  PERFORM set_config('request.jwt.claims', json_build_object('sub', head, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := false;
  BEGIN PERFORM property_goal_progress((SELECT id FROM clients WHERE hotel_name = 'Hardys Retreat'), 2026); EXCEPTION WHEN others THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  total := total + 1;
  IF (j->>'yearly_goal')::numeric = 8500000 AND (j->'months'->0->>'goal')::numeric = 708333 AND ok
  THEN passed := passed + 1; ELSE fails := fails || ' goals ' || coalesce(j::text, 'null') || ';'; END IF;

  RAISE EXCEPTION 'STAGE3D TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
