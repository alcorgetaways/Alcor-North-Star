-- Q8/Q32/Q34, regression default and influencer approval. Always rollback.
DO $$
DECLARE a uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); own uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); l uuid; v uuid; scale uuid; custom_id uuid:=gen_random_uuid(); pid uuid; t uuid:=gen_random_uuid(); tid uuid; ip uuid; j jsonb; n int; pass int:=0;
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at) VALUES
 (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q8-admin@test.local','{}',now(),now()),
 (h,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q8-head@test.local','{}',now(),now()),
 (own,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q8-owner@test.local','{}',now(),now()),
 (other_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q8-other@test.local','{}',now(),now());
 UPDATE profiles SET status='active',must_change_password=false WHERE id IN(a,h,own,other_owner);
 DELETE FROM user_roles WHERE user_id IN(a,h,own,other_owner);
 INSERT INTO user_roles(user_id,role) VALUES(a,'admin'),(h,'pipeline_manager'),(own,'client'),(other_owner,'client');
 SELECT pv.id INTO v FROM plan_versions pv JOIN plans p ON p.id=pv.plan_id WHERE p.code='diamond_start' AND pv.status='active' ORDER BY version DESC LIMIT 1;
 SELECT pv.id INTO scale FROM plan_versions pv JOIN plans p ON p.id=pv.plan_id WHERE p.code='diamond_scale' AND pv.status='active' ORDER BY version DESC LIMIT 1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 j:=who_pays(v); IF (j->>'tools_included')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Diamond Start tools not add-on'; END IF;pass:=pass+1;
 j:=who_pays(scale); IF (j->>'tools_included')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Diamond Scale tools not included'; END IF;pass:=pass+1;
 INSERT INTO custom_plans(id,base_plan_version_id,name,created_by) VALUES(custom_id,scale,'Q8 legacy eligibility unknown',a);
 j:=who_pays(NULL,custom_id);IF (j->>'tools_included')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Guessed legacy custom eligibility';END IF;pass:=pass+1;
 PERFORM set_plan_tools(custom_id,true,true);j:=who_pays(NULL,custom_id);IF (j->>'tools_included')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Admin eligibility not applied';END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',h,'role','authenticated')::text,true);
 BEGIN PERFORM set_plan_tools(v,false,true);RAISE EXCEPTION 'Non-admin tools edit allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Admin only' THEN RAISE;END IF;END;pass:=pass+1;
 BEGIN INSERT INTO custom_plans(base_plan_version_id,name,created_by,includes_reservations_sales_tools) VALUES(v,'Q8 insert bypass',h,true);RAISE EXCEPTION 'Non-admin inserted included tools';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Only admin can change reservations and sales tools inclusion' THEN RAISE;END IF;END;pass:=pass+1;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claims','{}',true);
 INSERT INTO clients(id,hotel_name) VALUES(c,'Q8 rollback hotel');
 IF (SELECT account_manager_id FROM clients WHERE id=c) IS DISTINCT FROM (SELECT id FROM profiles WHERE email='shalini@alcorgetaways.com') THEN RAISE EXCEPTION 'New-client AM regression';END IF;pass:=pass+1;
 UPDATE profiles SET client_id=c WHERE id=own;
 INSERT INTO client_launches(client_id,plan_id,status,plan_version_id) SELECT c,plan_id,'active',scale FROM plan_versions WHERE id=scale RETURNING id INTO l;
 SELECT id INTO pid FROM pipelines WHERE code='influencer';
 INSERT INTO pipeline_members(pipeline_id,user_id,role) VALUES(pid,h,'head');
 INSERT INTO client_staff_assignments(client_id,pipeline_id,user_id,role,source) VALUES(c,pid,h,'head','manual') ON CONFLICT DO NOTHING;
 SELECT id INTO ip FROM influencer_programs WHERE launch_id=l;
 IF ip IS NULL THEN RAISE EXCEPTION 'Eligible launch missing contract task';END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',h,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM save_influencer_program(ip,NULL,'[{"months":3,"influencers":"Barter A","visits":1},{"months":6,"influencers":"Barter B","visits":2},{"months":12,"influencers":"Barter C","visits":3}]');RAISE EXCEPTION 'Goals before approval allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Owner must approve the contract before goals are set' THEN RAISE;END IF;END;pass:=pass+1;
 PERFORM save_influencer_program(ip,'https://example.org/contract.pdf');
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other_owner,'role','authenticated')::text,true);
 BEGIN PERFORM decide_influencer_program(ip,true);RAISE EXCEPTION 'Other owner approved';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Only this hotel owner can approve' THEN RAISE;END IF;END;pass:=pass+1;
 SELECT count(*) INTO n FROM influencer_programs WHERE id=ip;IF n<>0 THEN RAISE EXCEPTION 'Other owner sees contract';END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',own,'role','authenticated')::text,true);PERFORM decide_influencer_program(ip,true);pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',h,'role','authenticated')::text,true);
 PERFORM save_influencer_program(ip,NULL,'[{"months":3,"influencers":"Barter A","visits":1},{"months":6,"influencers":"Barter B","visits":2},{"months":12,"influencers":"Barter C","visits":3}]');pass:=pass+1;
 BEGIN PERFORM save_influencer_program(ip,'https://example.org/replacement.pdf');RAISE EXCEPTION 'Approved contract overwritten';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Approved contract is preserved; create a new launch program for a new contract' THEN RAISE;END IF;END;pass:=pass+1;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claims','{}',true);
 IF (SELECT count(*) FROM checklist_templates WHERE gate_code='gate_d' AND evidence_required)<>12 THEN RAISE EXCEPTION 'Twelve Gate D templates required';END IF;pass:=pass+1;
 IF (SELECT count(*) FROM checklist_templates WHERE module_code='BD' AND pipeline_code='business_development')<>30 THEN RAISE EXCEPTION 'Thirty BD templates mapping';END IF;pass:=pass+1;
 IF EXISTS(SELECT 1 FROM client_tasks WHERE module_code='BD' AND pipeline_code IS NULL) THEN RAISE EXCEPTION 'BD historical NULL mapping';END IF;pass:=pass+1;
 SELECT id INTO tid FROM checklist_templates WHERE gate_code='gate_d' AND superseded_by IS NULL LIMIT 1;
 INSERT INTO client_tasks(id,launch_id,client_id,template_id,module_code,code,name,week_start,week_due,due_date,status,requires_client_approval,phase)
 VALUES(t,l,c,tid,'AM','Q34.TEST','Q34 evidence fixture',0,0,CURRENT_DATE,'not_started',false,'onboarding');
 BEGIN UPDATE client_tasks SET status='done' WHERE id=t;RAISE EXCEPTION 'Done without evidence allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Gate D task needs an evidence link or uploaded file before it can be marked Done' THEN RAISE;END IF;END;pass:=pass+1;
 BEGIN INSERT INTO client_tasks(launch_id,client_id,template_id,module_code,code,name,week_start,week_due,due_date,status,requires_client_approval,phase) VALUES(l,c,tid,'AM','Q34.INSERT','Q34 insert evidence',0,0,CURRENT_DATE,'done',false,'onboarding');RAISE EXCEPTION 'Inserted Done without evidence';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Gate D task needs an evidence link or uploaded file before it can be marked Done' THEN RAISE;END IF;END;pass:=pass+1;
 UPDATE client_tasks SET evidence_url='https://example.org/evidence.pdf',status='done' WHERE id=t;IF (SELECT status FROM client_tasks WHERE id=t)<>'done' THEN RAISE EXCEPTION 'Evidence completion blocked';END IF;pass:=pass+1;
 UPDATE client_tasks SET notes='Already Done preserved' WHERE id=t;IF (SELECT status FROM client_tasks WHERE id=t)<>'done' THEN RAISE EXCEPTION 'Existing Done touched';END IF;pass:=pass+1;
 IF has_function_privilege('anon','public.who_pays(uuid,uuid,uuid,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.influencer_programs','UPDATE') THEN RAISE EXCEPTION 'Public or direct write bypass';END IF;pass:=pass+1;
 RAISE EXCEPTION 'Q8 Q34 TESTS PASSED: %/22',pass;
END $$;