-- Q57b data-sync backfill rules. Every fixture and action rolls back through the final pass exception.
DO $$
DECLARE admin_id uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); tonny uuid; c uuid:=gen_random_uuid(); cp uuid; pipeline uuid; mapping uuid; n int:=0; v numeric;
BEGIN
 SELECT id INTO tonny FROM profiles WHERE email='tonny.sapra@group2001.in';
 -- 1. Every confirmed mapping is active, stamped, and confirmed by the owner's admin profile.
 IF EXISTS(SELECT 1 FROM kpi_source_mappings WHERE NOT active OR confirmed_at IS NULL OR confirmed_by IS DISTINCT FROM tonny) THEN RAISE EXCEPTION 'Mapping confirmation metadata'; END IF; n:=n+1;
 IF (SELECT count(*) FROM kpi_source_mappings)<>47 OR (SELECT count(*) FROM kpi_source_mappings WHERE source='localo')<>28 OR (SELECT count(*) FROM kpi_source_mappings WHERE source='metricool')<>19 THEN RAISE EXCEPTION 'Mapping counts'; END IF; n:=n+1;
 -- 2. No test-client pipeline is mapped (Yash Residency / Palm Spring excluded).
 IF EXISTS(SELECT 1 FROM kpi_source_mappings m JOIN client_pipelines cp ON cp.id=m.client_pipeline_id JOIN clients c ON c.id=cp.client_id WHERE c.is_test) THEN RAISE EXCEPTION 'Test client mapped'; END IF; n:=n+1;
 -- 3. Every fetched row is labelled, and "before Alcor" exactly matches months before the pipeline start.
 IF EXISTS(SELECT 1 FROM kpi_fetched_values v JOIN client_pipelines cp ON cp.id=v.client_pipeline_id WHERE coalesce(v.raw_data->>'period','') NOT IN ('before_alcor','alcor')) THEN RAISE EXCEPTION 'Missing period label'; END IF; n:=n+1;
 IF EXISTS(SELECT 1 FROM kpi_fetched_values v JOIN client_pipelines cp ON cp.id=v.client_pipeline_id WHERE (v.raw_data->>'period'='before_alcor') <> (v.month < date_trunc('month',cp.start_date)::date)) THEN RAISE EXCEPTION 'Period label mismatch'; END IF; n:=n+1;
 -- 4. Approved "before Alcor" source values never feed KPIs/targets/scorecards.
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at) SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'{}',now(),now() FROM(VALUES(admin_id,'q57b-admin@test.local'),(owner_id,'q57b-owner@test.local'))x(id,email);
 UPDATE profiles SET status='active',must_change_password=false WHERE id IN(admin_id,owner_id);
 DELETE FROM user_roles WHERE user_id IN(admin_id,owner_id);
 INSERT INTO user_roles(user_id,role) VALUES(admin_id,'admin'),(owner_id,'client');
 INSERT INTO clients(id,hotel_name,is_test,is_demo)VALUES(c,'Q57b rollback hotel',true,false); UPDATE profiles SET client_id=c WHERE id=owner_id;
 SELECT id INTO pipeline FROM pipelines WHERE code='gbp';
 INSERT INTO client_pipelines(client_id,pipeline_id,manager_id,status,start_date)VALUES(c,pipeline,admin_id,'active','2026-06-01')RETURNING id INTO cp;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
 mapping:=confirm_kpi_mapping('localo','q57b-test-external','Q57b hotel',cp);
 INSERT INTO kpi_fetched_values(mapping_id,client_pipeline_id,month,source,fetched_values,raw_data,status,confirmed_by,confirmed_at,approved_by,approved_at)VALUES
   (mapping,cp,'2026-05-01','localo','{"views":111}','{"period":"before_alcor"}','approved',admin_id,now(),admin_id,now()),
   (mapping,cp,'2026-06-01','localo','{"views":222}','{"period":"alcor"}','approved',admin_id,now(),admin_id,now());
 v:=kpi_source_value(cp,'2026-05-01','gbp.views');
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Before-Alcor value leaked: %',v; END IF; n:=n+1;
 v:=kpi_source_value(cp,'2026-06-01','gbp.views');
 IF v IS DISTINCT FROM 222 THEN RAISE EXCEPTION 'Alcor-period value missing: %',v; END IF; n:=n+1;
 -- 5. The only read policy on fetched source values is restricted to Management and pipeline managers (clients are excluded).
 IF EXISTS(SELECT 1 FROM pg_policies WHERE tablename='kpi_fetched_values' AND policyname NOT IN ('fetched_read','fetched_read_assigned')) OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='kpi_fetched_values' AND policyname='fetched_read_assigned' AND qual LIKE '%can_read_fetched%') OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='kpi_fetched_values' AND policyname='fetched_read' AND qual LIKE '%is_manager%' AND qual LIKE '%manages_pipeline%') THEN RAISE EXCEPTION 'Fetched-values read policy'; END IF; n:=n+1;
 RAISE EXCEPTION 'Q57B BACKFILL TESTS PASSED: %/8',n;
END $$;
