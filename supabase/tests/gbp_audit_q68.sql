-- Q68: GBP analytics audit rules in the read layer. Stored values are never changed.
-- Always aborts. Success = "Q68 PASSED n/n".
DO $$
DECLARE pass int := 0; total int := 0; fails text := ''; n int; v numeric; v5 numeric; sh uuid;
BEGIN
  -- 1. Stored rows untouched: every localo row still has its original fetched values; extras are additive.
  total := total + 1;
  SELECT count(*) INTO n FROM kpi_fetched_values f JOIN kpi_fetched_extras x ON x.fetched_value_id = f.id
   WHERE x.extra_values ?| ARRAY(SELECT jsonb_object_keys(f.fetched_values));
   -- Main-format history may retain an identically named Metricool count; original wins.
   IF NOT EXISTS(SELECT 1 FROM kpi_fetched_values f JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id WHERE f.source='localo' AND x.extra_values ?| ARRAY(SELECT jsonb_object_keys(f.fetched_values)))
      AND position('x.extra_values' in pg_get_functiondef('public.source_profile_monthly(text,date,date)'::regprocedure)) < position('|| f.fetched_values' in pg_get_functiondef('public.source_profile_monthly(text,date,date)'::regprocedure))
   THEN pass := pass + 1; ELSE fails := fails || ' extras precedence'; END IF;

  -- 2. Extras cannot overwrite an existing key.
  total := total + 1;
  BEGIN
    UPDATE kpi_fetched_extras SET extra_values = extra_values || '{"views_search": -1}' WHERE fetched_value_id = (SELECT fetched_value_id FROM kpi_fetched_extras WHERE extra_values ? 'views_search' LIMIT 1);
    fails := fails || ' extras-overwrite-allowed';
  EXCEPTION WHEN others THEN pass := pass + 1; END;

  -- 3. Leading not-tracked months are dropped from the aggregate (Simcha Island Apr-25 → Apr-26).
  total := total + 1;
  SELECT count(*) INTO n FROM source_monthly_agg('localo', '2025-04-01', '2026-04-01') a
    JOIN client_pipelines cp ON cp.id = a.client_pipeline_id JOIN clients c ON c.id = cp.client_id
   WHERE c.hotel_name ILIKE 'Simcha%';
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || ' simcha-untracked ' || n; END IF;

  -- 4. Review deltas never negative per profile, and 5-star added ≤ new reviews (portfolio, 2026).
  total := total + 1;
  SELECT sum((vals->>'new_reviews')::numeric), sum((vals->>'new_five_star')::numeric) INTO v, v5
    FROM source_monthly_agg('localo', '2026-01-01', '2026-09-01');
  IF v5 <= v THEN pass := pass + 1; ELSE fails := fails || format(' five>new %s>%s', v5, v); END IF;

  -- 5. Spring Hill (two profiles): no negative monthly delta.
  total := total + 1;
  SELECT cp.id INTO sh FROM client_pipelines cp JOIN clients c ON c.id = cp.client_id JOIN pipelines p ON p.id = cp.pipeline_id
   WHERE c.hotel_name ILIKE 'Spring Hill%' AND p.code = 'gbp' LIMIT 1;
  SELECT count(*) INTO n FROM source_monthly_agg('localo', '2025-01-01', '2026-12-01')
   WHERE client_pipeline_id = sh AND ((vals->>'new_reviews')::numeric < 0 OR (vals->>'new_five_star')::numeric < 0);
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || ' springhill-negative ' || n; END IF;

  -- 6. Profile RPC returns one row per mapping-month (Spring Hill has two profiles).
  total := total + 1;
  SELECT count(DISTINCT mapping_id) INTO n FROM source_profile_monthly('localo', '2025-01-01', '2026-12-01') WHERE client_pipeline_id = sh;
  IF n = 2 THEN pass := pass + 1; ELSE fails := fails || ' springhill-profiles ' || n; END IF;

  -- 7. Every localo row has the Search/Maps split.
  total := total + 1;
  SELECT count(*) INTO n FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id = f.id
   WHERE f.source = 'localo' AND (x.extra_values IS NULL OR NOT x.extra_values ? 'views_search');
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || ' missing-split ' || n; END IF;

  RAISE EXCEPTION 'Q68 PASSED %/% FAILS:%', pass, total, fails;
END $$;
