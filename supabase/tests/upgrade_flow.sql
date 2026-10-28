-- Scheduled-upgrade flow tests on a throw-away hotel with a PAST start date.
-- Always aborts at the end so nothing is kept. Success = error text "UPGRADE TESTS PASSED: n/n".
DO $$
DECLARE
  mohnish uuid; shalini uuid; cid uuid; old_id uuid; new_id uuid; pl uuid;
  mrr0 numeric; mrr1 numeric; mrr2 numeric; churn0 int; churn1 int; up0 int; up1 int;
  h jsonb; n int; passed int := 0; total int := 0; fails text := '';
BEGIN
  SELECT id INTO mohnish FROM profiles WHERE email='mohnish@group2001.in';
  SELECT id INTO shalini FROM profiles WHERE email='shalini@alcorgetaways.com';
  SELECT id INTO pl FROM plans WHERE code='diamond_start';
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ Upgrade Test Hotel', 'Testpur') RETURNING id INTO cid;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start, activated_at)
  VALUES (cid, pl, 'active', 20000, '2026-01-01', now()) RETURNING id INTO old_id;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  mrr0 := (finance_overview()->>'mrr')::numeric;
  churn0 := (launch_reporting_counts()->>'churned_launches')::int;
  up0 := (launch_reporting_counts()->>'upgrades')::int;
  new_id := start_upgrade(old_id, 'diamond_grow', '2026-10-01',
    '{"retainer_inr":35000,"team_incentive_pct":10,"notice_days":60,"min_term_months":0,"auto_renew":true}'::jsonb,
    '[{"service_name":"GMB SEO","pipeline_code":"gbp"},{"service_name":"Social Media","pipeline_code":"social_media"},
      {"service_name":"Influencer","pipeline_code":"influencer"}]'::jsonb, 'test upgrade');
  mrr1 := (finance_overview()->>'mrr')::numeric;
  EXECUTE 'RESET ROLE';

  -- 1. New launch is proposed, linked to the old one; MRR unchanged before the start date
  total := total+1;
  IF (SELECT status='proposed' AND upgraded_from_launch_id=old_id AND retainer_inr=35000 AND team_incentive_pct=10
        FROM client_launches WHERE id=new_id) AND mrr1 = mrr0
  THEN passed := passed+1; ELSE fails := fails || ' not proposed or MRR moved early;'; END IF;

  -- 2. Daily step does nothing the day before the start date
  total := total+1;
  PERFORM activate_due_upgrades('2026-09-30');
  IF (SELECT status FROM client_launches WHERE id=new_id)='proposed' AND (SELECT status FROM client_launches WHERE id=old_id)='active'
  THEN passed := passed+1; ELSE fails := fails || ' activated early;'; END IF;

  -- 3. On the start date: new active, old closed as Upgraded
  total := total+1;
  PERFORM activate_due_upgrades('2026-10-01');
  IF (SELECT status FROM client_launches WHERE id=new_id)='active'
     AND (SELECT status='closed' AND closing_reason_code='upgraded' FROM client_launches WHERE id=old_id)
  THEN passed := passed+1; ELSE fails := fails || ' not switched on start date;'; END IF;

  -- 4. Pipelines and assignments recalculated from the new launch's services
  total := total+1;
  SELECT count(*) INTO n FROM client_pipelines x JOIN pipelines p ON p.id=x.pipeline_id
   WHERE x.client_id=cid AND x.status<>'ended' AND p.code IN ('gbp','social_media','influencer');
  IF n = 3 AND NOT EXISTS (SELECT 1 FROM client_pipelines x JOIN pipelines p ON p.id=x.pipeline_id
                            WHERE x.client_id=cid AND x.status<>'ended' AND p.code NOT IN ('gbp','social_media','influencer'))
  THEN passed := passed+1; ELSE fails := fails || ' pipelines not recalculated (' || n || ');'; END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  mrr2 := (finance_overview()->>'mrr')::numeric;
  churn1 := (launch_reporting_counts()->>'churned_launches')::int;
  up1 := (launch_reporting_counts()->>'upgrades')::int;
  h := client_commercials(cid)->'plan_history';
  EXECUTE 'RESET ROLE';

  -- 5. MRR switches after the start date (−20,000 + 35,000)
  total := total+1;
  IF mrr2 = mrr0 + 15000 THEN passed := passed+1; ELSE fails := fails || ' mrr ' || mrr0 || '→' || mrr2 || ';'; END IF;

  -- 6. Churn does not count the upgrade; upgrades count does
  total := total+1;
  IF churn1 = churn0 AND up1 = up0 + 1 THEN passed := passed+1; ELSE fails := fails || ' churn ' || churn0 || '→' || churn1 || ';'; END IF;

  -- 7. Plan history: old then new, with dates and terms
  total := total+1;
  IF jsonb_array_length(h) = 2
     AND h->0->>'id' = old_id::text AND h->0->>'closing_reason' = 'Upgraded' AND (h->0->>'is_churn')::boolean = false
     AND (h->0->>'retainer_inr')::numeric = 20000 AND h->0->>'contract_start' = '2026-01-01' AND h->0->>'contract_end' = '2026-09-30'
     AND h->1->>'id' = new_id::text AND (h->1->>'retainer_inr')::numeric = 35000 AND h->1->>'contract_start' = '2026-10-01'
     AND (h->1->>'team_incentive_pct')::numeric = 10
  THEN passed := passed+1; ELSE fails := fails || ' plan history ' || h::text || ';'; END IF;

  -- 8. BD cannot schedule an upgrade on custom terms; staff cannot run the daily step
  total := total+1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', shalini, 'role','authenticated')::text, true);
  BEGIN
    PERFORM start_upgrade(new_id, 'diamond_scale', '2027-01-01', '{"retainer_inr":1}'::jsonb, NULL, NULL);
    fails := fails || ' BD scheduled custom upgrade;';
  EXCEPTION WHEN others THEN
    BEGIN
      PERFORM activate_due_upgrades('2030-01-01');
      fails := fails || ' staff ran daily step;';
    EXCEPTION WHEN others THEN passed := passed+1;
    END;
  END;
  EXECUTE 'RESET ROLE';

  -- 9. Real Yogu's Woodside upgrade stays scheduled today (start 1 Nov 2026)
  total := total+1;
  PERFORM activate_due_upgrades('2026-10-31');
  IF EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id=l.client_id
              WHERE c.hotel_name='Yogu''s Woodside' AND l.status='proposed' AND l.contract_start='2026-11-01')
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id=l.client_id
              WHERE c.hotel_name='Yogu''s Woodside' AND l.status='active' AND l.retainer_inr=20000)
  THEN passed := passed+1; ELSE fails := fails || ' yogus switched early;'; END IF;

  -- 10. ...and switches on 1 Nov 2026
  total := total+1;
  PERFORM activate_due_upgrades('2026-11-01');
  IF EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id=l.client_id
              WHERE c.hotel_name='Yogu''s Woodside' AND l.status='active' AND l.retainer_inr=35000)
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id=l.client_id
              WHERE c.hotel_name='Yogu''s Woodside' AND l.status='closed' AND l.closing_reason_code='upgraded' AND l.retainer_inr=20000)
  THEN passed := passed+1; ELSE fails := fails || ' yogus not switched on 1 Nov;'; END IF;

  RAISE EXCEPTION 'UPGRADE TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
