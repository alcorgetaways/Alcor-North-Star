-- Client master record tests: relaunch, churn counts, duplicate check, parent brand.
-- Creates temporary users/clients/launches and always aborts at the end so nothing
-- is kept. Success = error text "CLIENT TESTS PASSED: n/n".
DO $$
DECLARE
  mgr uuid := gen_random_uuid(); bd uuid := gen_random_uuid(); pm uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  l1 uuid; l2 uuid; n int; passed int := 0; total int := 0;
  counts jsonb; dup_count int; new_id uuid; base_churn int; base_closed int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (mgr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2-mgr@test.local','{}',now(),now()),
         (bd,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2-bd@test.local','{}',now(),now()),
         (pm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2-pm@test.local','{}',now(),now());
  INSERT INTO profiles (id, full_name, status) VALUES (mgr,'T2 Mgr','active'),(bd,'T2 BD','active'),(pm,'T2 PM','active')
    ON CONFLICT (id) DO UPDATE SET status='active', full_name = EXCLUDED.full_name;
  DELETE FROM user_roles WHERE user_id IN (mgr, bd, pm);
  INSERT INTO user_roles (user_id, role) VALUES (mgr,'management'),(bd,'bd_manager'),(pm,'pipeline_manager');

  INSERT INTO clients (id, hotel_name, status, onboarding_status, mobile, email, city, address, created_by)
  VALUES (c1, 'T2 Palm Test', 'active', 'in_progress', '+91 98765 00001', 't2-palm@test.local', 'Jaipur', '1 Test Marg', mgr);

  -- ---- Relaunch creates a second launch and no second client ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- Baseline: the roster already holds real closed/churned launches, so assert deltas.
  SELECT launch_reporting_counts() INTO counts;
  base_churn := (counts->>'churned_launches')::int;
  base_closed := (counts->>'closed_launches')::int;
  INSERT INTO client_launches (client_id, plan_id, status, closing_reason_code, closed_at, created_by)
  SELECT c1, id, 'closed', 'non_payment', now(), mgr FROM plans WHERE code = 'gmb_seo' LIMIT 1
  RETURNING id INTO l1;
  SELECT relaunch_client(c1, 'diamond_start') INTO new_id;
  SELECT count(*) INTO n FROM client_launches WHERE client_id = c1; total := total+1;
  IF n = 2 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL relaunch launches %', n; END IF;
  total := total+1;
  IF new_id IS NOT NULL AND new_id <> l1 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL relaunch id'; END IF;
  SELECT count(*) INTO n FROM clients WHERE hotel_name = 'T2 Palm Test'; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL duplicate client created %', n; END IF;

  -- ---- Churn counts only churn reasons ----
  -- c1: one closed churn (non_payment). Add a closed non-churn launch on c2.
  INSERT INTO clients (id, hotel_name, status, onboarding_status, created_by)
  VALUES (c2, 'T2 Other Test', 'active', 'in_progress', mgr);
  INSERT INTO client_launches (client_id, plan_id, status, closing_reason_code, closed_at, created_by)
  SELECT c2, id, 'closed', 'mutual_termination', now(), mgr FROM plans WHERE code = 'gmb_seo' LIMIT 1;
  SELECT launch_reporting_counts() INTO counts;
  total := total+1;
  IF (counts->>'churned_launches')::int = base_churn + 1 THEN passed := passed+1;
  ELSE RAISE NOTICE 'FAIL churn count %', counts->>'churned_launches'; END IF;
  total := total+1;
  IF (counts->>'closed_launches')::int >= base_closed + 2 THEN passed := passed+1;
  ELSE RAISE NOTICE 'FAIL closed count %', counts->>'closed_launches'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Duplicate check fires on same phone with a different name ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bd, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO dup_count FROM find_client_duplicates(
    'Completely Different Name', '9876500001', NULL, NULL, NULL, NULL, NULL);
  total := total+1;
  IF dup_count >= 1 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL duplicate check by phone'; END IF;
  SELECT count(*) INTO dup_count FROM find_client_duplicates(
    'Completely Different Name', NULL, NULL, NULL, NULL, NULL, NULL);
  total := total+1;
  IF dup_count = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL duplicate check false positive'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- Pipeline manager gets nothing from the duplicate check is fine (staff), but cannot merge ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pm, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1;
  BEGIN
    PERFORM merge_clients(c1, c2, '{}'::jsonb);
    RAISE NOTICE 'FAIL pipeline manager merged clients';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Only admin or management%' THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL merge err %', SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- ---- Closing requires a reason code; close_launch enforces notes for 'other' ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1;
  BEGIN
    PERFORM close_launch(new_id, 'other', NULL);
    RAISE NOTICE 'FAIL close without notes allowed';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Notes are required%' THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL close err %', SQLERRM; END IF;
  END;
  PERFORM close_launch(new_id, 'client_discontinued', 'test close');
  SELECT to_jsonb(closing_reason_code) INTO counts FROM client_launches WHERE id = new_id;
  total := total+1;
  IF (counts #>> '{}') = 'client_discontinued' THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL closing reason stored'; END IF;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'CLIENT TESTS PASSED: %/%', passed, total;
END $$;
