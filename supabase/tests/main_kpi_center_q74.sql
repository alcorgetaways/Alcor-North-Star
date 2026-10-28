-- Main display only; isolated owners/staff, fixtures roll back on PASS.
DO $$
DECLARE u uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); cid uuid; other_cid uuid; g uuid; ads uuid; cc uuid; ota uuid; cp uuid; other_cp uuid; ads_cp uuid; cc_cp uuid; ota_cp uuid; v numeric; n int:=0; count_n int;
BEGIN
 SELECT id INTO g FROM pipelines WHERE code='gbp'; SELECT id INTO ads FROM pipelines WHERE code='performance_marketing'; SELECT id INTO cc FROM pipelines WHERE code='corporate_comms'; SELECT id INTO ota FROM pipelines WHERE code='ota';
 INSERT INTO clients(hotel_name,is_test) VALUES('Q74 own fixture',true) RETURNING id INTO cid;
 INSERT INTO clients(hotel_name,is_test) VALUES('Q74 other fixture',true) RETURNING id INTO other_cid;
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at) VALUES(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa74owner@example.invalid','{}',now(),now()),(staff,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa74staff@example.invalid','{}',now(),now());
 INSERT INTO profiles(id,full_name,status,client_id) VALUES(u,'Q74 owner','active',cid),(staff,'Q74 staff','active',null) ON CONFLICT(id) DO UPDATE SET status='active',client_id=EXCLUDED.client_id;
 INSERT INTO user_roles(user_id,role) VALUES(u,'client'),(staff,'team_member') ON CONFLICT DO NOTHING;
 INSERT INTO client_pipelines(client_id,pipeline_id,status) VALUES(cid,g,'active') RETURNING id INTO cp;
 INSERT INTO client_pipelines(client_id,pipeline_id,status) VALUES(other_cid,g,'active') RETURNING id INTO other_cp;
 INSERT INTO client_pipelines(client_id,pipeline_id,status) VALUES(cid,ads,'active') RETURNING id INTO ads_cp;
 INSERT INTO client_pipelines(client_id,pipeline_id,status) VALUES(cid,cc,'active') RETURNING id INTO cc_cp;
 INSERT INTO client_pipelines(client_id,pipeline_id,status) VALUES(cid,ota,'active') RETURNING id INTO ota_cp;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',(SELECT user_id FROM user_roles WHERE role='admin' LIMIT 1),'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM user_roles WHERE role='admin' LIMIT 1),true);
 INSERT INTO gbp_kpi_entries(client_id,client_pipeline_id,month,calls,status) VALUES(cid,cp,'2024-01-01',123,'draft'),(cid,cp,'2024-02-01',7,'approved');
 INSERT INTO weekly_kpi_entries(client_id,client_pipeline_id,week_start,channel,ad_spend,leads,campaigns_live) VALUES(cid,ads_cp,'2024-01-01','google',70,7,3);
 IF has_function_privilege('anon','main_kpi_values(uuid,date)','EXECUTE') THEN RAISE EXCEPTION 'anon main access'; END IF;n:=n+1;
 IF (SELECT count(*) FROM kpi_definitions WHERE pipeline_id=g AND is_main)<>6 THEN RAISE EXCEPTION 'GBP main order count';END IF;n:=n+1;
 IF EXISTS(SELECT 1 FROM kpi_definitions WHERE source_key IN('gbp.chat_clicks','gbp.booking_clicks','auto.cc.assigned') AND counts_toward_score) THEN RAISE EXCEPTION 'new definitions altered score';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',u::text,true);SET LOCAL ROLE authenticated;
 SELECT value INTO v FROM main_kpi_values(cp,'2024-01-01') WHERE main_position=2;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'owner draft GBP leak %',v;END IF;n:=n+1;
 SELECT value INTO v FROM main_kpi_values(cp,'2024-02-01') WHERE main_position=2;
 IF v IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'owner approved GBP lost %',v;END IF;n:=n+1;
 IF EXISTS(SELECT 1 FROM main_kpi_values(other_cp,'2024-01-01')) THEN RAISE EXCEPTION 'owner cross-hotel main leak';END IF;n:=n+1;
 SELECT value INTO v FROM main_kpi_values(ads_cp,'2024-01-01') WHERE main_position=1;
 IF v IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'owner existing Ads narrowed %',v;END IF;n:=n+1;
 SELECT value INTO v FROM main_kpi_values(ota_cp,'2024-01-01') WHERE main_position=10;
 IF v IS NOT NULL THEN RAISE EXCEPTION 'YoY invented prior year';END IF;n:=n+1;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',staff::text,true);SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT 1 FROM main_kpi_values(cp,'2024-01-01')) THEN RAISE EXCEPTION 'unassigned staff main leak';END IF;n:=n+1;
 RESET ROLE;SET LOCAL ROLE service_role;
 INSERT INTO client_staff_assignments(client_id,pipeline_id,user_id,role,source) VALUES(cid,g,staff,'team_member','manual');
 SET LOCAL ROLE authenticated;
 SELECT value INTO v FROM main_kpi_values(cp,'2024-01-01') WHERE main_position=2;
 IF v IS DISTINCT FROM 123 THEN RAISE EXCEPTION 'assigned staff draft missing %',v;END IF;n:=n+1;
 RESET ROLE; SET LOCAL ROLE service_role;
 -- Exact Corp Comms count for a known hotel/month, no typed manual count.
 INSERT INTO client_staff_assignments(client_id,pipeline_id,user_id,role,source) VALUES(cid,cc,staff,'team_member','manual');
 SET LOCAL ROLE authenticated;
 SELECT value INTO v FROM main_kpi_values(cc_cp,'2024-01-01') WHERE main_position=1;
 SELECT count(*) INTO count_n FROM client_tasks WHERE client_id=cid AND pipeline_code='corporate_comms' AND due_date>='2024-01-01' AND due_date<'2024-02-01';
 IF v IS DISTINCT FROM count_n::numeric THEN RAISE EXCEPTION 'Corp counts mismatch % vs %',v,count_n;END IF;n:=n+1;
 RAISE EXCEPTION 'PASS main_kpi_center_q74 % assertions',n;
END $$;