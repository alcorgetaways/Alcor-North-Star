-- Per-pipeline access tests. Creates temporary rows, impersonates users, and
-- always aborts at the end so nothing is kept. Success = error text "ACCESS TESTS PASSED: n/n".
DO $$
DECLARE
  gbp_mgr uuid := gen_random_uuid(); am uuid := gen_random_uuid(); owner uuid := gen_random_uuid();
  hx uuid := gen_random_uuid(); hy uuid := gen_random_uuid();
  cp_gbp uuid := gen_random_uuid(); cp_pm uuid := gen_random_uuid(); cp_ota uuid := gen_random_uuid(); cp_y uuid := gen_random_uuid();
  launch uuid := gen_random_uuid();
  n int; passed int := 0; total int := 0; ok boolean; fails text := '';
  procedure_name text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (gbp_mgr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-gbp@test.local','{}',now(),now()),
         (am,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-am@test.local','{}',now(),now()),
         (owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-owner@test.local','{}',now(),now());
  INSERT INTO clients (id, hotel_name) VALUES (hx,'TEST X'),(hy,'TEST Y');
  INSERT INTO profiles (id, full_name, status) VALUES (gbp_mgr,'T GBP','active'),(am,'T AM','active'),(owner,'T Owner','active')
    ON CONFLICT (id) DO UPDATE SET status='active', client_id = NULL, full_name = EXCLUDED.full_name;
  UPDATE profiles SET client_id = hx WHERE id = owner;
  DELETE FROM user_roles WHERE user_id IN (gbp_mgr, am, owner);
  INSERT INTO user_roles (user_id, role) VALUES (gbp_mgr,'pipeline_manager'),(am,'team_member'),(owner,'client');

  INSERT INTO client_pipelines (id, client_id, pipeline_id, manager_id, status)
  SELECT cp_gbp, hx, id, gbp_mgr, 'active' FROM pipelines WHERE code='gbp';
  INSERT INTO client_pipelines (id, client_id, pipeline_id, status)
  SELECT cp_pm, hx, id, 'active' FROM pipelines WHERE code='performance_marketing';
  INSERT INTO client_pipelines (id, client_id, pipeline_id, status)
  SELECT cp_ota, hx, id, 'active' FROM pipelines WHERE code='ota';
  INSERT INTO client_pipelines (id, client_id, pipeline_id, status)
  SELECT cp_y, hy, id, 'active' FROM pipelines WHERE code='gbp';

  INSERT INTO weekly_kpi_entries (client_id, client_pipeline_id, week_start, ad_spend, leads, campaigns_live, channel)
  VALUES (hx, cp_pm, '2026-01-05', 1000, 5, 1, 'google');
  INSERT INTO ota_records (client_id, client_pipeline_id, ota_name, month) VALUES (hx, cp_ota, 'TestOTA', '2026-01-01');
  INSERT INTO internal_notes (client_id, author_id, category, body) VALUES (hx, am, 'general', 'secret');
  INSERT INTO gbp_kpi_entries (client_id, client_pipeline_id, month) VALUES (hx, cp_gbp, '2026-01-01'), (hy, cp_y, '2026-01-01');

  -- Staff access is assignment-based: gbp_mgr must be a pipeline member so the
  -- launch trigger creates their (hotel X, gbp) assignment.
  INSERT INTO pipeline_members (user_id, pipeline_id, role)
  SELECT gbp_mgr, id, 'head' FROM pipelines WHERE code='gbp';
  INSERT INTO client_launches (id, client_id, plan_id, status)
  SELECT launch, hx, id, 'active' FROM plans ORDER BY sort_order LIMIT 1;
  INSERT INTO client_module_assignments (launch_id, client_id, module_code, primary_user_id) VALUES (launch, hx, 'AM', am);

  -- ---- GBP-only manager ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gbp_mgr, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM weekly_kpi_entries WHERE client_id = hx; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr sees weekly;'; END IF;
  SELECT count(*) INTO n FROM ota_records WHERE client_id = hx; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr sees ota;'; END IF;
  SELECT count(*) INTO n FROM internal_notes WHERE client_id = hx; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr sees notes;'; END IF;
  SELECT count(*) INTO n FROM gbp_kpi_entries WHERE client_id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr gbp rows got=' || n || ';'; END IF;
  SELECT count(*) INTO n FROM client_pipelines WHERE client_id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr pipelines got=' || n || ';'; END IF;
  SELECT count(*) INTO n FROM clients WHERE id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr hotel profile;'; END IF;
  SELECT count(*) INTO n FROM gbp_kpi_entries WHERE client_id = hy; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr sees other hotel;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Account Manager of X ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', am, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM weekly_kpi_entries WHERE client_id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' am weekly;'; END IF;
  SELECT count(*) INTO n FROM ota_records WHERE client_id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' am ota;'; END IF;
  SELECT count(*) INTO n FROM internal_notes WHERE client_id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' am notes;'; END IF;
  SELECT count(*) INTO n FROM gbp_kpi_entries WHERE client_id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' am gbp;'; END IF;
  SELECT count(*) INTO n FROM client_pipelines WHERE client_id = hx; total := total+1; IF n = 3 THEN passed := passed+1; ELSE fails := fails || ' am pipelines got=' || n || ';'; END IF;
  SELECT count(*) INTO n FROM gbp_kpi_entries WHERE client_id = hy; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' am sees other hotel;'; END IF;
  ok := true; BEGIN PERFORM public.create_monthly_reports('2026-01-01'); ok := false; EXCEPTION WHEN others THEN NULL; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE fails := fails || ' non-manager ran create_monthly_reports;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- IDOR: direct row access by id across users ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gbp_mgr, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM documents WHERE client_id = hx; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr reads documents;'; END IF;
  SELECT count(*) INTO n FROM client_credentials WHERE client_id = hx; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr reads credentials;'; END IF;
  SELECT count(*) INTO n FROM monthly_reports WHERE client_id = hx; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr reads other-pipeline reports;'; END IF;
  SELECT count(*) INTO n FROM clients WHERE id = hy; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' gbp mgr reads hotel Y by id;'; END IF;
  UPDATE weekly_kpi_entries SET notes = 'idor' WHERE client_pipeline_id = cp_pm; total := total+1;
  IF NOT FOUND THEN passed := passed+1; ELSE fails := fails || ' gbp mgr updated weekly row;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Hotel owner of X ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM clients; total := total+1; IF n = 1 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL owner sees % hotels', n; END IF;
  SELECT count(*) INTO n FROM internal_notes; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' owner sees notes;'; END IF;
  SELECT count(*) INTO n FROM weekly_kpi_entries; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' owner sees raw weekly;'; END IF;
  SELECT count(*) INTO n FROM get_my_alcor_contact() WHERE full_name = 'T AM'; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' owner contact;'; END IF;
  SELECT count(*) INTO n FROM clients WHERE id = hy; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' owner reads hotel Y by id;'; END IF;
  SELECT count(*) INTO n FROM admin_audit_log; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' owner reads audit log;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Anonymous ----
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  FOREACH procedure_name IN ARRAY ARRAY[
    'SELECT public.create_monthly_reports(''2026-01-01'')',
    'SELECT public.refresh_report_kpis(gen_random_uuid())',
    'SELECT public.kpi_source_value(gen_random_uuid(), ''2026-01-01'', ''x'', false)',
    'SELECT public.hotel_scorecard(gen_random_uuid(), ''2026-01-01'')',
    'SELECT public.team_scorecard(''2026-01-01'')',
    'SELECT public.check_rate_limit(''x'', 1, 60)',
    'SELECT public.log_admin_action(gen_random_uuid(), ''x'')',
    'SELECT public.client_commercials(gen_random_uuid())',
    'SELECT public.request_terms_change(gen_random_uuid(), ''{}''::jsonb)',
    'SELECT count(*) FROM public.client_review_items',
    'SELECT count(*) FROM public.clients',
    'SELECT count(*) FROM public.admin_audit_log',
    'SELECT count(*) FROM public.rate_limits',
    'SELECT public.min_term_check(gen_random_uuid(), ''2026-01-01'')',
    'SELECT public._min_term_info(gen_random_uuid(), ''2026-01-01'')',
    'SELECT public.start_downgrade(gen_random_uuid(), ''x'', ''2026-01-01'')',
    'SELECT count(*) FROM public.targets_due(''2026-01-01'')',
    'SELECT public.property_goal_progress(gen_random_uuid(), 2026)',
    'SELECT public.brand_rollup(gen_random_uuid(), ''2026-01-01'')',
    'SELECT public.hold_launch(gen_random_uuid(), ''x'')',
    'SELECT public.bd_target_progress()',
    'SELECT count(*) FROM public.client_codes()',
    'SELECT count(*) FROM public.report_history',
    'SELECT count(*) FROM public.imported_issues',
    'SELECT count(*) FROM public.bd_targets',
    'SELECT count(*) FROM public.source_monthly_agg(''localo'', ''2000-01-01'', ''2100-01-01'')'] LOOP
    total := total+1;
    BEGIN EXECUTE procedure_name; RAISE NOTICE 'FAIL anon ran %', procedure_name;
    EXCEPTION WHEN insufficient_privilege THEN passed := passed+1; END;
  END LOOP;
  total := total+1;
  BEGIN PERFORM public.setup_required(); passed := passed+1;
  EXCEPTION WHEN others THEN RAISE NOTICE 'FAIL anon cannot call setup_required'; END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'ACCESS TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
