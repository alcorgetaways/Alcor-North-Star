-- QA flows & forms (QA-01, QA-02, QA-10, QA-14). Rollback pattern: the final exception undoes everything.
-- Success = error text "PASS qa_flows_q71 n assertions".
DO $$
DECLARE ids uuid[]; owner uuid; owner_client uuid; cp uuid; pl uuid; qid uuid; n int := 0; k int; t uuid; msg text;
BEGIN
  -- Fixture: any active hotel-owner login whose hotel has an active pipeline
  SELECT p.id, p.client_id, cp2.id, cp2.pipeline_id INTO owner, owner_client, cp, pl
    FROM profiles p JOIN client_pipelines cp2 ON cp2.client_id = p.client_id AND cp2.status = 'active'
   WHERE p.client_id IS NOT NULL AND p.status = 'active' LIMIT 1;
  IF owner IS NULL THEN RAISE EXCEPTION 'fixtures missing'; END IF;

  SELECT array_agg(id) INTO ids FROM (SELECT id FROM client_tasks WHERE client_id <> owner_client LIMIT 5) x;
  -- QA-01 test_qa01_owner_question_real_pipeline_uuid: the owner can tag a question with the real pipelines.id
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- the owner can read the options the panel uses
  SELECT count(*) INTO k FROM client_pipelines WHERE client_id = owner_client AND id = cp;
  IF k <> 1 THEN RAISE EXCEPTION 'QA-01 owner cannot read own pipelines'; END IF; n := n+1;
  INSERT INTO client_questions (client_id, pipeline_id, client_pipeline_id, subject, body, asked_by)
  VALUES (owner_client, pl, cp, 'QA test', 'QA test body', owner) RETURNING id INTO qid;
  IF qid IS NULL THEN RAISE EXCEPTION 'QA-01 insert failed'; END IF; n := n+1;
  -- QA-10 test_qa10_batch_gate_lock: one call, only rows the caller can read
  SELECT count(*) INTO k FROM tasks_gate_a_locked(ids);
  IF k <> 0 THEN RAISE EXCEPTION 'QA-10 owner saw other hotels'' task locks (%)', k; END IF; n := n+1;
  EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE service_role'; -- REST runner's session role is the API login role
  -- a pipeline code (the old bug) is rejected by the uuid column
  msg := NULL;
  BEGIN
    EXECUTE format('INSERT INTO client_questions (client_id, pipeline_id, subject, body, asked_by) VALUES (%L, %L, %L, %L, %L)', owner_client, 'gbp', 's', 'b', owner);
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  IF msg NOT LIKE '%invalid input syntax for type uuid%' THEN RAISE EXCEPTION 'QA-01 code accepted: %', msg; END IF; n := n+1;

  SELECT id INTO t FROM client_tasks LIMIT 1;
  IF t IS NOT NULL THEN
    IF (SELECT locked FROM tasks_gate_a_locked(ARRAY[t])) IS DISTINCT FROM task_gate_a_locked(t) THEN RAISE EXCEPTION 'QA-10 mismatch'; END IF;
  END IF; n := n+1;
  IF has_function_privilege('anon', 'tasks_gate_a_locked(uuid[])', 'EXECUTE') THEN RAISE EXCEPTION 'QA-10 anon can execute'; END IF; n := n+1;

  -- QA-02 test_qa02_negative_kpi_rejected
  msg := NULL;
  BEGIN
    INSERT INTO weekly_kpi_entries (client_id, client_pipeline_id, week_start, channel, ad_spend, leads)
    VALUES (owner_client, cp, '2019-01-07', 'meta', -1, 0);
  EXCEPTION WHEN check_violation THEN msg := 'blocked'; END;
  IF msg IS DISTINCT FROM 'blocked' THEN RAISE EXCEPTION 'QA-02 negative weekly spend accepted'; END IF; n := n+1;
  msg := NULL;
  BEGIN
    INSERT INTO gbp_kpi_entries (client_id, client_pipeline_id, month, calls) VALUES (owner_client, cp, '2019-01-01', -3);
  EXCEPTION WHEN check_violation THEN msg := 'blocked'; END;
  IF msg IS DISTINCT FROM 'blocked' THEN RAISE EXCEPTION 'QA-02 negative GBP calls accepted'; END IF; n := n+1;

  -- QA-14 test_qa14_goal_clear_policy: only finance managers may clear a goal
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sales_goals' AND cmd = 'DELETE' AND qual LIKE '%can_manage_finance%')
  THEN RAISE EXCEPTION 'QA-14 delete policy missing'; END IF; n := n+1;

  RAISE EXCEPTION 'PASS qa_flows_q71 % assertions', n;
END $$;
