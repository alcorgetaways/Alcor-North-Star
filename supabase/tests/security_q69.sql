-- Q69 security: function grants, caller checks, active-only role helpers, notification insert limits.
-- Always aborts (nothing is kept). Success = "Q69 PASSED n/n".
DO $$
DECLARE
  pass int := 0; total int := 0; fails text := '';
  f text; ok boolean; n int; v numeric; j jsonb;
  tm uuid; owner uuid; owner_client uuid; other_cp uuid; own_cp uuid; stranger uuid; mgr uuid; adm uuid;
BEGIN
  -- 1. anon cannot execute the flagged functions (setup_required may stay: boolean only)
  FOREACH f IN ARRAY ARRAY['public.generate_staff_duties(date)','public.recalc_client_assignments(uuid,boolean)',
    'public.update_recurring_task(uuid,text,date,text,uuid,uuid,text)','public.gbp_profile_names()','public.scorecard_band(numeric)',
    'public._rd_stats(uuid,date,date)','public.rd_booked(uuid,date,date)','public.rd_associates()',
    'public.kpi_prev_actual(uuid,uuid,date)','public.kpi_target_state(uuid,uuid,date)',
    'public._rd_stats_core(uuid,date,date)','public._rd_booked_core(uuid,date,date)','public._rd_associates_core()',
    'public._kpi_prev_actual_core(uuid,uuid,date)','public._kpi_target_state_core(uuid,uuid,date)'] LOOP
    total := total + 1;
    IF NOT has_function_privilege('anon', f::regprocedure, 'execute') THEN pass := pass + 1; ELSE fails := fails || ' anon:' || f; END IF;
  END LOOP;
  total := total + 1;
  IF NOT has_function_privilege('authenticated', 'public.recalc_client_assignments(uuid,boolean)'::regprocedure, 'execute')
     AND has_function_privilege('service_role', 'public.recalc_client_assignments(uuid,boolean)'::regprocedure, 'execute')
  THEN pass := pass + 1; ELSE fails := fails || ' recalc_grants'; END IF;
  total := total + 1;
  IF pg_get_function_result('public.setup_required()'::regprocedure) = 'boolean' THEN pass := pass + 1; ELSE fails := fails || ' setup_required_shape'; END IF;

  -- people
  SELECT p.id INTO tm FROM profiles p JOIN user_roles r ON r.user_id = p.id AND r.role = 'team_member'
   WHERE p.status = 'active' AND NOT EXISTS (SELECT 1 FROM pipeline_members pm WHERE pm.user_id = p.id AND pm.role = 'head' AND pm.active)
     AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = p.id AND x.role IN ('admin','management','bd_manager'))
     AND NOT is_res_desk_head(p.id)
   ORDER BY p.email LIMIT 1;
  SELECT id, client_id INTO owner, owner_client FROM profiles WHERE email = 'yadusjawai@gmail.com';
  SELECT id INTO own_cp FROM client_pipelines WHERE client_id = owner_client LIMIT 1;
  SELECT cp.id INTO other_cp FROM client_pipelines cp WHERE cp.client_id <> owner_client LIMIT 1;
  SELECT p.id INTO mgr FROM profiles p JOIN user_roles r ON r.user_id = p.id AND r.role = 'management' LIMIT 1;
  SELECT p.id INTO adm FROM profiles p JOIN user_roles r ON r.user_id = p.id AND r.role = 'admin' LIMIT 1;
  SELECT p.id INTO stranger FROM profiles p JOIN user_roles r ON r.user_id = p.id AND r.role = 'client'
   WHERE p.id <> owner AND NOT EXISTS (SELECT 1 FROM client_staff_assignments a WHERE a.user_id = tm AND a.client_id = p.client_id)
   LIMIT 1;
  total := total + 1;
  IF tm IS NOT NULL AND owner IS NOT NULL AND other_cp IS NOT NULL AND stranger IS NOT NULL AND mgr IS NOT NULL
  THEN pass := pass + 1; ELSE fails := fails || ' fixtures'; END IF;

  -- 2. backend caller (pg_cron context: no JWT) still runs generate_staff_duties
  total := total + 1;
  BEGIN
    PERFORM public.generate_staff_duties();
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fails := fails || ' cron_generate:' || SQLERRM; END;

  -- 3. authenticated non-manager team member
  PERFORM set_config('request.jwt.claims', json_build_object('sub', tm, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', tm::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total + 1;
  BEGIN PERFORM public.generate_staff_duties(); fails := fails || ' tm_generate_allowed';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN PERFORM public.recalc_client_assignments(owner_client, true); fails := fails || ' tm_recalc_allowed';
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN PERFORM public.rd_booked(mgr, '2026-01-01', '2027-01-01'); fails := fails || ' tm_rd_other_allowed';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  -- notifications: self ok; unrelated hotel owner refused; external link refused
  total := total + 1;
  BEGIN INSERT INTO notifications (user_id, title, body, link, kind) VALUES (tm, 'q69', 'q69', '/my-tasks', 'task'); pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fails := fails || ' notif_self:' || SQLERRM; END;
  total := total + 1;
  BEGIN INSERT INTO notifications (user_id, title, body, link, kind) VALUES (stranger, 'q69', 'q69', '/my-growth', 'task'); fails := fails || ' notif_stranger_allowed';
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN INSERT INTO notifications (user_id, title, body, link, kind) VALUES (tm, 'q69', 'q69', 'https://evil.example', 'task'); fails := fails || ' notif_external_link';
  EXCEPTION WHEN check_violation THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN INSERT INTO notifications (user_id, title, body, link, kind) VALUES (tm, 'q69', 'q69', '//evil.example', 'task'); fails := fails || ' notif_protocol_relative';
  EXCEPTION WHEN check_violation THEN pass := pass + 1; END;
  EXECUTE 'RESET ROLE';

  -- 4. hotel owner: nothing from rd_*, nothing from other hotels' kpi_*
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total + 1;
  BEGIN PERFORM public.rd_booked(owner, '2026-01-01', '2027-01-01'); fails := fails || ' owner_rd_booked';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN PERFORM public._rd_stats(mgr, '2026-01-01', '2027-01-01'); fails := fails || ' owner_rd_stats';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  total := total + 1;
  SELECT count(*) INTO n FROM public.rd_associates();
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || ' owner_rd_associates=' || n; END IF;
  total := total + 1;
  BEGIN PERFORM public.kpi_prev_actual(other_cp, (SELECT id FROM kpi_definitions LIMIT 1), '2026-10-01'); fails := fails || ' owner_kpi_other';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN PERFORM public.kpi_target_state(other_cp, (SELECT id FROM kpi_definitions LIMIT 1), '2026-10-01'); fails := fails || ' owner_target_other';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  total := total + 1;
  IF own_cp IS NULL THEN pass := pass + 1;
  ELSE
    -- own hotel: only values from approved reports (never fetched/unapproved)
    SELECT public.kpi_prev_actual(own_cp, k.id, '2026-10-01') INTO v FROM client_pipelines cp JOIN kpi_definitions k ON k.pipeline_id = cp.pipeline_id
     WHERE cp.id = own_cp AND NOT EXISTS (SELECT 1 FROM monthly_reports r WHERE r.client_pipeline_id = own_cp AND r.month = '2026-09-01' AND r.status = 'approved') LIMIT 1;
    IF v IS NULL THEN pass := pass + 1; ELSE fails := fails || ' owner_unapproved_value'; END IF;
  END IF;
  total := total + 1;
  BEGIN PERFORM public.generate_staff_duties(); fails := fails || ' owner_generate_allowed';
  EXCEPTION WHEN OTHERS THEN pass := pass + 1; END;
  total := total + 1;
  BEGIN INSERT INTO notifications (user_id, title, body, link, kind) VALUES (owner, 'q69', 'q69', '/my-growth', 'task'); fails := fails || ' owner_notif_insert';
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1; END;
  EXECUTE 'RESET ROLE';

  -- 5. management keeps rd/kpi access; inactive profile loses role helpers
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', mgr::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total + 1;
  BEGIN
    j := public._rd_stats(tm, '2026-01-01', '2027-01-01');
    PERFORM public.kpi_target_state(other_cp, (SELECT k.id FROM client_pipelines cp JOIN kpi_definitions k ON k.pipeline_id = cp.pipeline_id WHERE cp.id = other_cp LIMIT 1), '2026-10-01');
    pass := pass + 1;
  EXCEPTION WHEN OTHERS THEN fails := fails || ' mgr_access:' || SQLERRM; END;
  EXECUTE 'RESET ROLE';
  total := total + 1;
  UPDATE profiles SET status = 'inactive' WHERE id = mgr;
  IF NOT is_manager(mgr) AND NOT has_role(mgr, 'management') THEN pass := pass + 1; ELSE fails := fails || ' inactive_still_manager'; END IF;

  RAISE EXCEPTION 'Q69 %', CASE WHEN fails = '' THEN 'PASSED ' || pass || '/' || total ELSE 'FAILED ' || pass || '/' || total || ':' || fails END;
END $$;
