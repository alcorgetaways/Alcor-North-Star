-- Pipeline membership, finance/hr, commercial column lock and activation-request tests.
-- Creates temporary rows, impersonates users, and always aborts at the end so nothing is kept.
-- Success = error text "PIPELINE TESTS PASSED: n/n".
DO $$
DECLARE
  dual uuid := gen_random_uuid(); fin uuid := gen_random_uuid(); hr_u uuid := gen_random_uuid();
  owner uuid := gen_random_uuid(); bd_head uuid := gen_random_uuid(); extra uuid := gen_random_uuid();
  hx uuid := gen_random_uuid(); hy uuid := gen_random_uuid();
  launch uuid := gen_random_uuid();
  cp_gbp uuid := gen_random_uuid(); cp_email uuid := gen_random_uuid(); cp_y uuid := gen_random_uuid();
  p_gbp uuid; p_email uuid; p_wa uuid; p_bd uuid;
  n int; passed int := 0; total int := 0; ok boolean; fails text := '';
  j jsonb; r text;
BEGIN
  SELECT id INTO p_gbp FROM pipelines WHERE code='gbp';
  SELECT id INTO p_email FROM pipelines WHERE code='email_marketing';
  SELECT id INTO p_wa FROM pipelines WHERE code='whatsapp';
  SELECT id INTO p_bd FROM pipelines WHERE code='business_development';

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (dual,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-dual@test.local','{}',now(),now()),
         (fin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-fin@test.local','{}',now(),now()),
         (hr_u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-hr@test.local','{}',now(),now()),
         (owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-owner@test.local','{}',now(),now()),
         (bd_head,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-bdh@test.local','{}',now(),now()),
         (extra,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-extra@test.local','{}',now(),now());
  INSERT INTO clients (id, hotel_name) VALUES (hx,'TEST X'),(hy,'TEST Y');
  INSERT INTO profiles (id, full_name, status) VALUES
    (dual,'T Dual','active'),(fin,'T Fin','active'),(hr_u,'T HR','active'),
    (owner,'T Owner','active'),(bd_head,'T BDHead','active'),(extra,'T Extra','active')
    ON CONFLICT (id) DO UPDATE SET status='active', client_id = NULL, full_name = EXCLUDED.full_name;
  UPDATE profiles SET client_id = hx WHERE id = owner;
  DELETE FROM user_roles WHERE user_id IN (dual, fin, hr_u, owner, bd_head, extra);
  INSERT INTO user_roles (user_id, role) VALUES
    (dual,'pipeline_manager'),(fin,'finance'),(hr_u,'hr'),(owner,'client'),(bd_head,'bd_manager'),(extra,'team_member');

  INSERT INTO client_pipelines (id, client_id, pipeline_id, status) VALUES
    (cp_gbp, hx, p_gbp, 'active'), (cp_email, hx, p_email, 'active'), (cp_y, hy, p_gbp, 'active');
  -- dual is head of GBP and a plain member of Email Marketing
  INSERT INTO pipeline_members (user_id, pipeline_id, role, source) VALUES
    (dual, p_gbp, 'head', 'manual'), (dual, p_email, 'team_member', 'manual'),
    (bd_head, p_bd, 'head', 'manual');
  INSERT INTO client_launches (id, client_id, plan_id, status, retainer_inr)
  SELECT launch, hx, id, 'active', 75000 FROM plans ORDER BY sort_order LIMIT 1;

  -- ---- head in one pipeline, member in another ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', dual, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1; IF public.can_view_pipeline(cp_gbp) THEN passed := passed+1; ELSE fails := fails || ' head cannot view own pipeline;'; END IF;
  -- assignment-based: the launch has no email service, so the email membership alone grants nothing
  total := total+1; IF NOT public.can_view_pipeline(cp_email) THEN passed := passed+1; ELSE fails := fails || ' member views pipeline without a service assignment;'; END IF;
  total := total+1; IF public.is_pipeline_head(dual, p_gbp) THEN passed := passed+1; ELSE fails := fails || ' head flag gbp;'; END IF;
  total := total+1; IF NOT public.is_pipeline_head(dual, p_email) THEN passed := passed+1; ELSE fails := fails || ' head rights carried into member pipeline;'; END IF;
  -- membership is no longer pipeline-wide: a GBP head without an assignment on hotel Y sees nothing
  total := total+1; IF NOT public.can_view_pipeline(cp_y) THEN passed := passed+1; ELSE fails := fails || ' head views same-pipeline other hotel without assignment;'; END IF;
  -- a team member with no membership anywhere sees nothing (checked before extra is added below)
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', extra, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1; IF NOT public.can_view_pipeline(cp_y) THEN passed := passed+1; ELSE fails := fails || ' non-member views pipeline;'; END IF;
  SELECT count(*) INTO n FROM clients WHERE id = hy; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' non-member sees hotel;'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', dual, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- head can add a member to their own pipeline but not to another
  ok := false; total := total+1;
  BEGIN
    INSERT INTO pipeline_members (user_id, pipeline_id, role) VALUES (extra, p_gbp, 'team_member');
    ok := true;
  EXCEPTION WHEN others THEN NULL; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' head cannot add member to own pipeline;'; END IF;
  ok := true; total := total+1;
  BEGIN
    INSERT INTO pipeline_members (user_id, pipeline_id, role) VALUES (extra, p_email, 'team_member');
    ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' head added member to another pipeline;'; END IF;
  -- commercial columns are locked for non-commercial staff
  ok := false; total := total+1;
  BEGIN
    EXECUTE 'SELECT retainer_inr FROM client_launches WHERE id = $1' INTO r USING launch;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' pipeline manager read retainer column;'; END IF;
  SELECT public.launch_commercials(launch) INTO j;
  total := total+1; IF j IS NULL THEN passed := passed+1; ELSE fails := fails || ' launch_commercials leaked to pipeline manager;'; END IF;
  SELECT count(*) INTO n FROM clients WHERE id = hx; total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' member cannot see own hotel;'; END IF;
  SELECT count(*) INTO n FROM clients WHERE id = hy; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' head sees same-pipeline other hotel without assignment;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- finance ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', fin, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1; IF public.can_view_commercials(fin) THEN passed := passed+1; ELSE fails := fails || ' finance not commercial;'; END IF;
  SELECT public.launch_commercials(launch) INTO j;
  total := total+1; IF (j->>'retainer_inr')::numeric = 75000 THEN passed := passed+1; ELSE fails := fails || ' finance launch_commercials got ' || coalesce(j::text,'null') || ';'; END IF;
  SELECT count(*) INTO n FROM clients; total := total+1; IF n >= 1 THEN passed := passed+1; ELSE fails := fails || ' finance cannot read clients;'; END IF;
  SELECT count(*) INTO n FROM gbp_kpi_entries; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' finance reads KPI rows;'; END IF;
  SELECT count(*) INTO n FROM client_credentials; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' finance reads credentials;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- hr ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', hr_u, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.team_scorecard('2026-01-01'); total := total+1;
  IF n >= 2 THEN passed := passed+1; ELSE fails := fails || ' hr scorecard rows got=' || n || ';'; END IF;
  SELECT count(*) INTO n FROM clients; total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' hr reads clients;'; END IF;
  SELECT public.launch_commercials(launch) INTO j;
  total := total+1; IF j IS NULL THEN passed := passed+1; ELSE fails := fails || ' hr read commercials;'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- hotel owner: own pipelines only, activation request flow ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.my_pipeline_status() INTO j; total := total+1;
  IF jsonb_array_length(j) = 9 THEN passed := passed+1; ELSE fails := fails || ' owner pipeline count got=' || jsonb_array_length(j) || ';'; END IF;
  -- the launch is on gmb_seo, whose only service is GMB SEO
  total := total+1;
  IF (SELECT (x->>'active')::boolean FROM jsonb_array_elements(j) x WHERE x->>'code' = 'gbp') THEN passed := passed+1;
  ELSE fails := fails || ' plan service pipeline not active for owner;'; END IF;
  total := total+1;
  IF (SELECT NOT (x->>'active')::boolean FROM jsonb_array_elements(j) x WHERE x->>'code' = 'whatsapp') THEN passed := passed+1;
  ELSE fails := fails || ' owner sees an active pipeline without services;'; END IF;
  SELECT count(*) INTO n FROM pipeline_activation_requests WHERE client_id = hy; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' owner reads other hotel requests;'; END IF;
  SELECT public.request_pipeline_activation('whatsapp') INTO r; total := total+1;
  IF r = 'ok' THEN passed := passed+1; ELSE fails := fails || ' activation request failed: ' || r || ';'; END IF;
  SELECT public.request_pipeline_activation('whatsapp') INTO r; total := total+1;
  IF r = 'already_pending' THEN passed := passed+1; ELSE fails := fails || ' repeat request not ignored: ' || r || ';'; END IF;
  EXECUTE 'RESET ROLE';
  -- notifications are RLS-scoped to the recipient, so count as postgres
  SELECT count(*) INTO n FROM notifications WHERE user_id = bd_head AND kind = 'pipeline_activation'; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' BD head notification got=' || n || ';'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM client_pipelines WHERE client_id = hx AND pipeline_id = p_wa; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' request auto-activated the pipeline;'; END IF;
  SELECT public.my_pipeline_status() INTO j; total := total+1;
  IF (SELECT (x->>'pending')::boolean FROM jsonb_array_elements(j) x WHERE x->>'code' = 'whatsapp') THEN passed := passed+1;
  ELSE fails := fails || ' pending not reflected in my_pipeline_status;'; END IF;
  -- owner may see their own retainer through the RPC
  SELECT public.launch_commercials(launch) INTO j; total := total+1;
  IF (j->>'retainer_inr')::numeric = 75000 AND j->>'payment_reference' IS NULL THEN passed := passed+1;
  ELSE fails := fails || ' owner retainer view wrong: ' || coalesce(j::text,'null') || ';'; END IF;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'PIPELINE TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
