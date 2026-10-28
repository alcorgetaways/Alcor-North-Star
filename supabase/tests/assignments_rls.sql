-- Assignment-based per-client access tests (Prompt 7). Impersonates real staff
-- against the live roster, plus a rollback-safe manual-removal check.
-- Always aborts at the end so nothing is kept. Success = error text "ASSIGNMENT TESTS PASSED: n/n".
DO $$
DECLARE
  anju uuid; nisha uuid; dinesh uuid; arvind uuid; neha uuid; shalini uuid;
  banjara uuid; season uuid; excel_child uuid; excel_parent_launch uuid;
  cp_banjara_gbp uuid; social_pid uuid;
  n int; passed int := 0; total int := 0; fails text := '';
BEGIN
  SELECT id INTO anju FROM profiles WHERE email='dm@alcorgetaways.com';
  SELECT id INTO nisha FROM profiles WHERE email='marketing@alcorgetaways.com';
  SELECT id INTO dinesh FROM profiles WHERE email='alcor@group2001.in';
  SELECT id INTO arvind FROM profiles WHERE email='alcorgetaways.leadforms@gmail.com';
  SELECT id INTO neha FROM profiles WHERE email='neha@alcorgetaways.com';
  SELECT id INTO shalini FROM profiles WHERE email='shalini@alcorgetaways.com';
  SELECT id INTO banjara FROM clients WHERE hotel_name='Banjara Hotel';
  SELECT id INTO season FROM clients WHERE hotel_name='Season Jawai';
  SELECT id INTO excel_child FROM clients WHERE hotel_name='Excel Bhimtal';
  SELECT id INTO social_pid FROM pipelines WHERE code='social_media';
  SELECT l.id INTO excel_parent_launch FROM client_launches l
    JOIN clients c ON c.id = l.client_id
    WHERE c.hotel_name='Excel Main Brand' AND l.status='active' LIMIT 1;
  SELECT cp.id INTO cp_banjara_gbp FROM client_pipelines cp
    JOIN pipelines p ON p.id = cp.pipeline_id
    WHERE cp.client_id = banjara AND p.code='gbp';
  IF cp_banjara_gbp IS NULL THEN
    INSERT INTO client_pipelines (id, client_id, pipeline_id, status)
    SELECT gen_random_uuid(), banjara, id, 'active' FROM pipelines WHERE code='gbp'
    RETURNING id INTO cp_banjara_gbp;
  END IF;

  -- 1. Banjara (GMB-only) is assigned to exactly Anju (head) and Nisha (team)
  total := total+1;
  SELECT count(*) INTO n FROM client_staff_assignments WHERE client_id = banjara AND NOT excluded;
  IF n = 2
     AND EXISTS (SELECT 1 FROM client_staff_assignments WHERE client_id=banjara AND user_id=anju AND role='head' AND NOT excluded)
     AND EXISTS (SELECT 1 FROM client_staff_assignments WHERE client_id=banjara AND user_id=nisha AND role='team_member' AND NOT excluded)
  THEN passed := passed+1; ELSE fails := fails || ' banjara assignees got=' || n || ';'; END IF;

  -- 2. Dinesh (social/corporate) cannot see Banjara at all
  PERFORM set_config('request.jwt.claims', json_build_object('sub', dinesh, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients WHERE id = banjara; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' dinesh sees banjara;'; END IF;
  total := total+1;
  IF NOT public.can_view_pipeline(cp_banjara_gbp) THEN passed := passed+1; ELSE fails := fails || ' dinesh views banjara gbp pipeline;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 3. Anju and Nisha can see Banjara and its GMB pipeline
  PERFORM set_config('request.jwt.claims', json_build_object('sub', anju, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients WHERE id = banjara; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' anju cannot see banjara;'; END IF;
  total := total+1;
  IF public.can_view_pipeline(cp_banjara_gbp) THEN passed := passed+1; ELSE fails := fails || ' anju cannot view banjara gbp;'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', nisha, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients WHERE id = banjara; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' nisha cannot see banjara;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 4. Arvind is on two pipelines for Excel Bhimtal but sees the client once
  total := total+1;
  SELECT count(*) INTO n FROM client_staff_assignments
   WHERE client_id = excel_child AND user_id = arvind AND NOT excluded;
  -- >= 2: Excel's signed contract (23 Oct 2026) adds Corporate Comms, a third Arvind pipeline.
  IF n >= 2 THEN passed := passed+1; ELSE fails := fails || ' arvind excel rows got=' || n || ';'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients WHERE id = excel_child; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' arvind sees excel child ' || n || ' times;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 5. Parent brand assignments cover the child property (sourced from the parent launch)
  total := total+1;
  IF EXISTS (SELECT 1 FROM client_staff_assignments
             WHERE client_id = excel_child AND source_launch_id = excel_parent_launch AND NOT excluded)
  THEN passed := passed+1; ELSE fails := fails || ' excel child not sourced from parent launch;'; END IF;

  -- 6. Neha (reservations) sees only clients whose services include reservations_desk
  PERFORM set_config('request.jwt.claims', json_build_object('sub', neha, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients c
   WHERE NOT EXISTS (SELECT 1 FROM client_staff_assignments a
                     WHERE a.client_id = c.id AND a.user_id = neha AND NOT excluded);
  total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' neha sees client outside her assignments: ' || n || ';'; END IF;
  EXECUTE 'RESET ROLE';
  -- as postgres: every client Neha is assigned to has reservations_desk in its effective (own or parent) launch
  SELECT count(*) INTO n FROM client_staff_assignments a
   JOIN clients c ON c.id = a.client_id
   WHERE a.user_id = neha AND NOT a.excluded
     AND NOT EXISTS (
       SELECT 1 FROM client_launches l
       LEFT JOIN custom_plan_services s ON s.custom_plan_id = l.custom_plan_id AND s.included
       LEFT JOIN plan_services ps ON l.custom_plan_id IS NULL AND ps.plan_version_id = l.plan_version_id AND ps.included
       WHERE l.client_id IN (c.id, c.parent_client_id) AND l.status IN ('active','live')
         AND COALESCE(s.pipeline_code, ps.pipeline_code) = 'reservations_desk');
  total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' neha assigned client without reservations service: ' || n || ';'; END IF;

  -- 7. Manual removal (exclusion) survives recalculation and blocks visibility
  UPDATE client_staff_assignments
     SET excluded = true, source = 'manual'
   WHERE client_id = season AND user_id = arvind AND NOT excluded; -- Season now also has Performance (signed contract), so remove him from every pipeline
  PERFORM public.recalc_client_assignments(season, false);
  total := total+1;
  IF EXISTS (SELECT 1 FROM client_staff_assignments
             WHERE client_id = season AND user_id = arvind AND pipeline_id = social_pid AND excluded)
  THEN passed := passed+1; ELSE fails := fails || ' manual removal did not survive recalc;'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients WHERE id = season; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' excluded arvind still sees season jawai;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 8. Shalini is Account Manager on every real client
  SELECT count(*) INTO n FROM clients WHERE NOT is_test AND account_manager_id = shalini;
  total := total+1;
  IF n = (SELECT count(*) FROM clients WHERE NOT is_test) THEN passed := passed+1;
  ELSE fails := fails || ' shalini AM count got=' || n || ';'; END IF;

  -- 9. No service is left unmatched on any active launch
  SELECT count(*) INTO n FROM client_launches WHERE status IN ('active','live') AND import_flags ? 'unmatched_services';
  total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' unmatched services on ' || n || ' launches;'; END IF;

  RAISE EXCEPTION 'ASSIGNMENT TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
