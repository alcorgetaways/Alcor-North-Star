-- Commission / commercial-terms tests (Prompt: commission + pipelines). Impersonates real staff.
-- Always aborts at the end so nothing is kept. Success = error text "COMMERCIAL TESTS PASSED: n/n".
DO $$
DECLARE
  shalini uuid; mohnish uuid; arvind uuid; amit uuid;
  yadus uuid; season uuid; simcha uuid; yadus_launch uuid; season_launch uuid;
  j jsonb; r jsonb; n int; v numeric; passed int := 0; total int := 0; fails text := '';
  ret_before numeric; mrr_before numeric;
BEGIN
  SELECT id INTO shalini FROM profiles WHERE email='shalini@alcorgetaways.com';
  SELECT id INTO mohnish FROM profiles WHERE email='mohnish@group2001.in';
  SELECT id INTO arvind FROM profiles WHERE email='alcorgetaways.leadforms@gmail.com';
  SELECT p.id INTO amit FROM profiles p JOIN user_roles r ON r.user_id=p.id AND r.role='finance' LIMIT 1;
  SELECT id INTO yadus FROM clients WHERE hotel_name LIKE 'Yadus Jawai%';
  SELECT id INTO season FROM clients WHERE hotel_name='Season Jawai';
  SELECT id INTO simcha FROM clients WHERE hotel_name LIKE 'Simcha Island%';
  SELECT id INTO yadus_launch FROM client_launches WHERE client_id=yadus AND status IN ('active','live');
  -- Edit tests use Melody Moon (commission still Not specified after the 23 Oct decisions).
  SELECT l.id, l.retainer_inr INTO season_launch, ret_before FROM client_launches l JOIN clients c ON c.id=l.client_id
   WHERE c.hotel_name='Melody Moon Resort' AND l.status IN ('active','live');

  -- 1. Confirmed commissions (Yadus weddings 11% approved 23 Oct); everything else NULL ("Not specified")
  total := total+1;
  IF (SELECT (commission_direct_pct, commission_ota_pct, commission_weddings_pct) = (11::numeric, 10::numeric, 11::numeric) FROM client_launches WHERE id=yadus_launch)
     AND (SELECT (commission_direct_pct, commission_ota_pct, commission_weddings_pct) = (20::numeric, 0::numeric, 10::numeric)
            FROM client_launches WHERE client_id=simcha AND status IN ('active','live'))
     AND (SELECT commission_ota_pct IS NULL FROM client_launches WHERE id=season_launch)
     AND (SELECT commission_ota_pct = 10 AND commission_direct_pct IS NULL AND commission_weddings_pct IS NULL
            FROM client_launches WHERE client_id=season AND status IN ('active','live'))
  THEN passed := passed+1; ELSE fails := fails || ' confirmed commissions;'; END IF;

  -- 2. Every active client has client_pipelines exactly matching its services
  total := total+1;
  SELECT count(*) INTO n FROM client_launches l JOIN clients c ON c.id=l.client_id
   WHERE l.status IN ('active','live') AND (
     SELECT coalesce(array_agg(DISTINCT p.code ORDER BY p.code), '{}') FROM client_pipelines x JOIN pipelines p ON p.id=x.pipeline_id
      WHERE x.client_id=c.id AND x.status <> 'ended')
     IS DISTINCT FROM (
     SELECT coalesce(array_agg(DISTINCT code ORDER BY code), '{}') FROM (
       SELECT s.pipeline_code code FROM custom_plan_services s WHERE l.custom_plan_id IS NOT NULL AND s.custom_plan_id=l.custom_plan_id AND s.included
       UNION SELECT s.pipeline_code FROM plan_services s WHERE l.custom_plan_id IS NULL AND s.plan_version_id=l.plan_version_id AND s.included) q);
  IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' client_pipelines mismatch on ' || n || ';'; END IF;

  -- 3. Yadus Jawai Pipelines tab lists 9 pipelines (all Diamond Scale services)
  total := total+1;
  SELECT count(*) INTO n FROM client_pipelines WHERE client_id=yadus AND status <> 'ended';
  IF n = 9 THEN passed := passed+1; ELSE fails := fails || ' yadus pipelines=' || n || ';'; END IF;

  -- 4. Shalini (BD): client page, dashboard list and Finance read the same commission
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', shalini, 'role','authenticated')::text, true);
  total := total+1;
  j := public.client_commercials(yadus);
  SELECT x INTO r FROM jsonb_array_elements(public.commercial_terms_list()) x WHERE x->>'client_id' = yadus::text;
  SELECT l INTO j FROM jsonb_array_elements(public.finance_overview()->'clients') c, jsonb_array_elements(c->'launches') l
   WHERE l->>'id' = yadus_launch::text;
  IF (public.client_commercials(yadus)->'launch'->>'commission_direct_pct') = '11'
     AND r->>'commission_direct_pct' = '11' AND j->>'commission_direct_pct' = '11'
     AND (public.client_commercials(yadus)->'launch'->>'commission_weddings_pct') = '11'
     AND r->>'commission_weddings_pct' = '11' AND j->>'commission_weddings_pct' = '11'
  THEN passed := passed+1; ELSE fails := fails || ' screens disagree;'; END IF;

  -- 5. Flags: Season's are resolved (23 Oct decisions); Yadus still shows its open contract flag
  total := total+1;
  SELECT count(*) INTO n FROM jsonb_array_elements(public.client_commercials(season)->'review_items') x;
  SELECT n + 10 * count(*) INTO n FROM jsonb_array_elements(public.client_commercials(yadus)->'review_items') x
   WHERE x->>'message' = 'No contract file.';
  IF n = 10 THEN passed := passed+1; ELSE fails := fails || ' season flags=' || n || ';'; END IF;

  -- 6. BD edit goes to pending; launch value unchanged until approval
  total := total+1;
  r := public.request_terms_change(season_launch, '{"commission_ota_pct": 10}'::jsonb, 'test');
  EXECUTE 'RESET ROLE';
  IF r->>'status' = 'pending' AND (SELECT commission_ota_pct IS NULL FROM client_launches WHERE id=season_launch)
  THEN passed := passed+1; ELSE fails := fails || ' bd not pending;'; END IF;

  -- 7. BD cannot approve
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total+1;
  BEGIN
    PERFORM public.decide_terms_change((r->>'id')::uuid, true, NULL);
    fails := fails || ' bd approved own change;';
  EXCEPTION WHEN others THEN passed := passed+1;
  END;

  -- 8. Management approves → applied on launch and custom plan; old terms kept in history
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mohnish, 'role','authenticated')::text, true);
  total := total+1;
  PERFORM public.decide_terms_change((r->>'id')::uuid, true, 'ok');
  EXECUTE 'RESET ROLE';
  IF (SELECT commission_ota_pct FROM client_launches WHERE id=season_launch) = 10
     AND (SELECT cp.commission_ota_pct FROM custom_plans cp JOIN client_launches l ON l.custom_plan_id=cp.id WHERE l.id=season_launch) = 10
     AND (SELECT old_terms->'commission_ota_pct' FROM commercial_term_changes WHERE id=(r->>'id')::uuid) = 'null'::jsonb
     AND (SELECT approval_status FROM custom_plans cp JOIN client_launches l ON l.custom_plan_id=cp.id WHERE l.id=season_launch) = 'approved'
  THEN passed := passed+1; ELSE fails := fails || ' mgmt approval not applied;'; END IF;

  -- 9. Management edit applies directly; setting blank returns to Not specified
  total := total+1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.request_terms_change(season_launch, '{"commission_ota_pct": null}'::jsonb, 'test');
  EXECUTE 'RESET ROLE';
  IF r->>'status' = 'applied' AND (SELECT commission_ota_pct IS NULL FROM client_launches WHERE id=season_launch)
  THEN passed := passed+1; ELSE fails := fails || ' mgmt direct edit;'; END IF;

  -- 10. Retainer untouched by commission edits
  total := total+1;
  IF (SELECT retainer_inr FROM client_launches WHERE id=season_launch) = ret_before THEN passed := passed+1;
  ELSE fails := fails || ' retainer changed;'; END IF;

  -- 11. Finance (read-only) cannot edit terms
  IF amit IS NOT NULL THEN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
    total := total+1;
    BEGIN
      PERFORM public.request_terms_change(season_launch, '{"commission_ota_pct": 5}'::jsonb, NULL);
      fails := fails || ' finance edited;';
    EXCEPTION WHEN others THEN passed := passed+1;
    END;
    EXECUTE 'RESET ROLE';
  END IF;

  -- 12. A team member cannot read commercials or review items
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', arvind, 'role','authenticated')::text, true);
  total := total+1;
  SELECT count(*) INTO n FROM client_review_items;
  BEGIN
    PERFORM public.client_commercials(season);
    fails := fails || ' team member read commercials;';
  EXCEPTION WHEN others THEN
    IF n = 0 THEN passed := passed+1; ELSE fails := fails || ' team member sees review items;'; END IF;
  END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'COMMERCIAL TESTS PASSED: %/% FAILS:%', passed, total, fails;
END $$;
