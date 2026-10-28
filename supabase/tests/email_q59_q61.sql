-- Q59/Q61 queueing rules. Every fixture and action rolls back through the final pass exception.
DO $$
DECLARE
  admin_id uuid:=gen_random_uuid(); head_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid();
  bd_id uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid();
  c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid();
  cp uuid; cp2 uuid; pipeline uuid; pipeline2 uuid; definition uuid; report uuid; n int:=0; r_email text;
BEGIN
  INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'{}',now(),now()
  FROM(VALUES(admin_id,'q59-admin@test.local'),(head_id,'q59-head@test.local'),(member_id,'q59-member@test.local'),(bd_id,'q59-bd@test.local'),(owner_id,'q59-owner-login@test.local'))v(id,email);
  UPDATE profiles SET status='active',must_change_password=false WHERE id IN(admin_id,head_id,member_id,bd_id,owner_id);
  DELETE FROM user_roles WHERE user_id IN(admin_id,head_id,member_id,bd_id,owner_id);
  INSERT INTO user_roles(user_id,role) VALUES(admin_id,'admin'),(head_id,'pipeline_manager'),(member_id,'team_member'),(bd_id,'bd_manager'),(owner_id,'client');
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);

  SELECT id INTO pipeline FROM pipelines WHERE code='social_media';
  SELECT id INTO pipeline2 FROM pipelines WHERE code='business_development';
  INSERT INTO kpi_definitions(pipeline_id,name,kpi_type,direction,active)VALUES(pipeline,'Q59 isolated KPI','number','higher_better',true)RETURNING id INTO definition;

  -- Client A: one pipeline, red score (60/100)
  INSERT INTO clients(id,hotel_name,email,is_test,is_demo)VALUES(c,'Q59 rollback hotel A','q59-owner@test.local',false,false);
  INSERT INTO client_pipelines(client_id,pipeline_id,manager_id,status,start_date)VALUES(c,pipeline,head_id,'active','2026-08-20')RETURNING id INTO cp;
  INSERT INTO client_staff_assignments(client_id,pipeline_id,user_id,role,source)VALUES(c,pipeline,head_id,'head','manual'),(c,pipeline,member_id,'team_member','manual') ON CONFLICT DO NOTHING;
  INSERT INTO client_kpi_targets(client_pipeline_id,kpi_definition_id,month,target,status)VALUES(cp,definition,'2026-09-01',100,'approved');
  INSERT INTO monthly_reports(client_id,client_pipeline_id,month,status)VALUES(c,cp,'2026-09-01','submitted')RETURNING id INTO report;
  UPDATE kpi_entries SET target=100,actual=60,target_status='approved' WHERE report_id=report AND kpi_definition_id=definition;
  UPDATE monthly_reports SET status='approved' WHERE id=report;

  -- 1. Owner report queued once, held, to the owner's registered email
  IF NOT EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c AND kind='owner_monthly_report' AND to_address='q59-owner@test.local' AND held AND dedupe_key='owner_report:'||c||':2026-09-01') THEN RAISE EXCEPTION 'Owner report not queued held';END IF;n:=n+1;
  -- 2. Red alert rows: head + member + bd + two founders, each exactly once, not held
  IF EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c AND kind='red_score_alert' AND held) THEN RAISE EXCEPTION 'Red alert held';END IF;n:=n+1;
  FOREACH r_email IN ARRAY ARRAY['q59-head@test.local','q59-member@test.local','q59-bd@test.local','tonny.sapra@group2001.in','mohnish@group2001.in'] LOOP
    IF (SELECT count(*) FROM client_message_outbox WHERE client_id=c AND kind='red_score_alert' AND to_address=r_email)<>1 THEN RAISE EXCEPTION 'Red alert missing/dup for %',r_email;END IF;
  END LOOP;n:=n+1;

  -- 3. Re-approval does not duplicate either kind
  SELECT count(*) INTO n FROM client_message_outbox WHERE client_id=c AND kind IN('owner_monthly_report','red_score_alert');
  UPDATE monthly_reports SET status='submitted' WHERE id=report;
  UPDATE monthly_reports SET status='approved' WHERE id=report;
  IF (SELECT count(*) FROM client_message_outbox WHERE client_id=c AND kind IN('owner_monthly_report','red_score_alert'))<>n THEN RAISE EXCEPTION 'Dedupe on re-approval';END IF;n:=3;

  -- 4. Green score month: owner report queued, no red alerts
  INSERT INTO client_kpi_targets(client_pipeline_id,kpi_definition_id,month,target,status)VALUES(cp,definition,'2026-10-01',100,'approved');
  INSERT INTO monthly_reports(client_id,client_pipeline_id,month,status)VALUES(c,cp,'2026-10-01','submitted')RETURNING id INTO report;
  UPDATE kpi_entries SET target=100,actual=95,target_status='approved' WHERE report_id=report AND kpi_definition_id=definition;
  UPDATE monthly_reports SET status='approved' WHERE id=report;
  IF NOT EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c AND kind='owner_monthly_report' AND dedupe_key='owner_report:'||c||':2026-10-01') THEN RAISE EXCEPTION 'Green month owner report missing';END IF;n:=n+1;
  IF EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c AND kind='red_score_alert' AND dedupe_key LIKE 'red_alert:'||c||':2026-10-01%') THEN RAISE EXCEPTION 'Green month red alert';END IF;n:=n+1;

  -- 5. Two pipelines: owner report waits until the LAST report is approved
  INSERT INTO clients(id,hotel_name,email,is_test,is_demo)VALUES(c2,'Q59 rollback hotel B','q59-owner-b@test.local',false,false);
  INSERT INTO client_pipelines(client_id,pipeline_id,manager_id,status,start_date)VALUES(c2,pipeline,head_id,'active','2026-08-20')RETURNING id INTO cp;
  INSERT INTO client_pipelines(client_id,pipeline_id,manager_id,status,start_date)VALUES(c2,pipeline2,head_id,'active','2026-08-20')RETURNING id INTO cp2;
  INSERT INTO client_kpi_targets(client_pipeline_id,kpi_definition_id,month,target,status)VALUES(cp,definition,'2026-09-01',100,'approved');
  INSERT INTO monthly_reports(client_id,client_pipeline_id,month,status)VALUES(c2,cp,'2026-09-01','submitted')RETURNING id INTO report;
  UPDATE kpi_entries SET target=100,actual=95,target_status='approved' WHERE report_id=report AND kpi_definition_id=definition;
  INSERT INTO monthly_reports(client_id,client_pipeline_id,month,status)VALUES(c2,cp2,'2026-09-01','submitted')RETURNING id INTO cp2;
  UPDATE monthly_reports SET status='approved' WHERE id=report;
  IF EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c2 AND kind='owner_monthly_report') THEN RAISE EXCEPTION 'Owner report before all approved';END IF;n:=n+1;
  UPDATE monthly_reports SET status='approved' WHERE id=cp2;
  IF NOT EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c2 AND kind='owner_monthly_report' AND to_address='q59-owner-b@test.local' AND held) THEN RAISE EXCEPTION 'Owner report after all approved';END IF;n:=n+1;

  -- 6. Demo clients queue nothing
  INSERT INTO clients(id,hotel_name,email,is_test,is_demo)VALUES(c3,'Q59 demo hotel','q59-owner-c@test.local',false,true);
  INSERT INTO client_pipelines(client_id,pipeline_id,manager_id,status,start_date)VALUES(c3,pipeline,head_id,'active','2026-08-20')RETURNING id INTO cp;
  INSERT INTO client_kpi_targets(client_pipeline_id,kpi_definition_id,month,target,status)VALUES(cp,definition,'2026-09-01',100,'approved');
  INSERT INTO monthly_reports(client_id,client_pipeline_id,month,status)VALUES(c3,cp,'2026-09-01','submitted')RETURNING id INTO report;
  UPDATE kpi_entries SET target=100,actual=10,target_status='approved' WHERE report_id=report AND kpi_definition_id=definition;
  UPDATE monthly_reports SET status='approved' WHERE id=report;
  IF EXISTS(SELECT 1 FROM client_message_outbox WHERE client_id=c3) THEN RAISE EXCEPTION 'Demo client queued email';END IF;n:=n+1;

  -- 7. Owner switch exists and stays off; owner rows are held (worker releases only when on)
  IF (SELECT value FROM app_settings WHERE key='owner_emails_enabled')<>'false'::jsonb THEN RAISE EXCEPTION 'Owner switch not off';END IF;n:=n+1;
  IF EXISTS(SELECT 1 FROM client_message_outbox WHERE kind='owner_monthly_report' AND NOT held) THEN RAISE EXCEPTION 'Owner email not held';END IF;n:=n+1;

  RAISE EXCEPTION 'Q59 Q61 TESTS PASSED: %/10',n;
END $$;
