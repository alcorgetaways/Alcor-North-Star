-- Q65: GBP / Social performance dashboards read through RLS as Anju (GBP head).
-- Always aborts. Success = "Q65 TESTS PASSED: n/n FAILS:" with nothing after FAILS.
DO $$
DECLARE
  anju uuid := (SELECT id FROM profiles WHERE email='dm@alcorgetaways.com');
  pass int := 0; total int := 0; fails text := ''; n int; mapped int; seen int;
BEGIN
  SELECT count(DISTINCT m.client_pipeline_id) INTO mapped FROM kpi_source_mappings m
    JOIN client_pipelines cp ON cp.id=m.client_pipeline_id JOIN clients c ON c.id=cp.client_id
    JOIN pipelines p ON p.id=cp.pipeline_id
   WHERE m.source='localo' AND m.active AND p.code='gbp' AND NOT c.is_test AND cp.status <> 'ended';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',anju,'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', anju::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 18 months visible through RLS for both hotels
  SELECT count(DISTINCT f.month) INTO n FROM kpi_fetched_values f JOIN client_pipelines cp ON cp.id=f.client_pipeline_id JOIN clients c ON c.id=cp.client_id
   WHERE f.source='localo' AND c.hotel_name='Excel Bhimtal';
  total:=total+1; IF n >= 18 THEN pass:=pass+1; ELSE fails:=fails||' bhimtal='||n; END IF;
  SELECT count(DISTINCT f.month) INTO n FROM kpi_fetched_values f JOIN client_pipelines cp ON cp.id=f.client_pipeline_id JOIN clients c ON c.id=cp.client_id
   WHERE f.source='localo' AND c.hotel_name ILIKE 'Yogu%Woodside%';
  total:=total+1; IF n >= 18 THEN pass:=pass+1; ELSE fails:=fails||' woodside='||n; END IF;

  -- portfolio: every mapped (non-test) GBP hotel is visible to Anju
  SELECT count(DISTINCT cp.id) INTO seen FROM client_pipelines cp JOIN pipelines p ON p.id=cp.pipeline_id JOIN clients c ON c.id=cp.client_id
   WHERE p.code='gbp' AND NOT c.is_test AND cp.status <> 'ended'
     AND EXISTS (SELECT 1 FROM kpi_fetched_values f WHERE f.client_pipeline_id=cp.id AND f.source='localo');
  total:=total+1; IF seen >= mapped - 1 THEN pass:=pass+1; ELSE fails:=fails||' portfolio='||seen||'/'||mapped; END IF;

  -- unapproved months are visible to staff (badge, not hidden)
  SELECT count(*) INTO n FROM kpi_fetched_values WHERE source='localo' AND status <> 'approved';
  total:=total+1; IF n > 0 THEN pass:=pass+1; ELSE fails:=fails||' unapproved-hidden'; END IF;

  -- empty-state reasons: Cabana mapped-without-data, Excel Main Brand unmapped
  SELECT listings INTO n FROM source_mapping_status('localo') s JOIN client_pipelines cp ON cp.id=s.client_pipeline_id JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id WHERE p.code='gbp' AND c.hotel_name='Cabana Affair';
  total:=total+1; IF n >= 1 THEN pass:=pass+1; ELSE fails:=fails||' cabana-mapped'; END IF;
  SELECT listings INTO n FROM source_mapping_status('localo') s JOIN client_pipelines cp ON cp.id=s.client_pipeline_id JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id WHERE p.code='gbp' AND c.hotel_name='Excel Main Brand';
  total:=total+1; IF coalesce(n,0) = 0 THEN pass:=pass+1; ELSE fails:=fails||' excel-main-unmapped'; END IF;

  -- mapping table itself stays admin-only
  SELECT count(*) INTO n FROM kpi_source_mappings;
  total:=total+1; IF n = 0 THEN pass:=pass+1; ELSE fails:=fails||' mappings-leak'; END IF;

  SELECT count(*) INTO n FROM source_profile_names('localo');
  total:=total+1; IF n >= mapped THEN pass:=pass+1; ELSE fails:=fails||' names='||n; END IF;

  RAISE EXCEPTION 'Q65 TESTS PASSED: %/% FAILS:%', pass, total, fails;
END $$;
