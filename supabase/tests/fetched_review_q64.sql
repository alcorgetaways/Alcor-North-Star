-- Q64: fetched-month review rule, GBP head can review back months, portfolio duty label.
-- Always aborts. Success = "Q64 TESTS PASSED: n/n FAILS:" with nothing after FAILS.
DO $$
DECLARE
  anju uuid := (SELECT id FROM profiles WHERE email='dm@alcorgetaways.com');
  f kpi_fetched_values; pass int := 0; total int := 0; fails text := ''; ok boolean; ws jsonb;
BEGIN
  -- review window
  total := total+1; IF q57_can_review('2026-08-01','2026-10-26 08:00+00') THEN pass:=pass+1; ELSE fails:=fails||' back-month'; END IF;
  total := total+1; IF NOT q57_can_review('2026-09-01','2026-10-26 08:00+00') THEN pass:=pass+1; ELSE fails:=fails||' last-month-outside'; END IF;
  total := total+1; IF q57_can_review('2026-09-01','2026-10-02 06:00+00') THEN pass:=pass+1; ELSE fails:=fails||' last-month-window'; END IF;
  total := total+1; IF NOT q57_can_review('2026-10-01','2026-10-26 08:00+00') THEN pass:=pass+1; ELSE fails:=fails||' running-month'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',anju,'role','authenticated')::text, true);
  -- Anju sees 18 months for Excel Bhimtal and Yogu's Woodside
  total := total+1; IF (SELECT count(DISTINCT f2.month) FROM kpi_fetched_values f2 JOIN client_pipelines cp ON cp.id=f2.client_pipeline_id JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id WHERE p.code='gbp' AND c.hotel_name='Excel Bhimtal' AND manages_pipeline(cp.id)) >= 18 THEN pass:=pass+1; ELSE fails:=fails||' bhimtal-18'; END IF;
  total := total+1; IF (SELECT count(DISTINCT f2.month) FROM kpi_fetched_values f2 JOIN client_pipelines cp ON cp.id=f2.client_pipeline_id JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id WHERE p.code='gbp' AND c.hotel_name ILIKE 'Yogu%Woodside%' AND manages_pipeline(cp.id)) >= 18 THEN pass:=pass+1; ELSE fails:=fails||' woodside-18'; END IF;

  -- Anju marks a back month reviewed
  SELECT f2.* INTO f FROM kpi_fetched_values f2 JOIN client_pipelines cp ON cp.id=f2.client_pipeline_id JOIN clients c ON c.id=cp.client_id
   WHERE c.hotel_name='Excel Bhimtal' AND f2.source='localo' AND f2.status='fetched' AND q57_can_review(f2.month) ORDER BY f2.month LIMIT 1;
  PERFORM review_fetched_kpis(f.id, f.fetched_values, true);
  total := total+1; IF (SELECT status FROM kpi_fetched_values WHERE id=f.id)='confirmed' THEN pass:=pass+1; ELSE fails:=fails||' review'; END IF;

  -- running month still blocked
  SELECT f2.* INTO f FROM kpi_fetched_values f2 JOIN client_pipelines cp ON cp.id=f2.client_pipeline_id JOIN clients c ON c.id=cp.client_id
   WHERE c.hotel_name='Excel Bhimtal' AND f2.source='localo' AND NOT q57_can_review(f2.month) AND f2.status='fetched' LIMIT 1;
  ok := false; BEGIN PERFORM review_fetched_kpis(f.id, f.fetched_values, true); EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total+1; IF ok OR f.id IS NULL THEN pass:=pass+1; ELSE fails:=fails||' running-blocked'; END IF;

  -- portfolio duties labelled "All GMB profiles", never the internal client's name
  ws := activity_workspace(date_trunc('month',now())::date, NULL, 'gbp', true);
  total := total+1; IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ws->'tasks') t WHERE t->>'hotel' ILIKE 'Alcor getaways%') AND jsonb_array_length(ws->'tasks')>0 THEN pass:=pass+1; ELSE fails:=fails||' portfolio-label'; END IF;

  RAISE EXCEPTION 'Q64 TESTS PASSED: %/% FAILS:%', pass, total, fails;
END $$;
