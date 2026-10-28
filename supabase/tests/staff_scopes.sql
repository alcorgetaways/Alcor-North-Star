-- Staff scope checks for the Prompt 5 import (real users, read-only, rollback-safe).
-- Success = raised error text "STAFF SCOPE TESTS PASSED: n/n".
DO $$
DECLARE
  nisha uuid; arvind uuid; amit uuid; sushma uuid; neha uuid;
  n int; passed int := 0; total int := 0; fails text := '';
  ok boolean; j jsonb;
  pid record;
BEGIN
  SELECT id INTO nisha FROM profiles WHERE email='marketing@alcorgetaways.com';
  SELECT id INTO arvind FROM profiles WHERE email='alcorgetaways.leadforms@gmail.com';
  SELECT id INTO amit FROM profiles WHERE email='accounts@alcorgetaways.com';
  SELECT id INTO sushma FROM profiles WHERE email='hr@alcorgetaways.com';
  SELECT id INTO neha FROM profiles WHERE email='neha@alcorgetaways.com';

  -- Nisha: head of influencer, team member (not head) of gbp and website_seo
  total := total + 1;
  IF is_pipeline_head(nisha, (SELECT id FROM pipelines WHERE code='influencer'))
     AND NOT is_pipeline_head(nisha, (SELECT id FROM pipelines WHERE code='gbp'))
     AND is_pipeline_member(nisha, (SELECT id FROM pipelines WHERE code='gbp'))
     AND NOT is_pipeline_head(nisha, (SELECT id FROM pipelines WHERE code='website_seo'))
     AND is_pipeline_member(nisha, (SELECT id FROM pipelines WHERE code='website_seo'))
  THEN passed := passed + 1; ELSE fails := fails || ' nisha'; END IF;

  -- Arvind: member of exactly social_media, performance_marketing, corporate_comms
  total := total + 1;
  SELECT count(*) INTO n FROM pipelines p
  WHERE is_pipeline_member(arvind, p.id)
    AND p.code NOT IN ('social_media','performance_marketing','corporate_comms');
  IF n = 0
     AND is_pipeline_member(arvind, (SELECT id FROM pipelines WHERE code='social_media'))
     AND is_pipeline_member(arvind, (SELECT id FROM pipelines WHERE code='performance_marketing'))
     AND is_pipeline_member(arvind, (SELECT id FROM pipelines WHERE code='corporate_comms'))
  THEN passed := passed + 1; ELSE fails := fails || ' arvind'; END IF;

  -- Amit (finance): commercials yes, credentials no
  total := total + 1;
  IF can_view_commercials(amit) THEN passed := passed + 1; ELSE fails := fails || ' amit-commercials'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', amit, 'role','authenticated')::text, true);
  total := total + 1;
  SELECT count(*) INTO n FROM client_credentials;
  IF n = 0 THEN passed := passed + 1; ELSE fails := fails || ' amit-credentials(' || n || ')'; END IF;

  -- Sushma (hr): no commercials, no credentials, can read staff scorecards
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sushma, 'role','authenticated')::text, true);
  total := total + 1;
  IF NOT can_view_commercials(sushma) THEN passed := passed + 1; ELSE fails := fails || ' sushma-commercials'; END IF;
  total := total + 1;
  SELECT count(*) INTO n FROM client_credentials;
  IF n = 0 THEN passed := passed + 1; ELSE fails := fails || ' sushma-credentials(' || n || ')'; END IF;
  total := total + 1;
  SELECT count(*) INTO n FROM team_scorecard(date_trunc('month', current_date)::date);
  IF n > 0 THEN passed := passed + 1; ELSE fails := fails || ' sushma-scorecard(0)'; END IF;

  -- Neha: flag on, joined_on + sheet status stored
  total := total + 1;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = neha AND must_change_password
             AND joined_on = date '2026-10-12' AND source_sheet_status = 'Pending creation')
  THEN passed := passed + 1; ELSE fails := fails || ' neha'; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF passed = total THEN
    RAISE EXCEPTION 'STAFF SCOPE TESTS PASSED: %/%', passed, total;
  ELSE
    RAISE EXCEPTION 'STAFF SCOPE TESTS FAILED: %/% passed; failures:%', passed, total, fails;
  END IF;
END $$;
