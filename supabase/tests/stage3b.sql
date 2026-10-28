-- Stage 3b: booking void / no hard delete, third-party costs approval path, demo => test,
-- login-email auto-queue. Always aborts at the end. Success = "STAGE3B TESTS PASSED: n/n".
DO $$
DECLARE
  amit uuid; shalini uuid; mohnish uuid; arvind uuid; cid uuid; bid uuid; lid uuid; ch jsonb; nu uuid := gen_random_uuid();
  ok boolean; n int; passed int := 0; total int := 0; fails text := '';
BEGIN
  SELECT id INTO amit FROM profiles WHERE email='accounts@alcorgetaways.com';
  SELECT id INTO shalini FROM profiles WHERE email='shalini@alcorgetaways.com';
  SELECT id INTO mohnish FROM profiles WHERE email='mohnish@group2001.in';
  SELECT id INTO arvind FROM profiles WHERE email='alcorgetaways.leadforms@gmail.com';
  SELECT id INTO cid FROM clients WHERE hotel_name='Melody Moon Resort';
  SELECT id INTO lid FROM client_launches WHERE client_id=cid AND status IN ('active','live');
  INSERT INTO bookings (import_key, client_id, status, stay_month, check_in, deal_inr) VALUES ('t-3b', cid, 'BOOKED', '2026-10-01', '2026-10-05', 10000) RETURNING id INTO bid;
  INSERT INTO booking_guest_contacts (booking_id, guest_phone) VALUES (bid, '9999999999');

  -- 1. Hard delete blocked even for the owner role
  ok := false; BEGIN DELETE FROM booking_guest_contacts WHERE booking_id = bid; EXCEPTION WHEN others THEN ok := true; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE fails := fails || ' contact deleted;'; END IF;
  ok := false; BEGIN DELETE FROM bookings WHERE id = bid; EXCEPTION WHEN others THEN ok := true; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE fails := fails || ' booking deleted;'; END IF;

  -- 2. Direct edit of void fields refused; staff (non-finance) cannot void
  ok := false; BEGIN UPDATE bookings SET voided_at = now() WHERE id = bid; EXCEPTION WHEN others THEN ok := true; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE fails := fails || ' direct void allowed;'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', shalini, 'role','authenticated')::text, true);
  ok := false; BEGIN PERFORM void_booking(bid, 'x'); EXCEPTION WHEN others THEN ok := true; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE fails := fails || ' BD voided;'; END IF;
  -- 3. Finance voids with a reason; booking kept, cancelled, re-import can't revive it
  PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
  PERFORM void_booking(bid, 'Duplicate entry');
  EXECUTE 'RESET ROLE';
  UPDATE bookings SET status = 'BOOKED' WHERE id = bid;
  total := total+1;
  IF (SELECT status='CANCELLED' AND voided_at IS NOT NULL AND void_reason='Duplicate entry' AND voided_by=amit FROM bookings WHERE id=bid)
  THEN passed := passed+1; ELSE fails := fails || ' void not kept;'; END IF;

  -- 4. Third-party costs: BD -> pending (nothing changes), management approval applies + history
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', shalini, 'role','authenticated')::text, true);
  ch := request_third_party_change(lid, 'Shared 50/50 with Alcor', ARRAY['CRM','IVR'], 'test');
  EXECUTE 'RESET ROLE';
  total := total+1;
  IF ch->>'status' = 'pending' AND (SELECT third_party_costs IS NULL FROM client_launches WHERE id=lid) THEN passed := passed+1; ELSE fails := fails || ' bd not pending;'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  PERFORM decide_terms_change((ch->>'id')::uuid, true, NULL);
  EXECUTE 'RESET ROLE';
  total := total+1;
  IF (public._launch_terms(lid)->>'third_party_costs') = 'Shared 50/50 with Alcor'
     AND (public._launch_terms(lid)->'third_party_cost_items') = '["CRM","IVR"]'::jsonb
     AND EXISTS (SELECT 1 FROM commercial_term_changes WHERE id=(ch->>'id')::uuid AND status='applied' AND old_terms ? 'third_party_costs')
  THEN passed := passed+1; ELSE fails := fails || ' approval not applied;'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- Pipeline staff cannot request it
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  ok := false; BEGIN PERFORM request_third_party_change(lid, 'x', NULL, NULL); EXCEPTION WHEN others THEN ok := true; END;
  total := total+1; IF ok THEN passed := passed+1; ELSE fails := fails || ' staff edited terms;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 5. Demo implies test (so every test filter hides demo data)
  INSERT INTO clients (hotel_name, is_demo) VALUES ('ZZ Demo 3b', true);
  total := total+1;
  IF (SELECT is_test FROM clients WHERE hotel_name='ZZ Demo 3b') AND NOT EXISTS (SELECT 1 FROM clients WHERE is_demo AND NOT is_test)
  THEN passed := passed+1; ELSE fails := fails || ' demo not test;'; END IF;

  -- 6. New user -> one login email queued (no password stored); existing user gaining a role -> none
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (nu,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-3b@test.local','{}',now(),now());
  INSERT INTO profiles (id, full_name, email, status) VALUES (nu, 'T 3b', 't-3b@test.local', 'active') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  INSERT INTO user_roles (user_id, role) VALUES (nu, 'team_member') ON CONFLICT DO NOTHING;
  INSERT INTO user_roles (user_id, role) VALUES (nu, 'hr') ON CONFLICT DO NOTHING;
  SELECT count(*) INTO n FROM login_emails WHERE user_id = nu;
  total := total+1; IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' new user queued=' || n || ';'; END IF;
  SELECT p.id INTO arvind FROM profiles p WHERE p.created_at < now() - interval '2 days'
     AND NOT EXISTS (SELECT 1 FROM login_emails e WHERE e.user_id = p.id) ORDER BY p.created_at LIMIT 1;
  INSERT INTO user_roles (user_id, role) VALUES (arvind, 'hr') ON CONFLICT DO NOTHING;
  SELECT count(*) INTO n FROM login_emails WHERE user_id = arvind;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' existing user queued;'; END IF;
  -- Only admin reads the queue
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM login_emails;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' finance reads login emails;'; END IF;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'STAGE3B TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
