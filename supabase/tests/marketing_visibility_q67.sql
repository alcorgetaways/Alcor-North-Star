-- Q67: marketing dashboard visibility per person — raw kpi_fetched_values reads AND the
-- source_profile_monthly RPC (what the dashboards read) must return exactly the same hotels/months, matching the access rule:
-- admin/management/BD see all; pipeline heads (manager/backup) their pipeline; staff their assigned hotels;
-- reservations/finance/HR without assignments see none; hotel owners read nothing raw (their own approved
-- results reach them only through MY GROWTH). Always aborts. Success = "Q67 PASSED n/n".
DO $$
DECLARE
cg int; cs int; cm int;   e text; uid uuid; pass int := 0; total int := 0; fails text := ''; rep text := '';
  exp_g int; exp_s int; exp_m int; raw_g int; raw_s int; raw_m int; raw_un int;
  agg_g int; agg_s int; agg_m int; agg_un int; raw_un2 int; other_ok boolean;
BEGIN
  FOREACH e IN ARRAY ARRAY['tonny.sapra@group2001.in','mohnish@group2001.in','shalini@alcorgetaways.com','dm@alcorgetaways.com',
    'marketing@alcorgetaways.com','alcor@group2001.in','alcorsparesort@gmail.com','alcorgetaways.leadforms@gmail.com',
    'neha@alcorgetaways.com','accounts@alcorgetaways.com','hr@alcorgetaways.com','yadusjawai@gmail.com'] LOOP
    SELECT id INTO uid FROM profiles WHERE email = e;
    IF uid IS NULL THEN fails := fails || ' missing ' || e; total := total + 1; CONTINUE; END IF;

    SELECT count(DISTINCT f.client_pipeline_id) FILTER (WHERE f.source='localo'),
           count(DISTINCT f.client_pipeline_id) FILTER (WHERE f.source='metricool'),
           count(DISTINCT (f.client_pipeline_id, f.source, f.month))
      INTO exp_g, exp_s, exp_m
      FROM kpi_fetched_values f JOIN client_pipelines cp ON cp.id = f.client_pipeline_id
     WHERE has_role(uid,'admin') OR has_role(uid,'management') OR has_role(uid,'bd_manager')
        OR cp.manager_id = uid OR cp.backup_manager_id = uid
        OR EXISTS (SELECT 1 FROM client_staff_assignments a WHERE a.user_id = uid AND a.client_id = cp.client_id
                    AND a.pipeline_id = cp.pipeline_id AND NOT coalesce(a.excluded, false));

    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(DISTINCT client_pipeline_id) FILTER (WHERE source='localo'),
           count(DISTINCT client_pipeline_id) FILTER (WHERE source='metricool'),
           count(DISTINCT (client_pipeline_id, source, month)), count(*) FILTER (WHERE status <> 'approved')
      INTO raw_g, raw_s, raw_m, raw_un FROM kpi_fetched_values;
    -- QA L3: summaries ignore months stored before they ended (is_partial); compare them with the complete rows.
    SELECT count(DISTINCT client_pipeline_id) FILTER (WHERE source='localo'),
           count(DISTINCT client_pipeline_id) FILTER (WHERE source='metricool'),
           count(DISTINCT (client_pipeline_id, source, month))
      INTO cg, cs, cm FROM kpi_fetched_values WHERE NOT is_partial;
    SELECT count(DISTINCT client_pipeline_id) FILTER (WHERE s='localo'),
           count(DISTINCT client_pipeline_id) FILTER (WHERE s='metricool'),
           count(DISTINCT (client_pipeline_id, s, month)), count(*) FILTER (WHERE NOT approved)
      INTO agg_g, agg_s, agg_m, agg_un
      FROM (SELECT 'localo' s, * FROM source_profile_monthly('localo', '2000-01-01', '2100-01-01')
            UNION ALL SELECT 'metricool', * FROM source_profile_monthly('metricool', '2000-01-01', '2100-01-01')) x;
    -- Q68: extra Localo keys follow exactly the same visibility as their fetched row.
    SELECT count(*) INTO raw_un2 FROM kpi_fetched_extras x WHERE NOT EXISTS (SELECT 1 FROM kpi_fetched_values f WHERE f.id = x.fetched_value_id);
    EXECUTE 'RESET ROLE';

    total := total + 4;
    IF raw_un2 = 0 THEN pass := pass + 1; ELSE fails := fails || format(' %s extras leak %s;', e, raw_un2); END IF;
    IF raw_g = exp_g AND raw_s = exp_s AND raw_m = exp_m THEN pass := pass + 1;
      ELSE fails := fails || format(' %s raw %s/%s/%s exp %s/%s/%s;', e, raw_g, raw_s, raw_m, exp_g, exp_s, exp_m); END IF;
    IF agg_g = cg AND agg_s = cs AND agg_m = cm THEN pass := pass + 1;
      ELSE fails := fails || format(' %s rpc %s/%s/%s;', e, agg_g, agg_s, agg_m); END IF;
    -- named expectations from the owner
    IF (e = 'neha@alcorgetaways.com' AND raw_m <> 0)
       OR (e = 'yadusjawai@gmail.com' AND (raw_m <> 0 OR agg_m <> 0 OR raw_un <> 0 OR agg_un <> 0))
       OR (e IN ('tonny.sapra@group2001.in','mohnish@group2001.in','shalini@alcorgetaways.com') AND raw_g = 0)
       OR (e = 'dm@alcorgetaways.com' AND (raw_g = 0 OR raw_s <> 0))
       OR (e = 'alcor@group2001.in' AND (raw_s = 0 OR raw_g <> 0))
    THEN fails := fails || ' rule ' || e; ELSE pass := pass + 1; END IF;

    rep := rep || format(' | %s: GBP %s, Social %s, months %s, unapproved %s', split_part(e,'@',1), raw_g, raw_s, raw_m, raw_un);
  END LOOP;

  -- Owner never reads another hotel's report data.
  SELECT id INTO uid FROM profiles WHERE email = 'yadusjawai@gmail.com';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT NOT EXISTS (SELECT 1 FROM client_pipelines cp JOIN clients c ON c.id = cp.client_id
                      WHERE c.hotel_name NOT ILIKE 'Yadus%') INTO other_ok;
  EXECUTE 'RESET ROLE';
  total := total + 1;
  IF other_ok THEN pass := pass + 1; ELSE fails := fails || ' owner-sees-other-hotel'; END IF;

  RAISE EXCEPTION 'Q67 PASSED %/% FAILS:% %', pass, total, fails, rep;
END $$;
