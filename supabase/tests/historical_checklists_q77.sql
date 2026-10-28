-- Owner-approved historical checklist snapshots must never become scored operational tasks.
DO $$
DECLARE l uuid; c uuid; uid uuid; before_n integer; after_n integer; progress numeric;
BEGIN
  IF (SELECT count(DISTINCT launch_id) FROM public.historical_launch_tasks) <> 20 THEN RAISE EXCEPTION 'FAIL historical hotels must be 20 (Demo excluded)'; END IF;
  IF (SELECT count(*) FROM public.historical_launch_tasks) <> 2319 THEN RAISE EXCEPTION 'FAIL expected 2319 plan-scoped historical snapshots'; END IF;
  IF EXISTS(SELECT 1 FROM historical_launch_tasks h JOIN client_launches x ON x.id=h.launch_id JOIN clients cc ON cc.id=h.client_id WHERE h.status<>'done' OR NOT x.no_launch_checklist OR cc.is_test OR cc.is_demo) THEN RAISE EXCEPTION 'FAIL wrong status or hotel scope'; END IF;
  IF EXISTS(SELECT 1 FROM client_tasks t JOIN historical_launch_tasks h ON h.launch_id=t.launch_id AND h.code=t.code) THEN RAISE EXCEPTION 'FAIL historical snapshots entered operational scoring'; END IF;
  IF (SELECT count(*) FROM client_review_items WHERE source='historical_clients_batch3')<>20 THEN RAISE EXCEPTION 'FAIL missing evidence flags'; END IF;
  IF EXISTS(SELECT 1 FROM clients cc JOIN historical_launch_tasks h ON h.client_id=cc.id WHERE cc.payment_status<>'confirmed' OR cc.onboarding_status<>'completed') THEN RAISE EXCEPTION 'FAIL confirmed historical client labels'; END IF;
  IF has_table_privilege('anon','public.historical_launch_tasks','SELECT') OR has_table_privilege('authenticated','public.historical_launch_tasks','INSERT') OR has_table_privilege('authenticated','public.historical_launch_tasks','UPDATE') OR has_table_privilege('authenticated','public.historical_launch_tasks','DELETE') THEN RAISE EXCEPTION 'FAIL historical snapshots not read-only'; END IF;
  SELECT h.launch_id,h.client_id INTO l,c FROM historical_launch_tasks h JOIN clients cc ON cc.id=h.client_id WHERE cc.client_code='ALC-030' LIMIT 1;
  SELECT count(*) INTO before_n FROM historical_launch_tasks WHERE launch_id=l;
  INSERT INTO historical_launch_tasks(launch_id,client_id,template_id,module_code,code,name,standard,week_label,week_start,week_due,phase_code,sort_order)
  SELECT launch_id,client_id,template_id,module_code,code,name,standard,week_label,week_start,week_due,phase_code,sort_order FROM historical_launch_tasks WHERE launch_id=l ON CONFLICT(launch_id,code) DO NOTHING;
  SELECT count(*) INTO after_n FROM historical_launch_tasks WHERE launch_id=l;
  IF before_n<>after_n THEN RAISE EXCEPTION 'FAIL rerun duplicates'; END IF;
  SELECT id INTO uid FROM profiles WHERE client_id=c LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'FAIL owner fixture absent'; END IF;
  PERFORM set_config('request.jwt.claim.sub',uid::text,true);
  SET LOCAL ROLE authenticated;
  SELECT (public.get_my_launch()->>'progress_pct')::numeric INTO progress;
  IF progress IS DISTINCT FROM 100 THEN RAISE EXCEPTION 'FAIL owner progress %',progress; END IF;
  IF EXISTS(SELECT 1 FROM historical_launch_tasks) THEN RAISE EXCEPTION 'FAIL internal checklist exposed to owner'; END IF;
  RESET ROLE;
  RAISE EXCEPTION 'PASS historical_checklists_q77 10/10';
END $$;