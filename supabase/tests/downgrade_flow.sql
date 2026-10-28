-- Scheduled-downgrade + early-notice tests on throw-away hotels. Always aborts so nothing is kept.
-- Success = error text "DOWNGRADE TESTS PASSED: n/n FAILS:" with nothing after FAILS.
DO $$
DECLARE
  mohnish uuid; shalini uuid; cid uuid; cid2 uuid; old_id uuid; new_id uuid; l2 uuid; pg uuid; pvg uuid;
  churn0 int; churn1 int; up0 int; up1 int; dn0 int; dn1 int; n int; ended int; h jsonb; mt jsonb;
  passed int := 0; total int := 0; fails text := '';
BEGIN
  SELECT id INTO mohnish FROM profiles WHERE email='mohnish@group2001.in';
  SELECT id INTO shalini FROM profiles WHERE email='shalini@alcorgetaways.com';
  SELECT id INTO pg FROM plans WHERE code='diamond_grow';
  SELECT id INTO pvg FROM plan_versions WHERE plan_id=pg AND status='active' ORDER BY version DESC LIMIT 1;
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ Downgrade Test Hotel', 'Testpur') RETURNING id INTO cid;
  INSERT INTO client_launches (client_id, plan_id, plan_version_id, status, retainer_inr, contract_start, activated_at)
  VALUES (cid, pg, pvg, 'active', 25000, '2026-01-01', now()) RETURNING id INTO old_id;
  PERFORM recalc_client_assignments(cid, false);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  churn0 := (launch_reporting_counts()->>'churned_launches')::int;
  up0 := (launch_reporting_counts()->>'upgrades')::int;
  dn0 := (launch_reporting_counts()->>'downgrades')::int;
  EXECUTE 'RESET ROLE';

  -- 1. BD cannot downgrade on custom terms, and cannot "downgrade" to a higher plan
  total := total+1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', shalini, 'role','authenticated')::text, true);
  BEGIN
    PERFORM start_downgrade(old_id, 'diamond_start', '2026-12-01', '{"retainer_inr":1}'::jsonb, NULL, NULL);
    fails := fails || ' BD scheduled custom downgrade;';
  EXCEPTION WHEN others THEN
    BEGIN
      PERFORM start_downgrade(old_id, 'diamond_scale', '2026-12-01', NULL, NULL, NULL);
      fails := fails || ' downgrade to higher plan allowed;';
    EXCEPTION WHEN others THEN passed := passed+1;
    END;
  END;
  -- 2. BD proposes a standard downgrade
  total := total+1;
  new_id := start_downgrade(old_id, 'diamond_start', '2026-12-01', NULL, NULL, 'test downgrade');
  EXECUTE 'RESET ROLE';
  IF (SELECT status='proposed' AND change_kind='downgrade' AND upgraded_from_launch_id=old_id FROM client_launches WHERE id=new_id)
  THEN passed := passed+1; ELSE fails := fails || ' not proposed/linked;'; END IF;

  -- 3. Nothing switches the day before the start date
  total := total+1;
  PERFORM activate_due_upgrades('2026-11-30');
  IF (SELECT status FROM client_launches WHERE id=new_id)='proposed' AND (SELECT status FROM client_launches WHERE id=old_id)='active'
  THEN passed := passed+1; ELSE fails := fails || ' activated early;'; END IF;

  -- 4. On the start date: new active, old closed as Downgraded
  total := total+1;
  PERFORM activate_due_upgrades('2026-12-01');
  IF (SELECT status FROM client_launches WHERE id=new_id)='active'
     AND (SELECT status='closed' AND closing_reason_code='downgraded' AND closed_reason='Downgraded' FROM client_launches WHERE id=old_id)
  THEN passed := passed+1; ELSE fails := fails || ' not switched on start date;'; END IF;

  -- 5. Pipelines not in the new plan are ended (rows kept), live ones all belong to the new plan
  total := total+1;
  SELECT count(*) INTO ended FROM client_pipelines x WHERE x.client_id=cid AND x.status='ended';
  SELECT count(*) INTO n FROM client_pipelines x JOIN pipelines p ON p.id=x.pipeline_id
   WHERE x.client_id=cid AND x.status<>'ended'
     AND p.code NOT IN (SELECT s.pipeline_code FROM plan_services s JOIN client_launches l ON l.plan_version_id=s.plan_version_id
                         WHERE l.id=new_id AND s.included AND s.pipeline_code IS NOT NULL);
  IF ended > 0 AND n = 0 THEN passed := passed+1; ELSE fails := fails || ' pipelines ended=' || ended || ' stray=' || n || ';'; END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  churn1 := (launch_reporting_counts()->>'churned_launches')::int;
  up1 := (launch_reporting_counts()->>'upgrades')::int;
  dn1 := (launch_reporting_counts()->>'downgrades')::int;
  h := client_commercials(cid)->'plan_history';
  EXECUTE 'RESET ROLE';

  -- 6. Not churn, not an upgrade, counted as a downgrade
  total := total+1;
  IF churn1 = churn0 AND up1 = up0 AND dn1 = dn0 + 1 THEN passed := passed+1;
  ELSE fails := fails || ' counts churn ' || churn0 || '→' || churn1 || ' up ' || up0 || '→' || up1 || ' down ' || dn0 || '→' || dn1 || ';'; END IF;

  -- 7. Plan history shows old (Downgraded, not churn) then new (downgrade)
  total := total+1;
  IF jsonb_array_length(h) = 2 AND h->0->>'id' = old_id::text AND h->0->>'closing_reason' = 'Downgraded'
     AND (h->0->>'is_churn')::boolean = false AND h->0->>'contract_end' = '2026-11-30'
     AND h->1->>'id' = new_id::text AND h->1->>'change_kind' = 'downgrade' AND h->1->>'contract_start' = '2026-12-01'
  THEN passed := passed+1; ELSE fails := fails || ' plan history ' || h::text || ';'; END IF;

  -- 8. Early notice: warns, does not block, and is stored on the launch
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ Notice Test Hotel', 'Testpur') RETURNING id INTO cid2;
  INSERT INTO client_launches (client_id, plan_id, plan_version_id, status, retainer_inr, contract_start, min_term_months, activated_at)
  VALUES (cid2, pg, pvg, 'active', 25000, '2026-06-01', 12, now()) RETURNING id INTO l2;
  total := total+1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  mt := min_term_check(l2, '2026-10-23');
  PERFORM record_termination_notice(l2, '2026-10-23', 'client', 'test', NULL);
  EXECUTE 'RESET ROLE';
  IF (mt->>'within')::boolean AND mt->>'min_term_end' = '2027-06-01' AND (mt->>'months_remaining')::int = 7 AND (mt->>'days_remaining')::int = 9
     AND (SELECT status='offboarding' AND notice_within_min_term AND min_term_end='2027-06-01' FROM client_launches WHERE id=l2)
  THEN passed := passed+1; ELSE fails := fails || ' early notice ' || coalesce(mt::text,'null') || ';'; END IF;

  -- 9. A notice after the minimum term is not flagged
  total := total+1;
  mt := _min_term_info(l2, '2027-06-01');
  IF NOT (mt->>'within')::boolean THEN passed := passed+1; ELSE fails := fails || ' flagged after min term;'; END IF;

  RAISE EXCEPTION 'DOWNGRADE TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
