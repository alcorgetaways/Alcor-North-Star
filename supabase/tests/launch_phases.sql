-- Launch phases P0-P9 + template de-duplication tests. Read-only checks;
-- always aborts at the end so nothing is kept. Success = error text "LAUNCH PHASE TESTS PASSED: n/n".
DO $$
DECLARE
  n int; m int; passed int := 0; total int := 0;
  ds uuid; dg uuid; dsc uuid; gs uuid;
BEGIN
  SELECT id INTO ds FROM plans WHERE code = 'diamond_start';
  SELECT id INTO dg FROM plans WHERE code = 'diamond_grow';
  SELECT id INTO dsc FROM plans WHERE code = 'diamond_scale';
  SELECT id INTO gs FROM plans WHERE code = 'gmb_seo';

  -- 1. Phases P0-P9 exist in order
  SELECT count(*) INTO n FROM launch_phases;
  total := total+1; IF n = 10 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL phases count %', n; END IF;

  -- 2. Every launch module is mapped to a phase
  SELECT count(*) INTO n FROM launch_modules WHERE phase_code IS NULL;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL unmapped modules %', n; END IF;

  -- 3. Module -> phase/pipeline spot checks
  total := total+1;
  IF EXISTS (SELECT 1 FROM launch_modules WHERE code='FUN' AND phase_code='P5' AND pipeline_code='marketing_funnel')
     AND EXISTS (SELECT 1 FROM launch_modules WHERE code='BRD' AND phase_code='P9' AND pipeline_code='corporate_comms')
     AND EXISTS (SELECT 1 FROM launch_modules WHERE code='AM' AND phase_code='P0' AND pipeline_code IS NULL)
     AND EXISTS (SELECT 1 FROM launch_modules WHERE code='VRD' AND phase_code='P8' AND pipeline_code='reservations_desk')
  THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL module mapping'; END IF;

  -- 4. Task moves: FUN tasks -> marketing_funnel P5; BRD.02-BRD.11 -> website_seo P1; other BRD -> corporate_comms P9
  SELECT count(*) INTO n FROM checklist_templates WHERE module_code='FUN' AND (pipeline_code <> 'marketing_funnel' OR phase_code <> 'P5');
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL FUN move %', n; END IF;
  SELECT count(*) INTO n FROM checklist_templates WHERE module_code='BRD' AND code IN ('BRD.02','BRD.03','BRD.04','BRD.05','BRD.06','BRD.07','BRD.08','BRD.09','BRD.10','BRD.11') AND (pipeline_code <> 'website_seo' OR phase_code <> 'P1');
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL BRD website move %', n; END IF;
  SELECT count(*) INTO n FROM checklist_templates WHERE module_code='BRD' AND code IN ('BRD.01','BRD.12','BRD.13','BRD.14','BRD.15') AND (pipeline_code <> 'corporate_comms' OR phase_code <> 'P9');
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL BRD brand stay %', n; END IF;

  -- 5. No template rows deleted; canonical + superseded = 544
  -- (Anju's 21 GBP onboarding items were added 26 Oct; old GBP items kept, active=false)
  SELECT count(*) INTO n FROM checklist_templates;
  total := total+1; IF n = 544 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL template total %', n; END IF;
  SELECT count(*) INTO n FROM checklist_templates WHERE superseded_by IS NOT NULL;
  SELECT count(*) INTO m FROM checklist_templates WHERE superseded_by IS NULL;
  total := total+1; IF n + m = 544 AND m = 263 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL canonical/superseded %/%', m, n; END IF;

  -- 6. One canonical per (module, code, normalised name); superseded rows point at a same-key canonical
  SELECT count(*) INTO n FROM (
    SELECT module_code, code, lower(btrim(name)) FROM checklist_templates WHERE superseded_by IS NULL
    GROUP BY 1,2,3 HAVING count(*) > 1) d;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL duplicate canonical %', n; END IF;
  SELECT count(*) INTO n FROM checklist_templates s JOIN checklist_templates c ON c.id = s.superseded_by
  WHERE s.superseded_by IS NOT NULL AND (c.superseded_by IS NOT NULL OR c.module_code <> s.module_code OR c.code <> s.code OR lower(btrim(c.name)) <> lower(btrim(s.name)));
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL superseded pointer %', n; END IF;

  -- 7. Canonical task count per plan (includes Anju's 21 GBP items added 26 Oct)
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id WHERE ctp.plan_id = ds AND ct.superseded_by IS NULL;
  total := total+1; IF n = 152 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start canonical %', n; END IF;
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id WHERE ctp.plan_id = dg AND ct.superseded_by IS NULL;
  total := total+1; IF n = 187 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL grow canonical %', n; END IF;
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id WHERE ctp.plan_id = dsc AND ct.superseded_by IS NULL;
  total := total+1; IF n = 203 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL scale canonical %', n; END IF;
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id WHERE ctp.plan_id = gs AND ct.superseded_by IS NULL;
  total := total+1; IF n = 65 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL gmb canonical %', n; END IF;
  -- 7b. Only active templates generate tasks: old GBP items are inactive
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id WHERE ctp.plan_id = ds AND ct.superseded_by IS NULL AND ct.active;
  total := total+1; IF n = 137 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start active canonical %', n; END IF;

  -- 8. Diamond Start: no WhatsApp (WA) and no Virtual Reservations Desk (VRD) tasks
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id
  WHERE ctp.plan_id = ds AND (ct.module_code IN ('WA','VRD') OR ct.pipeline_code = 'whatsapp');
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start has WA/VRD %', n; END IF;
  -- but its own client-side Reservations Readiness (RES) tasks stay
  SELECT count(*) INTO n FROM checklist_template_plans ctp JOIN checklist_templates ct ON ct.id = ctp.template_id
  WHERE ctp.plan_id = ds AND ct.module_code = 'RES';
  total := total+1; IF n = 8 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start RES %', n; END IF;

  -- 9. The Palm Spring Resort's existing tasks are untouched and phase-tagged
  -- A new real hotel (Yash residency, 26 Oct 2026) adds its own 44 tasks.
  -- This assertion preserves Palm Spring's original 182, not a global roster cap.
  SELECT count(*) INTO n FROM client_tasks WHERE phase = 'onboarding'
    AND client_id = (SELECT id FROM clients WHERE hotel_name = 'The Palm Spring Resort');
  total := total+1; IF n = 182 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL palm task count %', n; END IF;
  SELECT count(*) INTO n FROM client_tasks t LEFT JOIN checklist_templates ct ON ct.id = t.template_id
  WHERE t.phase = 'onboarding' AND (ct.id IS NULL OR t.phase_code IS NULL);
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL palm task links %', n; END IF;
  SELECT count(*) INTO n FROM client_tasks t JOIN checklist_templates ct ON ct.id = t.template_id
  WHERE t.phase = 'onboarding' AND ct.superseded_by IS NOT NULL;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL palm tasks point at superseded %', n; END IF;

  -- 10. Gates carry phases
  SELECT count(*) INTO n FROM client_gates WHERE phase_code IS NULL;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL gate phases %', n; END IF;
  SELECT count(*) INTO n FROM gate_criteria WHERE phase_code IS NULL;
  total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL gate criteria phases %', n; END IF;

  -- 11. End-to-end: activating a Diamond Start launch generates its canonical checklist
  DECLARE
    mgr uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); l1 uuid := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    VALUES (mgr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t4-mgr@test.local','{}',now(),now());
    INSERT INTO profiles (id, full_name, status) VALUES (mgr,'T4 Mgr','active')
      ON CONFLICT (id) DO UPDATE SET status='active', full_name = EXCLUDED.full_name;
    DELETE FROM user_roles WHERE user_id = mgr;
    INSERT INTO user_roles (user_id, role) VALUES (mgr,'management');
    INSERT INTO clients (id, hotel_name, status, onboarding_status, created_by) VALUES (c1,'T4 Start Hotel','active','in_progress',mgr);
    -- Day 0 needs the signed agreement + advance amount, date and reference (Q42)
    INSERT INTO documents (client_id, doc_type, status, file_path) VALUES (c1, 'Agreement Copy', 'uploaded', 't4/agreement.pdf'),
      (c1, 'NOC — No Objection Certificate', 'uploaded', 't4/noc.pdf');
    INSERT INTO client_launches (id, client_id, plan_id, status, day0_date, created_by, advance_amount, advance_received_at, payment_reference)
    SELECT l1, c1, id, 'awaiting_day0', CURRENT_DATE, mgr, 10000, now(), 'T4-UTR' FROM plans WHERE code='diamond_start';
    INSERT INTO client_module_assignments (launch_id, client_id, module_code, primary_user_id, client_contact_name)
    SELECT l1, c1, pm.module_code, mgr, CASE WHEN lm.client_side THEN 'Hotel Contact' END
    FROM plan_modules pm JOIN launch_modules lm ON lm.code = pm.module_code
    WHERE pm.plan_id = (SELECT plan_id FROM client_launches WHERE id = l1);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM activate_client_launch(l1);

    -- 137 active canonical tasks minus the 4 landing-page tasks (addon not purchased)
    SELECT count(*) INTO n FROM client_tasks WHERE launch_id = l1;
    total := total+1; IF n = 133 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start launch task count %', n; END IF;
    SELECT count(*) INTO n FROM client_tasks WHERE launch_id = l1 AND module_code IN ('WA','VRD');
    total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start launch has WA/VRD %', n; END IF;
    SELECT count(*) INTO n FROM client_tasks WHERE launch_id = l1 AND module_code = 'GAD';
    total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start launch has Google Ads tasks %', n; END IF;
    SELECT count(*) INTO n FROM client_tasks WHERE launch_id = l1 AND phase_code IS NULL;
    total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start launch missing phase %', n; END IF;
    SELECT count(*) INTO n FROM client_tasks t JOIN checklist_templates ct ON ct.id = t.template_id
    WHERE t.launch_id = l1 AND ct.superseded_by IS NOT NULL;
    total := total+1; IF n = 0 THEN passed := passed+1; ELSE RAISE NOTICE 'FAIL start launch superseded templates %', n; END IF;
    EXECUTE 'RESET ROLE';
  END;

  IF passed < total THEN
    RAISE EXCEPTION 'LAUNCH PHASE TESTS FAILED: %/%', passed, total;
  END IF;
  RAISE EXCEPTION 'LAUNCH PHASE TESTS PASSED: %/%', passed, total;
END $$;
