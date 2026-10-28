-- Annual fee revision tests on throw-away hotels with past dates.
-- Always aborts at the end so nothing is kept. Success = error text "REVISION TESTS PASSED: n/n".
DO $$
DECLARE
  pl uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  n int; n2 int; r jsonb; passed int := 0; total int := 0; fails text := '';
BEGIN
  SELECT id INTO pl FROM plans WHERE code = 'diamond_start';
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ Rev Active', 'T') RETURNING id INTO c1;
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ Rev On Hold', 'T') RETURNING id INTO c2;
  INSERT INTO clients (hotel_name, city) VALUES ('ZZ Rev Not Applicable', 'T') RETURNING id INTO c3;
  INSERT INTO clients (hotel_name, city, is_demo) VALUES ('ZZ Rev Demo', 'T', true) RETURNING id INTO c4;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start) VALUES (c1, pl, 'active', 20000, '2025-11-22') RETURNING id INTO l1;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start) VALUES (c2, pl, 'on_hold', 20000, '2025-11-22') RETURNING id INTO l2;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start, annual_revision_applicable)
    VALUES (c3, pl, 'active', 20000, '2025-11-22', false) RETURNING id INTO l3;
  INSERT INTO client_launches (client_id, plan_id, status, retainer_inr, contract_start) VALUES (c4, pl, 'active', 20000, '2025-11-22') RETURNING id INTO l4;

  -- 1. 30 days before: management notified (in-app) and email queued on hold; nothing applied yet
  r := run_annual_revisions('2026-10-23');
  total := total+1;
  SELECT count(*) INTO n FROM notifications WHERE kind='annual_revision' AND link = '/clients/' || c1 AND body LIKE '%₹20,000 → ₹22,000%';
  IF n > 0 AND (SELECT retainer_inr FROM client_launches WHERE id=l1) = 20000
     AND EXISTS (SELECT 1 FROM client_message_outbox WHERE client_id=c1 AND kind='annual_revision_notice' AND held AND sent_at IS NULL)
     AND n = (SELECT count(DISTINCT p.id) FROM profiles p JOIN user_roles ur ON ur.user_id=p.id WHERE ur.role IN ('admin','management') AND p.status='active')
  THEN passed := passed+1; ELSE fails := fails || ' notice (' || n || ');'; END IF;

  -- 2. Rerun the same day: no duplicate notices
  PERFORM run_annual_revisions('2026-10-23');
  total := total+1;
  SELECT count(*) INTO n2 FROM notifications WHERE kind='annual_revision' AND link = '/clients/' || c1;
  IF n2 = n THEN passed := passed+1; ELSE fails := fails || ' duplicate notices;'; END IF;

  -- 3. Skipped hotels get no notice (on hold, not applicable, demo)
  total := total+1;
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE kind='annual_revision' AND link IN ('/clients/' || c2, '/clients/' || c3, '/clients/' || c4))
  THEN passed := passed+1; ELSE fails := fails || ' skipped hotels notified;'; END IF;

  -- 4. Day before anniversary: no change
  PERFORM run_annual_revisions('2026-11-21');
  total := total+1;
  IF (SELECT retainer_inr FROM client_launches WHERE id=l1) = 20000 THEN passed := passed+1; ELSE fails := fails || ' applied early;'; END IF;

  -- 5. Anniversary: +10% applied and recorded in Terms history as "Annual revision"
  PERFORM run_annual_revisions('2026-11-22');
  total := total+1;
  IF (SELECT retainer_inr FROM client_launches WHERE id=l1) = 22000
     AND EXISTS (SELECT 1 FROM commercial_term_changes WHERE launch_id=l1 AND reason='Annual revision' AND status='applied'
                   AND (old_terms->>'retainer_inr')::numeric = 20000 AND (new_terms->>'retainer_inr')::numeric = 22000)
  THEN passed := passed+1; ELSE fails := fails || ' not applied on anniversary;'; END IF;

  -- 6. Rerun on the same anniversary: applied once only
  PERFORM run_annual_revisions('2026-11-22');
  total := total+1;
  SELECT count(*) INTO n FROM commercial_term_changes WHERE launch_id=l1 AND reason='Annual revision';
  IF n = 1 AND (SELECT retainer_inr FROM client_launches WHERE id=l1) = 22000 THEN passed := passed+1; ELSE fails := fails || ' applied twice;'; END IF;

  -- 7. On-hold, not-applicable and demo launches untouched
  total := total+1;
  IF (SELECT retainer_inr FROM client_launches WHERE id=l2) = 20000 AND (SELECT retainer_inr FROM client_launches WHERE id=l3) = 20000
     AND (SELECT retainer_inr FROM client_launches WHERE id=l4) = 20000
  THEN passed := passed+1; ELSE fails := fails || ' skipped launch revised;'; END IF;

  -- 8. Closed between notice and anniversary: re-checked and skipped
  UPDATE client_launches SET status='closed', closing_reason_code='client_discontinued', closed_at=now() WHERE id=l1;
  PERFORM run_annual_revisions('2027-11-22');
  total := total+1;
  IF (SELECT retainer_inr FROM client_launches WHERE id=l1) = 22000 THEN passed := passed+1; ELSE fails := fails || ' closed launch revised;'; END IF;

  -- 9. Staff cannot run the job
  total := total+1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM run_annual_revisions('2026-11-22');
    fails := fails || ' authenticated ran job;';
  EXCEPTION WHEN others THEN passed := passed+1;
  END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'REVISION TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
