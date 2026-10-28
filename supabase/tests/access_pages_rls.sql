-- Access page / Finance view / HR view permission tests (Prompt 8).
-- Impersonates real seeded users, always aborts at the end so nothing is kept.
-- Success = error text "ACCESS PAGES TESTS PASSED: n/n".
DO $$
DECLARE
  arvind uuid; amit uuid; sushma uuid; mohnish uuid; shalini uuid;
  passed int := 0; total int := 0; fails text := '';
  ok boolean; n int;
  expected_count int; expected_am_count int; expected_mrr numeric; simcha_deposit numeric; mrr numeric;
BEGIN
  SELECT id INTO arvind FROM profiles WHERE email = 'alcorgetaways.leadforms@gmail.com';
  SELECT id INTO amit FROM profiles WHERE email = 'accounts@alcorgetaways.com';
  SELECT id INTO sushma FROM profiles WHERE email = 'hr@alcorgetaways.com';
  SELECT id INTO mohnish FROM profiles WHERE email = 'mohnish@group2001.in';
  SELECT id INTO shalini FROM profiles WHERE email = 'shalini@alcorgetaways.com';

  -- Reference values computed up front with full privileges (the authenticated
  -- role has no direct table grants, so these cannot be read after SET ROLE).
  -- MRR = retainers + active recurring add-on fees (deposits excluded), real hotels only.
  SELECT coalesce(sum(l.retainer_inr),0)
       + coalesce((SELECT sum(f.monthly_inr) FROM launch_recurring_fees f
                     JOIN client_launches l2 ON l2.id = f.launch_id JOIN clients c2 ON c2.id = l2.client_id
                    WHERE l2.status IN ('active','live') AND NOT c2.is_test
                      AND f.starts_on <= current_date AND (f.ends_on IS NULL OR f.ends_on >= current_date)), 0)
    INTO expected_mrr
    FROM client_launches l JOIN clients c ON c.id = l.client_id
   WHERE l.status IN ('active','live') AND NOT c.is_test;
  SELECT coalesce(sum(l.deposit_inr),0) INTO simcha_deposit
    FROM client_launches l JOIN clients c ON c.id = l.client_id
   WHERE c.hotel_name ILIKE 'Simcha%' AND l.status IN ('active','live');
  SELECT count(DISTINCT a.client_id) INTO expected_count
    FROM client_staff_assignments a WHERE a.user_id = arvind AND NOT a.excluded;
  -- Owner rule is every real client, not a cap of 59 (Yash added 26 Oct).
  SELECT count(*) INTO expected_am_count FROM clients WHERE NOT is_test;

  -- 1. access_overview is management-only
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true); EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM access_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' arvind-access_overview'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
  BEGIN PERFORM access_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' amit-access_overview'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', sushma, 'role','authenticated')::text, true);
  BEGIN PERFORM access_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' sushma-access_overview'; END IF;

  -- 2. admin sees all logins with pipelines
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  SELECT jsonb_array_length(access_overview()) INTO n;
  total := total + 1; IF n >= 30 THEN passed := passed + 1; ELSE fails := fails || ' admin-login-count=' || n; END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(access_overview()) r
    WHERE (r->>'account_type') = 'Staff' AND jsonb_array_length(r->'pipelines') > 0;
  total := total + 1; IF n > 0 THEN passed := passed + 1; ELSE fails := fails || ' no-staff-pipelines'; END IF;

  -- 3. Shalini listed as AM on every real client
  SELECT (r->>'am_clients')::int INTO n FROM jsonb_array_elements(access_overview()) r
    WHERE r->>'user_id' = shalini::text;
  total := total + 1; IF n = expected_am_count THEN passed := passed + 1; ELSE fails := fails || ' shalini-am=' || coalesce(n,-1); END IF;

  -- 3b. Contract review flags surface in the Access issues list
  SELECT count(*) INTO n FROM jsonb_array_elements(access_overview()) r, jsonb_array_elements_text(r->'issues') i
    WHERE i LIKE 'Review: %';
  total := total + 1; IF n > 0 THEN passed := passed + 1; ELSE fails := fails || ' no-review-issues'; END IF;

  -- 4. finance_overview gating
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  BEGIN PERFORM finance_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' arvind-finance'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', sushma, 'role','authenticated')::text, true);
  BEGIN PERFORM finance_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' sushma-finance'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
  mrr := (finance_overview()->>'mrr')::numeric;
  total := total + 1; IF mrr = expected_mrr THEN passed := passed + 1; ELSE fails := fails || ' mrr=' || mrr || ' expected=' || expected_mrr; END IF;

  -- Simcha's 200000 deposit stays a deposit and never enters the retainer sum
  total := total + 1; IF simcha_deposit = 200000 THEN passed := passed + 1; ELSE fails := fails || ' simcha-deposit=' || coalesce(simcha_deposit,-1); END IF;

  -- finance rows carry retainers (not stripped)
  SELECT count(*) INTO n FROM jsonb_array_elements(finance_overview()->'clients') c,
    lateral jsonb_array_elements(c->'launches') l
    WHERE l->>'retainer_inr' IS NOT NULL;
  total := total + 1; IF n > 0 THEN passed := passed + 1; ELSE fails := fails || ' finance-no-retainers'; END IF;

  -- 5. hr_staff_overview gating
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  BEGIN PERFORM hr_staff_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' arvind-hr'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
  BEGIN PERFORM hr_staff_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' amit-hr'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', sushma, 'role','authenticated')::text, true);
  SELECT jsonb_array_length(hr_staff_overview()) INTO n;
  total := total + 1; IF n >= 15 THEN passed := passed + 1; ELSE fails := fails || ' hr-staff-count=' || n; END IF;

  -- Sushma (HR) sees all team_scorecard rows, not just her own
  SELECT count(*) INTO n FROM team_scorecard((date_trunc('month', now()) - interval '1 month')::date);
  total := total + 1; IF n >= 10 THEN passed := passed + 1; ELSE fails := fails || ' hr-scorecard-rows=' || n; END IF;

  -- 6. person_access_summary: management only; Arvind sees only his assigned clients
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  BEGIN PERFORM person_access_summary(arvind); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' arvind-summary'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  SELECT jsonb_array_length(person_access_summary(arvind)->'clients') INTO n;
  total := total + 1; IF n = expected_count THEN passed := passed + 1; ELSE fails := fails || ' arvind-clients=' || n || ' expected=' || expected_count; END IF;

  -- 7. anon cannot call any of the new functions
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN PERFORM access_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' anon-access'; END IF;
  BEGIN PERFORM finance_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' anon-finance'; END IF;
  BEGIN PERFORM hr_staff_overview(); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF ok THEN passed := passed + 1; ELSE fails := fails || ' anon-hr'; END IF;

  IF passed < total THEN
    RAISE EXCEPTION 'ACCESS PAGES TESTS FAILED: %/% —%', passed, total, fails;
  END IF;
  RAISE EXCEPTION 'ACCESS PAGES TESTS PASSED: %/%', passed, total;
END $$;
