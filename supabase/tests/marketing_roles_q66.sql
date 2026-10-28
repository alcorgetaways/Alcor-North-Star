-- Q66: GBP/Social analytics visibility per role through RLS. Always aborts.
-- Success = "Q66 PASSED n/n" followed by a per-person summary; FAILS lists mismatches.
DO $$
DECLARE
  e text; uid uuid; pass int := 0; total int := 0; fails text := ''; rep text := '';
  exp_g int; exp_s int; got_g int; got_s int; got_gm int; got_sm int; unappr int; owner_bad int;
BEGIN
  FOREACH e IN ARRAY ARRAY['tonny.sapra@group2001.in','mohnish@group2001.in','shalini@alcorgetaways.com','dm@alcorgetaways.com','marketing@alcorgetaways.com','alcor@group2001.in','alcorsparesort@gmail.com','alcorgetaways.leadforms@gmail.com','yadusjawai@gmail.com'] LOOP
    SELECT id INTO uid FROM profiles WHERE email=e;
    -- expected: management/admin/BD see every profile; pipeline staff see the hotels they are assigned to
    -- in that pipeline (heads are assigned the whole pipeline); hotel owners read nothing raw here.
    SELECT count(DISTINCT f.client_pipeline_id) FILTER (WHERE f.source='localo'), count(DISTINCT f.client_pipeline_id) FILTER (WHERE f.source='metricool')
      INTO exp_g, exp_s FROM kpi_fetched_values f JOIN client_pipelines cp ON cp.id=f.client_pipeline_id
     WHERE NOT has_role(uid,'client') AND (has_role(uid,'admin') OR has_role(uid,'management') OR has_role(uid,'bd_manager')
        OR EXISTS (SELECT 1 FROM client_staff_assignments a WHERE a.user_id=uid AND a.client_id=cp.client_id AND a.pipeline_id=cp.pipeline_id AND NOT coalesce(a.excluded,false)));
    PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(DISTINCT client_pipeline_id) FILTER (WHERE source='localo'), count(DISTINCT client_pipeline_id) FILTER (WHERE source='metricool'),
           count(*) FILTER (WHERE source='localo'), count(*) FILTER (WHERE source='metricool'), count(*) FILTER (WHERE status<>'approved')
      INTO got_g, got_s, got_gm, got_sm, unappr FROM kpi_fetched_values;
    EXECUTE 'RESET ROLE';

    total := total+1;
    IF got_g = exp_g AND got_s = exp_s THEN pass := pass+1; ELSE fails := fails||format(' %s gbp %s/%s social %s/%s;', e, got_g, exp_g, got_s, exp_s); END IF;
    IF has_role(uid,'client') THEN
      total := total+1; IF unappr = 0 THEN pass := pass+1; ELSE fails := fails||' owner-sees-unapproved'; END IF;
    END IF;
    rep := rep||format(' | %s: GBP %s profiles/%s months, Social %s/%s, unapproved %s', split_part(e,'@',1), got_g, got_gm, got_s, got_sm, unappr);
  END LOOP;
  RAISE EXCEPTION 'Q66 PASSED %/% FAILS:% %', pass, total, fails, rep;
END $$;
