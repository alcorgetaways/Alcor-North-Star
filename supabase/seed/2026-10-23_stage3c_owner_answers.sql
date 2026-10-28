-- Owner's answers to Stage 3 questions 17–19 (23 Oct 2026). Rerunnable: fills only blank fields,
-- flags are inserted ON CONFLICT DO NOTHING, nothing is deleted. Audited via log_admin_action as Mohnish.
DO $$
DECLARE
  mohnish uuid; r record; cid uuid; cur text; n int;
BEGIN
  SELECT id INTO mohnish FROM profiles WHERE email = 'mohnish@group2001.in';

  -- Q19: fill ONLY blank state / destination from the BD tracker's other tabs
  FOR r IN SELECT * FROM (VALUES
    ('Falcon Crest',        'state',       'Kerala',           'Target, Sheet25'),
    ('Falcon Crest',        'destination', 'Vagamon',          'Target, Sheet25'),
    ('Monal Manali',        'state',       'Himachal Pradesh', 'Target'),
    ('Monal Manali',        'destination', 'Manali',           'Target'),
    ('Cabana Affair',       'state',       'Uttarakhand',      'Target, Sheet36'),
    ('Cabana Affair',       'destination', 'Dehradun',         'Target, Sheet36'),
    ('Kutch Safari Resort', 'state',       'Gujarat',          'Target, Hotel Growth Report'),
    ('Kutch Safari Resort', 'destination', 'Bhuj',             'Target, Hotel Growth Report'),
    ('Laguna Anjuna',       'state',       'Goa',              'Sheet2'),
    ('Laguna Anjuna',       'destination', 'Anjuna',           'Sheet2')
  ) v(hotel, field, val, tab) LOOP
    SELECT id INTO cid FROM clients WHERE hotel_name = r.hotel;
    CONTINUE WHEN cid IS NULL;
    EXECUTE format('SELECT %I FROM clients WHERE id = $1', r.field) INTO cur USING cid;
    IF cur IS NULL OR btrim(cur) = '' THEN
      EXECUTE format('UPDATE clients SET %I = $1 WHERE id = $2', r.field) USING r.val, cid;
      PERFORM log_admin_action(mohnish, 'client_field_filled', 'client', cid::text, 'ok',
        jsonb_build_object('hotel', r.hotel, 'field', r.field, 'old', cur, 'new', r.val,
                           'source', 'BD tracker workbook, tab: ' || r.tab));
    END IF;
    -- clear the matching import flag and any open review flag for this field
    UPDATE clients SET import_flags = coalesce((SELECT jsonb_agg(f) FROM jsonb_array_elements(import_flags) f
                                                 WHERE f <> to_jsonb('missing_' || r.field)), '[]'::jsonb)
     WHERE id = cid AND import_flags ? ('missing_' || r.field);
    UPDATE client_review_items SET status = 'resolved', resolved_at = now(), resolved_by = mohnish
     WHERE client_id = cid AND kind = 'missing_in_bd_tracker' AND status = 'open'
       AND message = 'Missing in BD tracker: ' || r.field;
  END LOOP;

  -- Q19: everything else stays blank and is flagged
  FOR r IN SELECT * FROM (VALUES
    ('Bharathiya','state'),('Bharathiya','destination'),('Bier loft','state'),('Bier loft','destination'),
    ('DEV SHREE','state'),('DEV SHREE','destination'),('Divine Stay','state'),('Divine Stay','destination'),
    ('GULP','state'),('GULP','destination'),('Grande Vista Tarkarli','state'),('Grande Vista Tarkarli','destination'),
    ('Hotel Comfort Park','state'),('Hotel Comfort Park','destination'),('Le Holiday Inn','state'),('Le Holiday Inn','destination'),
    ('Urban Comforts','state'),('Urban Comforts','destination'),('Zabeel Restaurant','state'),('Zabeel Restaurant','destination'),
    ('Chakk 109','destination'),('Chakk 109','contact person'),('Chakk 109','phone'),
    ('Bharathiya','contact person'),('Sand2Snow','destination')
  ) v(hotel, field) LOOP
    INSERT INTO client_review_items (client_id, kind, message, source, status, created_by)
    SELECT id, 'missing_in_bd_tracker', 'Missing in BD tracker: ' || r.field,
           'Owner checked every BD tracker tab, 23 Oct 2026', 'open', mohnish
      FROM clients WHERE hotel_name = r.hotel
    ON CONFLICT (client_id, kind, message) DO NOTHING;
  END LOOP;

  -- Q17: property types (only where not yet set)
  UPDATE clients SET property_type = 'Clinic'     WHERE hotel_name = 'Dental centre'     AND property_type IS NULL;
  UPDATE clients SET property_type = 'Restaurant' WHERE hotel_name = 'Zabeel Restaurant' AND property_type IS NULL;
  UPDATE clients SET property_type = 'Bar'        WHERE hotel_name = 'Bier loft'         AND property_type IS NULL;
  INSERT INTO client_review_items (client_id, kind, message, source, status, created_by)
  SELECT id, 'property_type_unknown', 'Property type unknown', 'Owner, 23 Oct 2026', 'open', mohnish
    FROM clients WHERE hotel_name = 'GULP' AND property_type IS NULL
  ON CONFLICT (client_id, kind, message) DO NOTHING;
  UPDATE clients SET property_type = 'Hotel' WHERE property_type IS NULL AND hotel_name <> 'GULP';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM log_admin_action(mohnish, 'property_type_default', 'client', NULL, 'ok',
      jsonb_build_object('set_to_hotel', n, 'source', 'Owner answer Q17, 23 Oct 2026'));
  END IF;

  -- Q18: churned launches without a closure date keep it blank and get a flag
  INSERT INTO client_review_items (client_id, kind, message, source, status, created_by)
  SELECT l.client_id, 'exit_date_unknown',
         'Exit date unknown — ' || coalesce(cp.name, pl.name, 'launch') || ' (launch ' || left(l.id::text, 8) || ')',
         'Churned in BD tracker with no closure date', 'open', mohnish
    FROM client_launches l
    JOIN closing_reasons cr ON cr.code = l.closing_reason_code AND cr.is_churn
    LEFT JOIN plans pl ON pl.id = l.plan_id
    LEFT JOIN custom_plans cp ON cp.id = l.custom_plan_id
   WHERE l.closed_at IS NULL AND l.status IN ('closed','completed')
  ON CONFLICT (client_id, kind, message) DO NOTHING;
END $$;
