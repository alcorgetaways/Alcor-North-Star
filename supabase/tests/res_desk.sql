-- Reservation Desk module tests (Stage 3 Q30): grading thresholds, goal pacing, permissions.
-- Creates temporary rows and always aborts at the end, so nothing is kept.
-- Success = error text "RES DESK TESTS PASSED: n/n FAILS:" (empty failure list).
DO $$
DECLARE
  a uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); cid uuid; fu uuid;
  mohnish uuid; sushma uuid; anju uuid; owner uuid; rd uuid;
  t date := public.rd_today(); s jsonb; j jsonb; n int; ok boolean;
  passed int := 0; total int := 0; fails text := '';
  x record;
BEGIN
  SELECT id INTO mohnish FROM profiles WHERE email = 'mohnish@group2001.in';
  SELECT id INTO sushma FROM profiles WHERE email = 'hr@alcorgetaways.com';
  SELECT id INTO anju FROM profiles WHERE email = 'dm@alcorgetaways.com';
  SELECT id INTO owner FROM auth.users WHERE email = 'md@seasonsjawai.com';
  SELECT id INTO rd FROM pipelines WHERE code = 'reservations_desk';

  -- 1. Grade thresholds (A=25, B=20, C=15, D=10) and labels
  FOR x IN SELECT * FROM (VALUES
    ('sales',85,25),('sales',84.9,20),('sales',70,20),('sales',69.9,15),('sales',55,15),('sales',54.9,10),
    ('l2b',12,25),('l2b',11.9,20),('l2b',10,20),('l2b',9.9,15),('l2b',8,15),('l2b',7.9,10),
    ('connects',400,25),('connects',399,20),('connects',300,20),('connects',299,15),('connects',200,15),('connects',199,10),
    ('attendance',90,25),('attendance',89.9,20),('attendance',75,20),('attendance',74.9,15),('attendance',50,15),('attendance',49.9,10)
  ) v(k, val, pts) LOOP
    total := total+1;
    IF public.rd_grade_points(x.k, x.val) = x.pts THEN passed := passed+1;
    ELSE fails := fails || ' points ' || x.k || '@' || x.val || '=' || public.rd_grade_points(x.k, x.val) || ';'; END IF;
  END LOOP;
  total := total+1;
  IF public.rd_grade_label(100) = 'A+' AND public.rd_grade_label(96) = 'A+' AND public.rd_grade_label(95) = 'A'
     AND public.rd_grade_label(86) = 'A' AND public.rd_grade_label(85) = 'B' AND public.rd_grade_label(71) = 'B'
     AND public.rd_grade_label(70) = 'C' AND public.rd_grade_label(51) = 'C' AND public.rd_grade_label(50) = 'D'
     AND public.rd_grade_label(40) = 'D'
  THEN passed := passed+1; ELSE fails := fails || ' grade labels;'; END IF;
  total := total+1;
  IF public.rd_dials_band(1000) = 'green' AND public.rd_dials_band(999) = 'yellow' AND public.rd_dials_band(800) = 'yellow'
     AND public.rd_dials_band(799) = 'red'
  THEN passed := passed+1; ELSE fails := fails || ' dials band;'; END IF;

  -- Fixtures: two associates on the Reservation Desk, a test property
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rd-a@test.local','{}',now(),now()),
         (b2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rd-b@test.local','{}',now(),now());
  INSERT INTO profiles (id, full_name, status) VALUES (a,'T RD A','active'),(b2,'T RD B','active')
    ON CONFLICT (id) DO UPDATE SET status = 'active', full_name = EXCLUDED.full_name, client_id = NULL;
  DELETE FROM user_roles WHERE user_id IN (a, b2);
  INSERT INTO user_roles (user_id, role) VALUES (a,'team_member'),(b2,'team_member');
  INSERT INTO pipeline_members (user_id, pipeline_id, role, source) VALUES (a, rd, 'team_member', 'manual'), (b2, rd, 'team_member', 'manual');
  INSERT INTO clients (hotel_name, city, is_test) VALUES ('ZZ RD Test Hotel', 'Testpur', true) RETURNING id INTO cid;
  INSERT INTO rd_person_goals (user_id, year, yearly_goal_inr) VALUES (a, 2026, 530000);
  INSERT INTO rd_person_goals (user_id, year, yearly_goal_inr, flag) VALUES (b2, 2026, NULL, 'Goal to be set');

  -- 2. Pacing: week goal = (goal − booked before that week) ÷ weeks left including it; override wins
  total := total+1;
  IF public.rd_week_goal(a, '2025-12-29') = 10000 AND public.rd_week_goal(a, '2026-01-05') = round(530000 / 52.0)
  THEN passed := passed+1; ELSE fails := fails || ' first weeks ' || public.rd_week_goal(a, '2026-01-05') || ';'; END IF;
  INSERT INTO bookings (import_key, client_id, sales_person_id, status, booked_on, stay_month, check_in, deal_inr)
  VALUES ('t-rd-1', cid, a, 'BOOKED', '2026-02-10', '2026-03-01', '2026-03-05', 200000),
         ('t-rd-2', cid, a, 'BOOKED', '2026-04-15', '2026-05-01', '2026-05-05', 50000);
  total := total+1;
  -- 30 Mar: (5,30,000 − 2,00,000) ÷ 40 = 8,250. 13 Apr: the 15 Apr booking is this week, not yet counted → 3,30,000 ÷ 38.
  -- 20 Apr: (5,30,000 − 2,50,000) ÷ 37.
  IF public.rd_week_goal(a, '2026-03-30') = 8250 AND public.rd_week_goal(a, '2026-04-13') = round(330000 / 38.0)
     AND public.rd_week_goal(a, '2026-04-20') = round(280000 / 37.0)
  THEN passed := passed+1; ELSE fails := fails || ' weekly pacing ' || public.rd_week_goal(a, '2026-04-13') || '/' || public.rd_week_goal(a, '2026-04-20') || ';'; END IF;
  INSERT INTO rd_week_goal_overrides (user_id, week_start, goal_inr) VALUES (a, '2026-05-18', 99999);
  total := total+1;
  IF public.rd_week_goal(a, '2026-05-20') = 99999 AND public.rd_week_goal(b2, '2026-05-20') IS NULL
  THEN passed := passed+1; ELSE fails := fails || ' override / no goal;'; END IF;

  -- 3. Full grade for one week: 12 bookings / 100 leads, 450 connects, 5/5 present, ₹12,000 vs ₹8,235 → A+ (100)
  INSERT INTO rd_daily_logs (user_id, log_date, leads_received, dials, connects, presence, morning_checkin, evening_checkin)
  SELECT a, d::date, 20, 210, 90, 'present', '09:30', '19:00' FROM generate_series('2026-05-11'::date, '2026-05-15'::date, interval '1 day') d;
  INSERT INTO bookings (import_key, client_id, sales_person_id, status, booked_on, stay_month, check_in, deal_inr, advance_inr)
  SELECT 't-rd-w' || i, cid, a, 'BOOKED', '2026-05-12', '2026-06-01', '2026-06-10', 1000, 500 FROM generate_series(1, 12) i;
  INSERT INTO bookings (import_key, client_id, sales_person_id, status, booked_on, stay_month, check_in, deal_inr)
  VALUES ('t-rd-c', cid, a, 'CANCELLED', '2026-05-13', '2026-06-01', '2026-06-10', 3000);
  s := public._rd_stats(a, '2026-05-11', '2026-05-18');
  total := total+1;
  IF s->>'grade' = 'A+' AND (s->>'total')::int = 100 AND (s->>'l2b_pct')::numeric = 12 AND (s->>'connects_per_week')::int = 450
     AND (s->>'attendance_pct')::numeric = 100 AND (s->>'revenue_booked')::numeric = 12000 AND (s->>'goal')::numeric = round(280000 / 34.0)
     AND (s->>'cancel_pct')::numeric = 20 AND (s->>'advance_pct')::numeric = 50 AND s->>'dials_band' = 'green'
  THEN passed := passed+1; ELSE fails := fails || ' week stats ' || s::text || ';'; END IF;
  -- weaker week: ₹4,500 of ₹8,250 (54.5%), 2/40 leads (5%), 250 connects, 2/3 present → 10+10+15+15 = 50 → D
  INSERT INTO rd_daily_logs (user_id, log_date, leads_received, connects, presence)
  VALUES (a, '2026-06-01', 40, 125, 'present'), (a, '2026-06-02', 0, 125, 'present'), (a, '2026-06-03', 0, 0, 'leave');
  INSERT INTO bookings (import_key, client_id, sales_person_id, status, booked_on, stay_month, check_in, deal_inr)
  VALUES ('t-rd-x1', cid, a, 'BOOKED', '2026-06-02', '2026-07-01', '2026-07-03', 4500), ('t-rd-x2', cid, a, 'BOOKED', '2026-06-02', '2026-07-01', '2026-07-03', 0);
  s := public._rd_stats(a, '2026-06-01', '2026-06-08');
  total := total+1;
  IF (s->'points'->>'sales')::int = 10 AND (s->'points'->>'l2b')::int = 10 AND (s->'points'->>'connects')::int = 15
     AND (s->'points'->>'attendance')::int = 15 AND (s->>'total')::int = 50 AND s->>'grade' = 'D'
  THEN passed := passed+1; ELSE fails := fails || ' weak week ' || (s->'points')::text || ' ' || coalesce(s->>'grade','null') || ';'; END IF;
  total := total+1;
  IF public._rd_stats(b2, '2026-05-11', '2026-05-18')->>'grade' IS NULL
     AND public._rd_stats(b2, '2026-05-11', '2026-05-18')->>'goal_flag' = 'Goal to be set'
  THEN passed := passed+1; ELSE fails := fails || ' no-goal grade;'; END IF;

  INSERT INTO rd_followups (user_id, client_id, next_followup_date) VALUES (b2, cid, t - 2) RETURNING id INTO fu;
  INSERT INTO rd_followup_contacts (followup_id, lead_name, lead_phone) VALUES (fu, 'Private Lead', '9000000000');
  INSERT INTO rd_daily_logs (user_id, log_date, presence) VALUES (b2, t, 'present');

  -- 4. Associate A: own log today/yesterday only; never B's data
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1;
  BEGIN INSERT INTO rd_daily_logs (user_id, log_date, leads_received) VALUES (a, t, 3); passed := passed+1;
  EXCEPTION WHEN others THEN fails := fails || ' own log today: ' || SQLERRM || ';'; END;
  total := total+1;
  BEGIN INSERT INTO rd_daily_logs (user_id, log_date) VALUES (a, t - 1); passed := passed+1;
  EXCEPTION WHEN others THEN fails := fails || ' own log yesterday: ' || SQLERRM || ';'; END;
  ok := false; total := total+1;
  BEGIN INSERT INTO rd_daily_logs (user_id, log_date) VALUES (a, t - 3); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate wrote a 3-day-old log;'; END IF;
  ok := false; total := total+1;
  BEGIN INSERT INTO rd_daily_logs (user_id, log_date) VALUES (b2, t - 1); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate wrote another person''s log;'; END IF;
  total := total+1;
  ok := false;
  BEGIN UPDATE rd_daily_logs SET leads_received = 99 WHERE user_id = a AND log_date = '2026-05-11';
    GET DIAGNOSTICS n = ROW_COUNT; ok := n = 0;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate edited an old log;'; END IF;
  SELECT count(*) INTO n FROM rd_daily_logs WHERE user_id = b2; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' associate sees other logs;'; END IF;
  SELECT count(*) INTO n FROM rd_followups WHERE user_id = b2; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' associate sees other follow-ups;'; END IF;
  SELECT count(*) INTO n FROM rd_followup_contacts; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' associate sees other leads;'; END IF;
  SELECT count(*) INTO n FROM bookings; total := total+1;
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' associate reads booking rows;'; END IF;
  total := total+1;
  BEGIN j := public.rd_performance('2026-05-11', '2026-05-18', a);
    IF jsonb_array_length(j) = 1 AND j->0->>'grade' = 'A+' THEN passed := passed+1; ELSE fails := fails || ' own performance ' || j::text || ';'; END IF;
  EXCEPTION WHEN others THEN fails := fails || ' own performance error ' || SQLERRM || ';'; END;
  ok := false; total := total+1;
  BEGIN PERFORM public.rd_performance('2026-05-11', '2026-05-18', b2); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate read colleague performance;'; END IF;
  ok := false; total := total+1;
  BEGIN PERFORM public.rd_performance('2026-05-11', '2026-05-18'); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate read team table;'; END IF;
  ok := false; total := total+1;
  -- Q40 owner-approved: associates may read only their own grade.
  j := public.rd_grades('2026-05-01', '2026-06-01');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j) v WHERE v->>'user_id'<>a::text) THEN passed := passed+1; ELSE fails := fails || ' associate read another grade;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 5. Head (Mohnish): edits any day, sees the team
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE rd_daily_logs SET leads_received = 21 WHERE user_id = a AND log_date = '2026-05-11';
  GET DIAGNOSTICS n = ROW_COUNT; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' head could not edit old log;'; END IF;
  SELECT count(*) INTO n FROM rd_followup_contacts WHERE followup_id = fu; total := total+1;
  IF n = 1 THEN passed := passed+1; ELSE fails := fails || ' head cannot see lead;'; END IF;
  j := public.rd_performance('2026-05-11', '2026-05-18'); total := total+1;
  IF (SELECT count(*) FROM jsonb_array_elements(j) e WHERE e->>'user_id' IN (a::text, b2::text)) = 2
     AND (SELECT (e->>'overdue_followups')::int FROM jsonb_array_elements(j) e WHERE e->>'user_id' = b2::text) = 1
  THEN passed := passed+1; ELSE fails := fails || ' head team table;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 5b. Follow-ups on time from records (head logs actions for A); typed numbers only on days with no records
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO rd_followups (user_id, client_id, next_followup_date) VALUES (a, cid, t - 1) RETURNING id INTO fu;
  UPDATE rd_followups SET outcome = 'nurture', next_followup_date = t + 3 WHERE id = fu;       -- due yesterday, done today → late
  UPDATE rd_followups SET notes = 'called again' WHERE id = fu;                               -- due t+3, done today → on time
  UPDATE rd_followups SET notes = 'called a third time' WHERE id = fu;                        -- same due date again → not double counted
  INSERT INTO rd_followups (user_id, client_id, next_followup_date) VALUES (a, cid, t - 3);   -- never actioned → missed
  INSERT INTO rd_followups (user_id, client_id, next_followup_date) VALUES (a, cid, t);       -- due today, still open → not counted yet
  INSERT INTO rd_daily_logs (user_id, log_date, followups_due, followups_on_time) VALUES (a, t - 5, 4, 2);
  UPDATE rd_daily_logs SET followups_due = 10, followups_on_time = 0 WHERE user_id = a AND log_date = t - 1;
  EXECUTE 'RESET ROLE';
  s := public._rd_stats(a, t - 7, t + 7); total := total+1;
  IF (s->>'followups_from_records')::int = 3 AND (s->>'followups_typed')::int = 4 AND (s->>'followups_due')::int = 7
     AND (s->>'followups_on_time')::int = 3 AND s->>'followups_source' = 'mixed'
  THEN passed := passed+1; ELSE fails := fails || ' follow-up records ' || jsonb_build_object('r', s->'followups_from_records', 't', s->'followups_typed', 'd', s->'followups_due', 'o', s->'followups_on_time', 's', s->'followups_source')::text || ';'; END IF;
  total := total+1;
  IF public._rd_stats(a, t - 30, t - 8)->>'followups_source' IS NULL
     AND public._rd_stats(a, t - 6, t - 4)->>'followups_source' = 'typed'
  THEN passed := passed+1; ELSE fails := fails || ' follow-up source labels;'; END IF;
  -- associates cannot write action rows themselves
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := false; total := total+1;
  BEGIN INSERT INTO rd_followup_actions (followup_id, user_id, due_date, actioned_on) VALUES (fu, a, t + 30, t - 30); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate forged an on-time action;'; END IF;
  -- nor checkout billing
  ok := false; total := total+1;
  BEGIN INSERT INTO rd_property_billing (client_id, month, direct_billed_inr) VALUES (cid, '2026-10-01', 1); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' associate entered billing;'; END IF;
  EXECUTE 'RESET ROLE';
  -- Finance enters checkout billing (with notes); the head reads it back on the property table
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM profiles WHERE email='accounts@alcorgetaways.com'), 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1;
  BEGIN
    INSERT INTO rd_property_billing (client_id, month, direct_billed_inr, ota_billed_inr, notes)
    SELECT id, '2026-10-01', 150000, 50000, 'test' FROM clients WHERE hotel_name = 'Hardys Retreat';
    passed := passed+1;
  EXCEPTION WHEN others THEN fails := fails || ' finance cannot enter billing: ' || SQLERRM || ';'; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.rd_property_months(2026); total := total+1;
  IF (SELECT (m->>'direct_billed')::numeric = 150000 AND (m->>'ota_billed')::numeric = 50000 AND m->>'billing_notes' = 'test'
        FROM jsonb_array_elements(j) e, jsonb_array_elements(e->'months') m
       WHERE e->>'hotel_name' = 'Hardys Retreat' AND m->>'month' = '2026-10-01')
  THEN passed := passed+1; ELSE fails := fails || ' billing not on property table;'; END IF;
  -- Pacing: remaining uses bookings up to the end of LAST week; bookings dated after today change nothing
  s := public.rd_pacing(a, 2026);
  EXECUTE 'RESET ROLE';
  INSERT INTO bookings (import_key, client_id, sales_person_id, status, booked_on, stay_month, check_in, deal_inr)
  VALUES ('t-rd-future', cid, a, 'BOOKED', t + 14, '2026-12-01', '2026-12-05', 100000),
         ('t-rd-thisweek', cid, a, 'BOOKED', date_trunc('week', t)::date, '2026-12-01', '2026-12-05', 5000);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.rd_pacing(a, 2026);
  EXECUTE 'RESET ROLE';
  total := total+1;
  IF (j->>'remaining')::numeric = (s->>'remaining')::numeric
     AND (j->>'remaining')::numeric = 530000 - (SELECT sum(deal_inr) FROM bookings WHERE sales_person_id = a AND status = 'BOOKED'
                                                 AND booked_on < date_trunc('week', t)::date)
     AND (j->>'weeks_left')::int = ((date '2026-12-28' - date_trunc('week', t)::date) / 7) + 1
     AND (j->>'needed_per_week')::numeric = round((j->>'remaining')::numeric / (j->>'weeks_left')::int)
     AND (j->>'this_week_goal')::numeric = (j->>'needed_per_week')::numeric
     AND (j->>'this_week_booked')::numeric = (s->>'this_week_booked')::numeric + 5000
     AND j->>'booked_through' = (date_trunc('week', t)::date - 1)::text
  THEN passed := passed+1; ELSE fails := fails || ' pacing future bookings ' || s::text || ' → ' || j::text || ';'; END IF;

  -- 6. HR: grades + attendance only; no logs, follow-ups, leads or bookings
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sushma, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.rd_grades('2026-05-11', '2026-05-18'); total := total+1;
  SELECT e INTO s FROM jsonb_array_elements(j) e WHERE e->>'user_id' = a::text;
  -- the head's correction above made it 12/101 leads (11.9%, B) → 95 = A
  IF s->>'grade' = 'A' AND (s->>'total')::int = 95 AND (s->>'attendance_pct')::numeric = 100 AND NOT (s ? 'leads') AND NOT (s ? 'guest_name')
     AND NOT (s ? 'bookings') AND (SELECT count(*) FROM jsonb_object_keys(s)) = 11
  THEN passed := passed+1; ELSE fails := fails || ' hr grades ' || coalesce(s::text,'null') || ';'; END IF;
  SELECT (SELECT count(*) FROM rd_daily_logs) + (SELECT count(*) FROM rd_followups) + (SELECT count(*) FROM rd_followup_contacts)
       + (SELECT count(*) FROM bookings) + (SELECT count(*) FROM booking_guest_contacts) + (SELECT count(*) FROM rd_followup_actions) + (SELECT count(*) FROM rd_property_billing) INTO n;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' hr reads raw rows (' || n || ');'; END IF;
  ok := false; total := total+1;
  BEGIN PERFORM public.rd_performance('2026-05-11', '2026-05-18'); EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN passed := passed+1; ELSE fails := fails || ' hr read full KPIs;'; END IF;
  EXECUTE 'RESET ROLE';

  -- 7. Hotel owner and pipeline staff: nothing
  FOREACH rd IN ARRAY ARRAY[owner, anju] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', rd, 'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT (SELECT count(*) FROM rd_daily_logs) + (SELECT count(*) FROM rd_followups) + (SELECT count(*) FROM rd_followup_contacts)
         + (SELECT count(*) FROM bookings) + (SELECT count(*) FROM booking_guest_contacts) + (SELECT count(*) FROM rd_call_handling)
         + (SELECT count(*) FROM rd_followup_actions) + (SELECT count(*) FROM rd_property_billing) INTO n;
    total := total+1; IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' outsider reads rows (' || n || ');'; END IF;
    ok := false; total := total+1;
    -- Q40 allows other pipeline heads only their own pipeline's staff; clients remain denied.
    BEGIN j := public.rd_grades('2026-05-01', '2026-06-01'); ok := NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j) v WHERE NOT scorecard_can_view((v->>'user_id')::uuid)); EXCEPTION WHEN others THEN ok := true; END;
    IF ok THEN passed := passed+1; ELSE fails := fails || ' outsider read unauthorized grades;'; END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;

  -- 8. Signed-out visitors
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  total := total+1;
  BEGIN PERFORM public.rd_performance('2026-01-01', '2026-02-01'); fails := fails || ' anon ran rd_performance;';
  EXCEPTION WHEN insufficient_privilege THEN passed := passed+1; END;
  total := total+1;
  BEGIN PERFORM count(*) FROM public.rd_daily_logs; fails := fails || ' anon read logs;';
  EXCEPTION WHEN insufficient_privilege THEN passed := passed+1; END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'RES DESK TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
