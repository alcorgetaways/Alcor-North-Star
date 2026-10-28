-- Owner's confirmed contract decisions, 23 Oct 2026. Applied as Mohnish (management) through
-- request_terms_change / start_upgrade so every change is audited and kept in Terms history.
-- Rerunnable: each step is skipped when its target value is already in place.
DO $$
DECLARE
  mohnish uuid; r record; lid uuid; cid uuid; t jsonb; v_cp uuid; v_new uuid;
  note text := 'Owner''s confirmed contract decisions, 23 Oct 2026';
  eco text := 'Ecotrails Hospitality — one signed agreement dated 19 Jun 2026 covering Asiatic Lion Lodge and Blackbuck Safari Lodge';
BEGIN
  SELECT id INTO mohnish FROM profiles WHERE email = 'mohnish@group2001.in';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role', 'authenticated')::text, true);

  FOR r IN SELECT * FROM (VALUES
    ('Cherilyn Monta Resort', '{"commission_direct_pct":12,"commission_ota_pct":10,"commission_weddings_pct":null,"min_term_months":12,"notice_days":60}'::jsonb),
    ('Sariska Tiger Lodge',   '{"commission_direct_pct":12,"commission_ota_pct":10,"commission_weddings_pct":null}'),
    ('Season Jawai',          '{"commission_direct_pct":null,"commission_ota_pct":10,"commission_weddings_pct":null,"contract_start":"2026-07-01"}'),
    ('Spring Hill Resort',    '{"commission_direct_pct":null,"commission_ota_pct":10,"commission_weddings_pct":null}'),
    ('Cabana Affair',         '{"commission_direct_pct":null,"commission_ota_pct":10,"commission_weddings_pct":null,"contract_reference":"Contract accepted as signed by the client (23 Oct 2026)"}'),
    ('Hardys Retreat',        '{"commission_direct_pct":12,"commission_ota_pct":null,"commission_weddings_pct":null,"billing_basis":"postpaid","payment_cycle":"monthly","commission_reconcile_day":7,"booking_advances_via_alcor":true,"invoice_day":1,"due_day":15,"late_interest_pct":18,"min_term_months":12,"notice_days":90,"annual_revision_applicable":false,"contract_reference":"Pro Hotelier Sales & Marketing Partnership Agreement (read 23 Oct 2026)"}'),
    ('Asiatic Lion Lodge',    jsonb_build_object('payment_cycle','monthly','contract_signed_on','2026-06-19','contract_reference',eco)),
    ('Blackbuck Safari Lodge',jsonb_build_object('payment_cycle','monthly','contract_signed_on','2026-06-19','contract_reference',eco)),
    ('Banjara Hotel',         '{"payment_cycle":"monthly","notice_days":30}'),
    ('Melody Moon Resort',    '{"notice_days":30,"add_recurring_fee":{"name":"Google Ads","pipeline_code":"performance_marketing","monthly_inr":8475,"starts_on":"2026-10-23"}}'),
    ('Hotel Maurya Bhopal',   '{"contract_start":"2026-03-07","contract_reference":"Contract valid — signed as \"Hotel Marya Regency\", the same hotel (23 Oct 2026)"}'),
    ('Brahmaputra Jungle Resorts Pvt Ltd', '{"contract_reference":"Contract accepted as signed by the client (23 Oct 2026)"}'),
    ('Reflections By SOL Escapes', '{"contract_start":"2026-01-15","contract_reference":"Agreement accepted as valid (date left blank on the document), 23 Oct 2026"}')
  ) v(hotel, terms) LOOP
    SELECT l.id INTO lid FROM client_launches l JOIN clients c ON c.id = l.client_id
     WHERE c.hotel_name = r.hotel AND l.status IN ('active','live');
    IF lid IS NULL THEN RAISE EXCEPTION 'No active launch for %', r.hotel; END IF;
    -- keep only keys whose value actually differs (rerun-safe); compared as the owner role
    EXECUTE 'RESET ROLE';
    SELECT coalesce(jsonb_object_agg(k, val), '{}'::jsonb) INTO t
      FROM jsonb_each(r.terms) e(k, val)
     WHERE k = 'add_recurring_fee' AND NOT EXISTS (SELECT 1 FROM launch_recurring_fees f WHERE f.launch_id = lid AND f.name = val->>'name')
        OR k <> 'add_recurring_fee' AND (_launch_terms(lid)->k) IS DISTINCT FROM val;
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF t <> '{}'::jsonb THEN
      PERFORM request_terms_change(lid, t, note);
    END IF;
  END LOOP;

  -- Hardys Retreat services from its signed contract; Melody's Google Ads scope note.
  SELECT l.custom_plan_id INTO v_cp FROM client_launches l JOIN clients c ON c.id = l.client_id
   WHERE c.hotel_name = 'Hardys Retreat' AND l.status IN ('active','live');
  INSERT INTO custom_plan_services (custom_plan_id, service_name, scope, pipeline_code, included, sort_order) VALUES
    (v_cp, 'OTA Management', 'OTA management (Pro Hotelier agreement)', 'ota', true, 20),
    (v_cp, 'Website Audit & CRO', 'Website SEO', 'website_seo', true, 21),
    (v_cp, 'Google Ads', 'Google advertising (Meta + Google per agreement)', 'performance_marketing', true, 22)
  ON CONFLICT (custom_plan_id, service_name) DO NOTHING;
  UPDATE custom_plan_services SET scope = 'Rate strategy (Pro Hotelier agreement)' WHERE custom_plan_id = v_cp AND service_name = 'Rate Strategy' AND scope IS NULL;
  UPDATE custom_plan_services SET scope = 'Virtual FrontDesk' WHERE custom_plan_id = v_cp AND service_name = 'Virtual Reservations Desk' AND scope IS NULL;
  UPDATE custom_plan_services SET scope = 'Meta advertising (Meta + Google per agreement)' WHERE custom_plan_id = v_cp AND service_name = 'Meta Ads' AND scope IS NULL;
  UPDATE custom_plans SET approval_status = 'approved', approved_by = mohnish, approved_at = now(),
         notes = concat_ws(E'\n', notes, 'Services set from the signed Pro Hotelier agreement, 23 Oct 2026')
   WHERE id = v_cp AND (approval_status <> 'approved' OR coalesce(notes,'') NOT LIKE '%Pro Hotelier%');

  UPDATE custom_plan_services s SET scope = 'Google search and display advertising — Google Ads added (₹8,475/month recurring add-on, outside the retainer)'
    FROM client_launches l JOIN clients c ON c.id = l.client_id
   WHERE c.hotel_name = 'Melody Moon Resort' AND l.status IN ('active','live') AND s.custom_plan_id = l.custom_plan_id
     AND s.service_name = 'Google Ads' AND s.scope NOT LIKE '%Google Ads added%';

  -- Yogu's Woodside upgrade (Diamond Grow custom, starts 1 Nov 2026).
  SELECT l.id, l.client_id INTO lid, cid FROM client_launches l JOIN clients c ON c.id = l.client_id
   WHERE c.hotel_name = 'Yogu''s Woodside' AND l.status IN ('active','live');
  IF lid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM client_launches WHERE upgraded_from_launch_id = lid) THEN
    v_new := start_upgrade(lid, 'diamond_grow', '2026-11-01',
      '{"retainer_inr":35000,"commission_direct_pct":null,"commission_ota_pct":null,"commission_weddings_pct":null,
        "team_incentive_pct":10,"notice_days":60,"min_term_months":0,"auto_renew":true,"payment_cycle":"monthly",
        "contract_signed_on":"2026-10-15",
        "contract_reference":"New Diamond Grow agreement signed by the client 15 Oct 2026 — accepted as valid; Alcor countersigns later"}'::jsonb,
      '[{"service_name":"Rate Strategy","pipeline_code":"ota","scope":"Rate strategy"},
        {"service_name":"OTA Management","pipeline_code":"ota","scope":"OTA management"},
        {"service_name":"Website Audit & CRO","pipeline_code":"website_seo","scope":"Website SEO"},
        {"service_name":"GMB SEO","pipeline_code":"gbp"},
        {"service_name":"Social Media","pipeline_code":"social_media"},
        {"service_name":"Google Ads","pipeline_code":"performance_marketing","scope":"Google advertising"},
        {"service_name":"Meta Ads","pipeline_code":"performance_marketing","scope":"Meta advertising"},
        {"service_name":"TA Connect – B2B email","pipeline_code":"email_marketing"},
        {"service_name":"Influencer","pipeline_code":"influencer"}]'::jsonb,
      'Upgrade to Diamond Grow from 1 Nov 2026 (agreement signed 15 Oct 2026); team incentive 10% of revenue generated by Alcor teams');
  END IF;

  EXECUTE 'RESET ROLE';

  -- Shared Ecotrails agreement: same contract reference on both contract records.
  UPDATE documents d SET notes = eco, status = 'verified'
    FROM clients c WHERE c.id = d.client_id AND d.category = 'contract'
     AND c.hotel_name IN ('Asiatic Lion Lodge','Blackbuck Safari Lodge') AND d.notes IS DISTINCT FROM eco;

  -- Clear the review flags these decisions resolve.
  UPDATE client_review_items ri SET status = 'resolved', resolved_by = mohnish, resolved_at = now()
    FROM clients c WHERE c.id = ri.client_id AND ri.status = 'open' AND (
         (ri.kind = 'commission_pending' AND c.hotel_name IN ('Cherilyn Monta Resort','Sariska Tiger Lodge','Season Jawai','Spring Hill Resort','Cabana Affair'))
      OR (ri.kind = 'contract_flag' AND c.hotel_name IN ('Hardys Retreat','Asiatic Lion Lodge','Cherilyn Monta Resort','Melody Moon Resort',
                                                         'Hotel Maurya Bhopal','Season Jawai','Cabana Affair','Reflections By SOL Escapes'))
      OR (ri.kind = 'upgrade_pending' AND c.hotel_name = 'Yogu''s Woodside'));
END $$;
