-- Plans module access tests. Creates temporary users/plans, impersonates callers,
-- and always aborts at the end so nothing is kept. Success = error text "PLAN TESTS PASSED: n/n".
DO $$
DECLARE
  bd uuid := gen_random_uuid(); tm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid();
  ver uuid; cp uuid; n int; passed int := 0; total int := 0; ok boolean; st text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (bd,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-bd@test.local','{}',now(),now()),
         (tm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-tm@test.local','{}',now(),now()),
         (mgr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-mgr@test.local','{}',now(),now());
  INSERT INTO profiles (id, full_name, status) VALUES (bd,'T BD','active'),(tm,'T TM','active'),(mgr,'T Mgr','active')
    ON CONFLICT (id) DO UPDATE SET status='active', full_name = EXCLUDED.full_name;
  DELETE FROM user_roles WHERE user_id IN (bd, tm, mgr);
  INSERT INTO user_roles (user_id, role) VALUES (bd,'bd_manager'),(tm,'team_member'),(mgr,'management');

  SELECT id INTO ver FROM plan_versions WHERE code = 'diamond_start' AND version = 1;

  -- ---- BDM creates a custom plan with different terms -> pending ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bd, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := true;
  BEGIN
    INSERT INTO custom_plans (base_plan_version_id, name, created_by, monthly_retainer_inr, commission_direct_pct)
    VALUES (ver, 'T Custom', bd, 20000, 5) RETURNING id INTO cp;
  EXCEPTION WHEN others THEN ok := false; RAISE NOTICE 'FAIL bdm insert: %', SQLERRM;
  END;
  total := total+1; IF ok THEN passed := passed+1; END IF;
  SELECT approval_status INTO st FROM custom_plans WHERE id = cp; total := total+1;
  IF st = 'pending' THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL bdm plan status %', st; END IF;
  -- BDM cannot approve their own plan
  ok := true; BEGIN UPDATE custom_plans SET approval_status = 'approved' WHERE id = cp; ok := false; EXCEPTION WHEN others THEN NULL; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL bdm approved own plan'; END IF;
  -- BDM cannot read plan data when not staff? (bd IS staff, skip) ; BDM can read versions
  SELECT count(*) INTO n FROM plan_versions; total := total+1; IF n >= 4 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL bd reads versions'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Team member cannot create a custom plan ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', tm, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := true; BEGIN INSERT INTO custom_plans (base_plan_version_id, name, created_by) VALUES (ver, 'T TM plan', tm); ok := false; EXCEPTION WHEN others THEN NULL; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL team member created custom plan'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Management approves ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE custom_plans SET approval_status = 'approved' WHERE id = cp;
  SELECT approval_status INTO st FROM custom_plans WHERE id = cp; total := total+1;
  IF st = 'approved' THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL mgmt approve got %', st; END IF;
  -- Reject sticks (not flipped back to pending by the trigger)
  UPDATE custom_plans SET approval_status = 'rejected', rejection_reason = 'no' WHERE id = cp;
  SELECT approval_status INTO st FROM custom_plans WHERE id = cp; total := total+1;
  IF st = 'rejected' THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL mgmt reject got %', st; END IF;
  -- Nobody can delete a custom plan (RLS gives no DELETE policy; the row must survive)
  DELETE FROM custom_plans WHERE id = cp;
  SELECT count(*) INTO n FROM custom_plans WHERE id = cp; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL custom plan was deleted'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Anon cannot read any plans data ----
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  FOREACH st IN ARRAY ARRAY['plan_versions','plan_services','addons_catalogue','custom_plans','custom_plan_services'] LOOP
    total := total+1;
    BEGIN EXECUTE format('SELECT count(*) FROM public.%I', st); RAISE NOTICE 'FAIL anon read %', st;
    EXCEPTION WHEN insufficient_privilege THEN passed := passed+1; END;
  END LOOP;
  EXECUTE 'RESET ROLE';

  -- ---- Pipeline manager / team member cannot read custom plans or their services ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', tm, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM custom_plans; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL team member read % custom plans', n; END IF;
  SELECT count(*) INTO n FROM custom_plan_services; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL team member read % custom plan services', n; END IF;
  -- can_view_commercials: false for team member, true for BD and management
  EXECUTE 'RESET ROLE';
  total := total+1; IF NOT can_view_commercials(tm) THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL can_view_commercials(tm)'; END IF;
  total := total+1; IF can_view_commercials(bd) AND can_view_commercials(mgr) THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL can_view_commercials(bd/mgr)'; END IF;

  RAISE EXCEPTION 'PLAN TESTS PASSED: %/%', passed, total;
END $$;
