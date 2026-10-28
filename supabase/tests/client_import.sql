-- Client import verification (Prompt 6). Read-only checks against the imported
-- data plus owner-scope checks via JWT impersonation. Always aborts at the end,
-- so nothing is kept. Success = error text "CLIENT IMPORT TESTS PASSED: n/n".
DO $$
DECLARE
  excel_owner uuid; season_owner uuid; mohnish uuid;
  n int; passed int := 0; total int := 0;
  names text[];
  ret numeric; dep numeric; cid uuid;
BEGIN
  SELECT id INTO excel_owner FROM auth.users WHERE email = 'excelhotelandresort@gmail.com';
  SELECT id INTO season_owner FROM auth.users WHERE email = 'md@seasonsjawai.com';
  SELECT id INTO mohnish FROM profiles WHERE email = 'mohnish@group2001.in';

  -- ---- Excel owner sees exactly the parent + 5 child properties ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', excel_owner, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), array_agg(hotel_name ORDER BY hotel_name) INTO n, names
  FROM clients WHERE can_view_client(id);
  total := total + 1;
  IF n = 6 AND names = ARRAY['Excel Bhimtal','Excel Corbett','Excel Main Brand','Excel Nainital','La Perle Resort','The Banyan Retreat']
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL excel owner scope: % %', n, names; END IF;

  -- ---- Season Jawai owner sees only Season Jawai ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', season_owner, 'role', 'authenticated')::text, true);
  SELECT count(*), array_agg(hotel_name) INTO n, names FROM clients WHERE can_view_client(id);
  total := total + 1;
  IF n = 1 AND names = ARRAY['Season Jawai'] THEN passed := passed + 1;
  ELSE RAISE NOTICE 'FAIL season owner scope: % %', n, names; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---- Simcha: retainer 0, deposit 200000 kept out of the retainer (MRR) column ----
  SELECT l.retainer_inr, l.deposit_inr INTO ret, dep
  FROM client_launches l JOIN clients c ON c.id = l.client_id
  WHERE c.hotel_name = 'Simcha Island- By crafted creations' AND l.source_row = 65;
  total := total + 1;
  IF ret = 0 AND dep = 200000 THEN passed := passed + 1;
  ELSE RAISE NOTICE 'FAIL simcha terms: retainer % deposit %', ret, dep; END IF;
  total := total + 1;
  IF NOT EXISTS (SELECT 1 FROM client_launches WHERE status = 'active' AND deposit_inr > 0 AND COALESCE(retainer_inr,0) > 0)
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL deposit mixed into retainer'; END IF;

  -- ---- Palm Spring tagged test, its data untouched ----
  total := total + 1;
  IF EXISTS (SELECT 1 FROM clients WHERE hotel_name = 'The Palm Spring Resort' AND is_test)
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id = l.client_id
                 WHERE c.hotel_name = 'The Palm Spring Resort' AND l.source_row IS NULL)
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL palm spring test tag'; END IF;

  -- ---- Countryside merged into one client, two launches chained ----
  SELECT count(*) INTO n FROM clients WHERE hotel_name IN ('Countryside Villa By Alcor','Countryside Villa - Dhanaulti');
  total := total + 1;
  IF n = 1 THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL countryside merge: % clients', n; END IF;
  SELECT c.id INTO cid FROM clients c WHERE c.hotel_name = 'Countryside Villa - Dhanaulti';
  total := total + 1;
  IF (SELECT count(*) FROM client_launches WHERE client_id = cid) = 2
     AND EXISTS (SELECT 1 FROM client_launches cur JOIN client_launches prev ON prev.id = cur.previous_launch_id
                 WHERE cur.client_id = cid AND cur.source_row = 68 AND prev.source_row = 22 AND cur.status = 'on_hold' AND prev.status = 'closed')
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL countryside launch chain'; END IF;

  -- ---- Cabana Affair: three launches, latest active, chain intact ----
  SELECT c.id INTO cid FROM clients c WHERE c.hotel_name = 'Cabana Affair';
  total := total + 1;
  IF (SELECT count(*) FROM client_launches WHERE client_id = cid) = 3
     AND EXISTS (SELECT 1 FROM client_launches WHERE client_id = cid AND source_row = 60 AND status = 'active'
                 AND previous_launch_id = (SELECT id FROM client_launches WHERE client_id = cid AND source_row = 36))
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL cabana chain'; END IF;

  -- ---- Excel structure: parent active launch 200000, row 56 closed on parent, children closed launches ----
  SELECT c.id INTO cid FROM clients c WHERE c.hotel_name = 'Excel Main Brand';
  total := total + 1;
  IF EXISTS (SELECT 1 FROM client_launches WHERE client_id = cid AND source_row = 53 AND status = 'active' AND retainer_inr = 200000)
     AND EXISTS (SELECT 1 FROM client_launches WHERE client_id = cid AND source_row = 56 AND status = 'closed'
                 AND previous_launch_id IS NULL)
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients ch ON ch.id = l.client_id
                 WHERE ch.hotel_name = 'The Banyan Retreat' AND l.source_row = 45 AND l.status = 'closed')
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients ch ON ch.id = l.client_id
                 WHERE ch.hotel_name = 'Excel Bhimtal' AND l.source_row = 46 AND l.status = 'closed')
     AND (SELECT count(*) FROM clients WHERE parent_client_id = cid) = 5
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL excel structure'; END IF;

  -- ---- All legacy custom plans approved by Mohnish with the import note ----
  total := total + 1;
  IF NOT EXISTS (SELECT 1 FROM custom_plans WHERE notes IN ('Legacy agreement imported from BD tracker','Services corrected from signed contract, 23 Oct 2026')
                 AND (approval_status <> 'approved' OR approved_by IS DISTINCT FROM mohnish))
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL custom plan approval'; END IF;

  -- ---- Confirmed custom terms: Yadus, Kutani, Dental ----
  total := total + 1;
  IF EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id = l.client_id
             WHERE c.hotel_name = 'Yadus Jawai - By Alcor' AND l.retainer_inr = 30000
               AND l.commission_ota_pct = 10 AND l.commission_direct_pct = 11)
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id = l.client_id
             WHERE c.hotel_name = 'Kutani Bagh Sariska' AND l.retainer_inr = 35000
               AND l.commission_ota_pct = 10 AND l.commission_direct_pct = 12)
     AND EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id = l.client_id
             WHERE c.hotel_name = 'Dental centre' AND l.retainer_inr = 7000
               AND COALESCE(l.commission_ota_pct,0) = 0 AND COALESCE(l.commission_direct_pct,0) = 0)
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL confirmed custom terms'; END IF;

  -- ---- 69 launches traced to source rows; churned rows closed without a closure date ----
  total := total + 1;
  IF (SELECT count(*) FROM client_launches WHERE source_row IS NOT NULL) = 69
     AND (SELECT count(*) FROM client_launches WHERE source_row IS NOT NULL AND status = 'closed'
          AND closing_reason_code = 'client_discontinued' AND closed_at IS NULL) = 48
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL source row trace'; END IF;

  -- ---- Owner logins: all 20 imported emails exist with the client role, Hardys trimmed ----
  total := total + 1;
  IF (SELECT count(*) FROM auth.users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'client'
      WHERE u.email IN ('hardeepsingh2412hs@gmail.com','moryaregency@gmail.com','brahmaputraresort@yahoo.com',
        'asiaticlionlodgemkng@gmail.com','blackbucksafarilodgemkng@gmail.com','banjarahotel9@gmail.com',
        'reflectionsbysolescapes@gmail.com','excelhotelandresort@gmail.com','marketingyaan6@gmail.com',
        'info@melodymoondesertcamp.com','md@seasonsjawai.com','hotelmamasrasoi@gmail.com',
        'cabanaaffairddn@gmail.com','yadusjawai@gmail.com','hotelkutanibaghsariska@gmail.com',
        'info@cherilynmonta.com','hardysretreat@gmail.com','director@craftedcelebration.in',
        'lodgesariskatiger@gmail.com','contact@longislandresorts.in')) = 20
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL owner logins'; END IF;

  -- ---- The Narayana Palace kept as churned, no login ----
  total := total + 1;
  IF EXISTS (SELECT 1 FROM client_launches l JOIN clients c ON c.id = l.client_id
             WHERE c.hotel_name = 'The Narayana Palace' AND l.status = 'closed')
     AND NOT EXISTS (SELECT 1 FROM profiles p JOIN clients c ON c.id = p.client_id WHERE c.hotel_name = 'The Narayana Palace')
  THEN passed := passed + 1; ELSE RAISE NOTICE 'FAIL narayana'; END IF;

  RAISE EXCEPTION 'CLIENT IMPORT TESTS PASSED: %/%', passed, total;
END $$;
