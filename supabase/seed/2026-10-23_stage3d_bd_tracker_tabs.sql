-- Stage 3 Q20–Q49 data: BD-tracker tabs (Hotel Growth Report, Issue Logs, Target), property goals,
-- new KPI library rows and the Countryside on-hold flag. Safe to rerun: every insert is idempotent.
DO $$
DECLARE
  actor uuid := (SELECT id FROM profiles WHERE email = 'mohnish@group2001.in');
  shalini uuid := (SELECT id FROM profiles WHERE email = 'shalini@alcorgetaways.com');
  dinesh uuid := (SELECT id FROM profiles WHERE email = 'alcor@group2001.in');
  n int;
BEGIN
  -- 1) Hotel Growth Report → report history (Jan–Jun 2026). Unmatched names are flagged, never created.
  WITH src(brand, target, months) AS (VALUES
    ('Kutch Safari Resort - Bhuj', 'Kutch Safari Resort', '{1}'::int[]),
    ('Cabana Affair Cafe | Resort', 'Cabana Affair', '{1,2,3,4,5,6}'),
    ('Falcon Crest Resort', 'Falcon Crest', '{1,2,3,4,5,6}'),
    ('Dental Centre - Dentist in Chattarpur', 'Dental centre', '{1,2,3,4,5,6}'),
    ('Medicare - Dental clinic | Skin | Ayurveda', NULL, '{1,2,3,4,5,6}'),
    ('Medicare - Dental Clinic | Skin | implant center', NULL, '{1,2,3,4,5,6}'),
    ('The Banyan Retreat (Excel grp)', 'The Banyan Retreat', '{2,3,4,5,6}'),
    ('Excel Hotel & resorts Bhimtal (excel group)', 'Excel Bhimtal', '{2,3,4,5,6}'),
    ('Countryside Villa - Dhanaulti', 'Countryside Villa - Dhanaulti', '{1,2,3,4,5,6}'),
    ('Reflections by SOL Escapes', 'Reflections By SOL Escapes', '{1,2,3,4,5,6}'),
    ('Buransh Stays - Sari Village', 'Buransh stays - Sari', '{2,3,4,5}'),
    ('Hardy''s Retreat', 'Hardys Retreat', '{2,3,4,5,6}'),
    ('Green Valley Resort - By Dev', 'Green Valley', '{1,2,3}'),
    ('Laguna Anjuna - By Alcor', 'Laguna Anjuna', '{1,2,3}'),
    ('Upvan Jawai - By dev', 'Upvan Jawai', '{1,2,3}'),
    ('Yadus Jawai - By Alcor', 'Yadus Jawai - By Alcor', '{1,2,3,4,5,6}'),
    ('Kutani Bagh Sariska', 'Kutani Bagh Sariska', '{1,2,3,4,5,6}'),
    ('Kanchangarh Resort Udaipur', 'The Kanchangarh Resort', '{1,2}'),
    ('JR Service Apartment Hotel', 'JR Service Apartment Hotel', '{1,2,3,4,5,6}'),
    ('YOGU''S WOODSIDE', 'Yogu''s Woodside', '{1,2,3,4,5,6}'))
  INSERT INTO report_history (client_id, source_name, month, flag)
  SELECT c.id, s.brand, make_date(2026, m, 1), CASE WHEN c.id IS NULL THEN 'Unmatched name — no client in North Star' END
    FROM src s CROSS JOIN LATERAL unnest(s.months) m LEFT JOIN clients c ON c.hotel_name = s.target
  ON CONFLICT (source_name, month) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM log_admin_action(actor, 'bd_tracker_import', 'report_history', NULL, 'ok',
      jsonb_build_object('source', 'BD tracker workbook, tab: Hotel Growth Report', 'rows', n));
  END IF;

  -- 2) Issue Logs → imported issues. Client not certain → flagged, no action item until management picks the client.
  INSERT INTO imported_issues (issue_no, raised_on, category, issue, action_taken, status, raised_by, owner_name, owner_id, candidate_client_ids, flag)
  VALUES
   (1, '2026-03-02', 'Pet', 'A booking was made with a pet without proper information and the client faced an issue at the resort.',
    'Message escalated to group.', 'Resolved', 'Devendra ji (client contact)', 'Shalini (resolved)', shalini,
    ARRAY(SELECT id FROM clients WHERE hotel_name IN ('Green Valley','Upvan Jawai') ORDER BY hotel_name),
    'Client not certain: Green Valley or Upvan Jawai (both Devendra)'),
   (2, '2026-03-05', 'Social media', 'Client wants images of all posts with AI additions.',
    'Escalated to Social team.', 'In Progress', 'Rajni (client contact)', 'Social Media head (Dinesh)', dinesh,
    '{}', 'Client not specified')
  ON CONFLICT (source, issue_no) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM log_admin_action(actor, 'bd_tracker_import', 'imported_issues', NULL, 'ok',
      jsonb_build_object('source', 'BD tracker workbook, tab: Issue Logs', 'rows', n));
  END IF;

  -- 3) Target → BD targets for Shalini (per-client plan rows are NOT re-imported: they duplicate the Clients tab).
  INSERT INTO bd_targets (bd_user_id, kind, plan_code, target_value, period_start, due_date, notes, source, created_by)
  VALUES
   (shalini, 'monthly_retainer', NULL, 1000000, NULL, NULL, 'Monthly signed-retainer goal (sheet showed ₹5,20,000 achieved earlier this year)', 'BD tracker workbook, tab: Target', actor),
   (shalini, 'new_clients', 'gmb_seo', 6, '2026-01-01', '2026-05-30', 'GMB: 6 new clients by 30 May', 'BD tracker workbook, tab: Target', actor),
   (shalini, 'new_clients', 'diamond_grow', 6, '2026-01-01', '2026-05-30', 'Growing: 6 new clients by 30 May', 'BD tracker workbook, tab: Target', actor),
   (shalini, 'new_clients', 'diamond_scale', 6, '2026-01-01', '2026-06-30', 'Pro: 6 new clients by 30 June', 'BD tracker workbook, tab: Target', actor)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM log_admin_action(actor, 'bd_tracker_import', 'bd_targets', NULL, 'ok',
      jsonb_build_object('source', 'BD tracker workbook, tab: Target', 'rows', n));
  END IF;

  -- 4) Q28 yearly owner goals for FY 2026-27 (crores → rupees), month_no 0 = yearly.
  INSERT INTO sales_goals (scope, subject_key, fy, month_no, goal_inr, updated_by)
  SELECT 'property', c.id::text, 2026, 0, g.cr * 10000000, actor
    FROM (VALUES ('Yadus Jawai - By Alcor', 1.75), ('Kutani Bagh Sariska', 1.25), ('Cherilyn Monta Resort', 2.0),
                 ('Hardys Retreat', 0.85), ('Simcha Island- By crafted creations', 2.0), ('Sariska Tiger Lodge', 0.5),
                 ('Ramat Niwas By Kutani Stays', 1.0)) g(name, cr)
    JOIN clients c ON c.hotel_name = g.name
  ON CONFLICT (scope, subject_key, fy, month_no) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM log_admin_action(actor, 'owner_goal_import', 'sales_goals', NULL, 'ok',
      jsonb_build_object('source', 'BD tracker owner goal (crores), FY 2026-27', 'rows', n));
  END IF;

  -- 5) Q29 KPI library additions (monthly, entered by the pipeline team on the pipeline KPI page).
  INSERT INTO kpi_definitions (pipeline_id, name, kpi_type, unit, direction, source_key, sort_order, definition, controllable)
  SELECT p.id, k.name, k.t, k.u, k.d, k.sk, k.so, k.def, true
    FROM (VALUES
      ('website_seo', 'Organic sessions', 'number', 'count', 'higher_better', 'pke.organic_sessions', 1, 'Website sessions from organic search in the month.'),
      ('website_seo', 'Booking-engine conversions', 'number', 'count', 'higher_better', 'pke.booking_engine_conversions', 2, 'Bookings completed on the website booking engine.'),
      ('website_seo', 'Page speed score (mobile)', 'number', '/100', 'higher_better', 'pke.page_speed_mobile', 3, 'Google PageSpeed mobile score for the home page.'),
      ('website_seo', 'Keywords in Google top 10', 'number', 'count', 'higher_better', 'pke.keywords_top10', 4, 'Tracked keywords ranking on page one of Google.'),
      ('marketing_funnel', 'Leads captured', 'number', 'count', 'higher_better', 'pke.leads_captured', 1, 'Leads captured by the funnel in the month.'),
      ('marketing_funnel', 'Lead-to-booking %', 'percentage', '%', 'higher_better', 'pke.lead_to_booking_pct', 2, 'Captured leads that became confirmed bookings.'),
      ('marketing_funnel', 'Average first-response time', 'number', 'minutes', 'lower_better', 'pke.first_response_min', 3, 'Average minutes to first response on a new lead (lower is better).')
    ) k(code, name, t, u, d, sk, so, def)
    JOIN pipelines p ON p.code = k.code
   WHERE NOT EXISTS (SELECT 1 FROM kpi_definitions x WHERE x.pipeline_id = p.id AND x.source_key = k.sk);

  -- 6) Q22 Countryside Villa: on-hold start date was never recorded → leave blank and flag it.
  INSERT INTO client_review_items (client_id, kind, message, source)
  SELECT c.id, 'other', 'On-hold start date unknown', 'Q22 owner answer'
    FROM clients c WHERE c.hotel_name = 'Countryside Villa - Dhanaulti'
     AND NOT EXISTS (SELECT 1 FROM client_review_items r WHERE r.client_id = c.id AND r.message = 'On-hold start date unknown');
END $$;
