-- QA calculations & data integrity (L1–L13, L18). Rollback pattern: the final exception undoes everything.
-- Success = error text "PASS qa_calc_q70 n assertions".
DO $$
DECLARE cp_al uuid; m_al uuid; cp_sh uuid; m_a uuid; m_b uuid; cp_w uuid; cl_w uuid; v numeric; n int := 0; k int;
        c1 uuid; l1 uuid; c2 uuid; l2 uuid; pl uuid; rep uuid; msg text; fid uuid; nov int;
BEGIN
  -- Fixtures: Asiatic Lion (one GBP listing) and Spring Hill (two listings)
  SELECT cp.id INTO cp_al FROM client_pipelines cp JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id
   WHERE c.client_code='ALC-046' AND p.code='gbp' AND cp.status='active';
  SELECT id INTO m_al FROM kpi_source_mappings WHERE client_pipeline_id=cp_al AND source='localo' AND active LIMIT 1;
  SELECT cp.id INTO cp_sh FROM client_pipelines cp JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id
   WHERE c.client_code='ALC-053' AND p.code='gbp' AND cp.status='active';
  SELECT id INTO m_a FROM kpi_source_mappings WHERE client_pipeline_id=cp_sh AND source='localo' AND active ORDER BY external_name LIMIT 1;
  SELECT id INTO m_b FROM kpi_source_mappings WHERE client_pipeline_id=cp_sh AND source='localo' AND active ORDER BY external_name OFFSET 1 LIMIT 1;
  IF cp_al IS NULL OR m_al IS NULL OR m_a IS NULL OR m_b IS NULL THEN RAISE EXCEPTION 'fixtures missing'; END IF;

  -- L6 test_l6_reports_only_real_active_clients (Nov dry run) — run BEFORE this suite creates its own
  -- fixture hotels (ZZ QA Rev / ZZ QA Leap get active launches and pipelines, which inflated the count to 122).
  nov := create_monthly_reports('2026-11-01');
  IF nov <> (SELECT count(*) FROM client_pipelines cp JOIN clients c ON c.id=cp.client_id
              WHERE cp.status='active' AND c.status='active' AND NOT c.is_test AND NOT c.is_demo)
  THEN RAISE EXCEPTION 'L6 dry run % does not match real active pipelines', nov; END IF; n := n+1;

  -- L1 test_l1_cumulative_reviews: 592 -> 607 cumulative five-star reviews = 15 new
  INSERT INTO kpi_fetched_values (mapping_id, client_pipeline_id, month, source, fetched_values, raw_data, status)
  VALUES (m_al, cp_al, '2020-01-01', 'localo', '{"five_star_reviews":592,"reviews_received":700}', '{"period":"before_alcor"}', 'fetched'),
         (m_al, cp_al, '2020-02-01', 'localo', '{"five_star_reviews":607,"reviews_received":720}', '{"period":"alcor"}', 'approved');
  v := kpi_source_value(cp_al, '2020-02-01', 'gbp.five_star_reviews');
  IF v IS DISTINCT FROM 15 THEN RAISE EXCEPTION 'L1 five-star expected 15, got %', v; END IF; n := n+1;
  v := kpi_source_value(cp_al, '2020-02-01', 'gbp.reviews_received');
  IF v IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'L1 reviews expected 20, got %', v; END IF; n := n+1;
  -- L1 test_l1_missing_previous_month_null
  INSERT INTO kpi_fetched_values (mapping_id, client_pipeline_id, month, source, fetched_values, raw_data, status)
  VALUES (m_al, cp_al, '2020-04-01', 'localo', '{"five_star_reviews":640}', '{"period":"alcor"}', 'approved');
  IF kpi_source_value(cp_al, '2020-04-01', 'gbp.five_star_reviews') IS NOT NULL THEN RAISE EXCEPTION 'L1 no previous month must be NULL'; END IF; n := n+1;

  -- L2 test_l2_two_profiles_summed
  INSERT INTO kpi_fetched_values (mapping_id, client_pipeline_id, month, source, fetched_values, raw_data, status)
  VALUES (m_a, cp_sh, '2020-01-01', 'localo', '{"five_star_reviews":10,"views":1}', '{"period":"alcor"}', 'fetched'),
         (m_b, cp_sh, '2020-01-01', 'localo', '{"five_star_reviews":5,"views":1}', '{"period":"alcor"}', 'fetched'),
         (m_a, cp_sh, '2020-02-01', 'localo', '{"five_star_reviews":12,"views":100}', '{"period":"alcor"}', 'approved'),
         (m_b, cp_sh, '2020-02-01', 'localo', '{"five_star_reviews":8,"views":50}', '{"period":"alcor"}', 'approved');
  v := kpi_source_value(cp_sh, '2020-02-01', 'gbp.views');
  IF v IS DISTINCT FROM 150 THEN RAISE EXCEPTION 'L2 views expected 150, got %', v; END IF; n := n+1;
  v := kpi_source_value(cp_sh, '2020-02-01', 'gbp.five_star_reviews');
  IF v IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'L2 five-star expected 5 (2+3), got %', v; END IF; n := n+1;

  -- L3 test_l3_running_month_blocked
  BEGIN
    INSERT INTO kpi_fetched_values (mapping_id, client_pipeline_id, month, source, fetched_values)
    VALUES (m_al, cp_al, date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date + interval '1 month', 'localo', '{}');
    RAISE EXCEPTION 'L3 running month stored';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'L3%' THEN RAISE; END IF; END;
  n := n+1;
  -- L3 test_l3_oct_rows_flagged_partial (42 rows kept, none deleted)
  SELECT count(*) INTO k FROM kpi_fetched_values WHERE month='2026-10-01' AND is_partial;
  IF k < 42 THEN RAISE EXCEPTION 'L3 expected 42 partial Oct rows, got %', k; END IF; n := n+1;
  IF EXISTS (SELECT 1 FROM source_profile_monthly('localo','2026-10-01','2026-10-01')) THEN RAISE EXCEPTION 'L3 analytics shows partial month'; END IF; n := n+1;
  IF EXISTS (SELECT 1 FROM source_monthly_agg('metricool','2026-10-01','2026-10-01')) THEN RAISE EXCEPTION 'L3 aggregate shows partial month'; END IF; n := n+1;
  -- L3 test_l3_partial_cannot_be_reviewed
  SELECT id INTO fid FROM kpi_fetched_values WHERE month='2026-10-01' AND is_partial LIMIT 1;
  BEGIN UPDATE kpi_fetched_values SET status='confirmed' WHERE id=fid; RAISE EXCEPTION 'L3 partial reviewed';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'L3%' THEN RAISE; END IF; END;
  n := n+1;
  -- L3 test_l3_refetch_keeps_previous: a 'fetched' row can be refreshed only with previous_fetch kept
  UPDATE kpi_fetched_values f SET fetched_values='{"views":5}', fetched_at=f.fetched_at + interval '1 day', is_partial=false,
         raw_data = f.raw_data || jsonb_build_object('previous_fetch', jsonb_build_object('values', f.fetched_values, 'fetched_at', f.fetched_at))
   WHERE id=fid;
  IF (SELECT raw_data->'previous_fetch'->'values' FROM kpi_fetched_values WHERE id=fid) IS NULL THEN RAISE EXCEPTION 'L3 previous fetch lost'; END IF; n := n+1;
  BEGIN
    UPDATE kpi_fetched_values SET fetched_values='{"views":1}' WHERE mapping_id=m_al AND month='2020-02-01';
    RAISE EXCEPTION 'L3 approved row overwritten';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'L3%' THEN RAISE; END IF; END;
  n := n+1;

  -- L4 test_l4_missed_anniversary_once
  SELECT id INTO pl FROM plans WHERE code='diamond_start';
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ QA Rev', 'T') RETURNING id INTO c1;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start, annual_revision_pct)
  VALUES (c1, pl, 'active', 10000, '2024-10-20', 10) RETURNING id INTO l1;
  SELECT count(*) INTO k FROM _revision_candidates('2025-10-21') WHERE launch_id=l1;
  IF k <> 1 THEN RAISE EXCEPTION 'L4 anniversary+1 expected 1 candidate, got %', k; END IF; n := n+1;
  IF (SELECT new_retainer FROM _revision_candidates('2025-10-21') WHERE launch_id=l1) <> 11000 THEN RAISE EXCEPTION 'L4 retainer'; END IF; n := n+1;
  UPDATE client_launches SET last_revised_on='2025-10-21' WHERE id=l1;
  IF EXISTS (SELECT 1 FROM _revision_candidates('2025-10-22') WHERE launch_id=l1) THEN RAISE EXCEPTION 'L4 re-run returned candidate'; END IF; n := n+1;
  -- L4 test_l4_feb29: contract 29 Feb 2024 -> anniversary 28 Feb 2025, picked on 1 Mar
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ QA Leap', 'T') RETURNING id INTO c2;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start, annual_revision_pct)
  VALUES (c2, pl, 'active', 10000, '2024-02-29', 10) RETURNING id INTO l2;
  IF (SELECT anniversary FROM _revision_candidates('2025-03-01') WHERE launch_id=l2) IS DISTINCT FROM '2025-02-28'::date THEN RAISE EXCEPTION 'L4 Feb 29'; END IF; n := n+1;
  -- L4 test_l4_owner_pending_not_applied: Dental centre / Yogu's Woodside are held for the owner (no catch-up today)
  IF EXISTS (SELECT 1 FROM _revision_candidates((now() AT TIME ZONE 'Asia/Kolkata')::date) c JOIN clients x ON x.id=c.client_id WHERE x.client_code IN ('ALC-017','ALC-027'))
  THEN RAISE EXCEPTION 'L4 held revisions would apply'; END IF; n := n+1;

  -- L5 test_l5_weekly_prorated: equal daily spend (100/day, 1 lead/day) across Nov–Dec -> exactly days x 100
  SELECT cp.id, cp.client_id INTO cp_w, cl_w FROM client_pipelines cp JOIN clients c ON c.id=cp.client_id
   WHERE cp.status='active' AND NOT c.is_test AND NOT client_on_hold(c.id) LIMIT 1;
  INSERT INTO weekly_kpi_entries (client_id, client_pipeline_id, week_start, channel, ad_spend, leads)
  SELECT cl_w, cp_w, d::date, 'meta', 700, 7 FROM generate_series('2020-10-26'::date, '2021-01-04'::date, interval '7 days') d;
  IF kpi_source_value_legacy(cp_w, '2020-11-01', 'weekly.sum.ad_spend') / 3000 <> 1 THEN RAISE EXCEPTION 'L5 Nov ratio %', kpi_source_value_legacy(cp_w, '2020-11-01', 'weekly.sum.ad_spend'); END IF; n := n+1;
  IF kpi_source_value_legacy(cp_w, '2020-12-01', 'weekly.sum.ad_spend') / 3100 <> 1 THEN RAISE EXCEPTION 'L5 Dec ratio'; END IF; n := n+1;
  IF kpi_source_value_legacy(cp_w, '2020-11-01', 'weekly.cpl') <> 100 THEN RAISE EXCEPTION 'L5 CPL'; END IF; n := n+1;

  -- L13 test_l13_scoring_edges
  IF kpi_achievement('higher_better', 0, 3) <> 100 THEN RAISE EXCEPTION 'L13 target 0'; END IF; n := n+1;
  IF kpi_achievement('lower_better', 10, 0) <> 100 OR kpi_achievement('lower_better', 10, -1) IS NOT NULL THEN RAISE EXCEPTION 'L13 lower-better actual<=0'; END IF; n := n+1;
  IF kpi_achievement('lower_better', 0, 2) <> 0 OR kpi_achievement('lower_better', 0, 0) <> 100 THEN RAISE EXCEPTION 'L13 lower-better target 0'; END IF; n := n+1;
  IF kpi_achievement('higher_better', 100, 150) <> 120 THEN RAISE EXCEPTION 'L13 cap'; END IF; n := n+1;

  -- L7 test_l7_real_client_predicate
  IF is_real_client((SELECT id FROM clients WHERE hotel_name='Yash residency')) OR is_real_client((SELECT id FROM clients WHERE hotel_name='The Palm Spring Resort'))
     OR NOT is_real_client((SELECT id FROM clients WHERE client_code='ALC-046')) THEN RAISE EXCEPTION 'L7 predicate'; END IF; n := n+1;

  -- L11 test_l11_submit_before_month_end_blocked
  INSERT INTO monthly_reports (client_id, client_pipeline_id, month, status)
  VALUES (cl_w, cp_w, date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date + interval '2 months', 'draft') RETURNING id INTO rep;
  BEGIN UPDATE monthly_reports SET status='submitted' WHERE id=rep; RAISE EXCEPTION 'L11 early submit allowed';
  EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%once the month has ended%' THEN RAISE EXCEPTION 'L11 early: %', SQLERRM; END IF; END;
  n := n+1;
  -- L11 test_l11_no_actuals_needs_reason
  INSERT INTO monthly_reports (client_id, client_pipeline_id, month, status) VALUES (cl_w, cp_w, '2019-06-01', 'draft') RETURNING id INTO rep;
  DELETE FROM kpi_entries WHERE report_id=rep;
  BEGIN UPDATE monthly_reports SET status='submitted' WHERE id=rep; RAISE EXCEPTION 'L11 no-data submit allowed';
  EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE 'No actual figures%' THEN RAISE EXCEPTION 'L11 no-data: %', SQLERRM; END IF; END;
  n := n+1;
  msg := NULL;
  BEGIN UPDATE monthly_reports SET status='submitted', no_data_reason='Property closed for renovation' WHERE id=rep;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  IF msg LIKE 'No actual figures%' THEN RAISE EXCEPTION 'L11 reason not accepted'; END IF; n := n+1;

  -- L6 checked below (dry run taken before fixtures, see top)
  IF EXISTS (SELECT 1 FROM monthly_reports r JOIN clients c ON c.id=r.client_id WHERE r.month='2026-11-01' AND (c.status<>'active' OR c.is_test OR c.is_demo))
  THEN RAISE EXCEPTION 'L6 inactive/test client got a report'; END IF; n := n+1;

  -- L9 / L18 test_l9_l18_definitions
  IF position('sdt.frequency = ''ongoing''' in pg_get_functiondef('team_scorecard(date)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'L9 ongoing not excluded'; END IF; n := n+1;
  IF position('md > extract(day FROM dd)' in pg_get_functiondef('generate_staff_duties(date)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'L18 month-end'; END IF; n := n+1;

  RAISE EXCEPTION 'PASS qa_calc_q70 % assertions (Nov dry run: % reports)', n, nov;
END $$;
