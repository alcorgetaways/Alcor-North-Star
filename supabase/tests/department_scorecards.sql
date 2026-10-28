-- Q31: fixtures always roll back through the final exception.
DO $$
DECLARE bd uuid; corp uuid; sh uuid; di uuid; ar uuid; ash uuid; hr uuid; mgr uuid; owner_id uuid; kid uuid;
 c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); l uuid; l2 uuid; plan uuid; j jsonb; v numeric; n int; pass int:=0;
BEGIN
 SELECT id INTO bd FROM pipelines WHERE code='business_development'; SELECT id INTO corp FROM pipelines WHERE code='corporate_comms';
 SELECT user_id INTO sh FROM pipeline_members WHERE pipeline_id=bd AND role='head' AND active;
 SELECT user_id INTO di FROM pipeline_members WHERE pipeline_id=corp AND role='head' AND active;
 SELECT id INTO ar FROM profiles WHERE full_name='Arvind Kumar'; SELECT id INTO ash FROM profiles WHERE full_name='Aashish';
 SELECT id INTO hr FROM profiles WHERE email='hr@alcorgetaways.com'; SELECT id INTO mgr FROM profiles WHERE email='mohnish@group2001.in';
 SELECT user_id INTO owner_id FROM user_roles WHERE role='client' LIMIT 1;
 SELECT id INTO plan FROM plans ORDER BY sort_order LIMIT 1;
 IF NOT(has_role(sh,'pipeline_manager') AND has_role(di,'pipeline_manager') AND is_pipeline_head(sh,bd) AND is_pipeline_head(di,corp)) THEN RAISE EXCEPTION 'Q31 heads'; END IF; pass:=pass+1;
 IF NOT(is_pipeline_member(ar,corp) AND is_pipeline_member(ash,corp)) THEN RAISE EXCEPTION 'Q31 members'; END IF; pass:=pass+1;
 IF (SELECT count(*) FROM kpi_definitions WHERE pipeline_id=bd AND active)<>4 THEN RAISE EXCEPTION 'BD four KPIs'; END IF; pass:=pass+1;
 IF (SELECT count(*) FROM kpi_definitions WHERE pipeline_id=corp AND active AND counts_toward_score)<>1 OR (SELECT count(*) FROM kpi_definitions WHERE pipeline_id=corp AND NOT active AND source_key LIKE 'pke.%')<>5 THEN RAISE EXCEPTION 'Corporate preserved sales history'; END IF; pass:=pass+1;
 IF _department_actual(bd,'2098-01-01','dept.new_properties') IS NOT NULL OR _department_actual(bd,'2098-01-01','dept.proposals') IS NOT NULL THEN RAISE EXCEPTION 'Missing auto data'; END IF; pass:=pass+1;
 INSERT INTO clients(id,hotel_name) VALUES(c,'Q31 rollback property'),(c2,'Q31 rollback legacy');
 INSERT INTO client_launches(client_id,plan_id,status,contract_start,retainer_inr) VALUES(c,plan,'active','2098-01-02',25000) RETURNING id INTO l;
 INSERT INTO client_launches(client_id,plan_id,status,contract_start,retainer_inr) VALUES(c2,plan,'closed','2097-01-02',10000) RETURNING id INTO l2;
 INSERT INTO client_launches(client_id,plan_id,status,contract_start,retainer_inr,upgraded_from_launch_id,change_kind) VALUES(c,plan,'closed','2098-01-03',75000,l,'upgrade'),(c2,plan,'active','2098-01-04',45000,l2,'relaunch');
 IF _department_actual(bd,'2098-01-01','dept.new_properties')<>1 THEN RAISE EXCEPTION 'Exclude existing client purchases'; END IF; pass:=pass+1;
 IF _department_actual(bd,'2098-01-01','dept.revenue_signed')<>25000 THEN RAISE EXCEPTION 'Use snapshot revenue'; END IF; pass:=pass+1;
 INSERT INTO documents(client_id,category,doc_type,file_path,generated_proposal,created_at) VALUES(c,'proposal','Q31','test/q31.pdf',true,'2098-01-02'),(c,'proposal','Untracked','test/legacy.pdf',false,'2098-01-03');
 INSERT INTO department_month_entries(pipeline_id,month,outside_proposals,meetings) VALUES(bd,'2098-01-01',3,4);
 IF _department_actual(bd,'2098-01-01','dept.proposals')<>4 THEN RAISE EXCEPTION 'PDF plus outside count'; END IF; pass:=pass+1;
 IF _department_actual(bd,'2098-01-01','dept.meetings')<>4 THEN RAISE EXCEPTION 'Manual meetings'; END IF; pass:=pass+1;
 -- Q43: these historic completed fixtures belong to a signed launch.
 INSERT INTO client_gates(launch_id,client_id,gate_code,gate_name,due_week,due_date,signer_role,rule,status)
 VALUES(l,c,'gate_a','Gate A',0,'2098-01-01','bd_manager','module','signed');
 INSERT INTO client_tasks(launch_id,client_id,module_code,code,name,week_start,week_due,due_date,assignee_id,status,done_at) VALUES
 (l,c,'CRE','Q31-1','Q31 task',0,0,'2098-01-10',ar,'done','2098-01-10 18:00:00+05:30'),
 (l,c,'CRE','Q31-2','Q31 task',0,0,'2098-01-10',ar,'done','2098-01-11 00:01:00+05:30'),
 (l,c,'CRE','Q31-3','Q31 task',0,0,'2098-01-10',ash,'done','2098-01-10 23:59:00+05:30'),
 (l,c,'CRE','Q31-4','Q31 task',0,0,'2098-01-10',di,'not_started',NULL);
 IF _department_actual(corp,'2098-01-01','dept.tasks_on_time')<>50 THEN RAISE EXCEPTION 'Corporate 2 of 4 tasks'; END IF; pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',sh,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 j:=department_scorecards('2098-01-01');
 IF NOT j::text LIKE '%Revenue signed%' THEN RAISE EXCEPTION 'BD own revenue'; END IF; pass:=pass+1;
 SELECT id INTO kid FROM kpi_definitions WHERE pipeline_id=bd AND source_key='dept.meetings';
 BEGIN PERFORM save_department_target(bd,kid,'2098-01-01',5,false); RAISE EXCEPTION 'Baseline allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Baseline month has no target' THEN RAISE; END IF; END; pass:=pass+1;
 PERFORM save_department_target(bd,kid,'2098-02-01',5,false);
 BEGIN PERFORM save_department_target(bd,kid,'2098-02-01',5,true); RAISE EXCEPTION 'Self approval'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Only management can approve' THEN RAISE; END IF; END; pass:=pass+1;
 j:=department_scorecards('2098-02-01'); IF NOT j::text LIKE '%provisional%' THEN RAISE EXCEPTION 'Provisional missing'; END IF; pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',mgr,'role','authenticated')::text,true);
 PERFORM save_department_target(bd,kid,'2098-02-01',5,true); PERFORM save_department_target(bd,kid,'2098-02-01',6,true); pass:=pass+1;
 j:=department_scorecards('2098-02-01');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j) card, jsonb_array_elements(card->'metrics') metric WHERE metric->>'id'=kid::text AND (metric->>'target')::numeric=6 AND metric->>'target_status'='approved') THEN RAISE EXCEPTION 'Management edit not applied'; END IF; pass:=pass+1;
 PERFORM save_department_month(bd,'2098-02-01',0,2);
 j:=department_scorecards('2098-03-01');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j) card, jsonb_array_elements(card->'metrics') metric WHERE metric->>'id'=kid::text AND metric->>'target_status'='missing' AND metric->>'target' IS NULL) THEN RAISE EXCEPTION 'Prior target incorrectly reused'; END IF; pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',di,'role','authenticated')::text,true);
 j:=department_scorecards('2098-01-01');
 IF jsonb_array_length(j)<>1 OR (j->0->>'code')<>'corporate_comms' THEN RAISE EXCEPTION 'Dinesh scoped'; END IF; pass:=pass+1;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->0->'people') x WHERE x->>'name'='Arvind Kumar' AND (x->>'pct')::numeric=50) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->0->'people') x WHERE x->>'name'='Aashish' AND (x->>'pct')::numeric=100) THEN RAISE EXCEPTION 'Per-person split'; END IF; pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',hr,'role','authenticated')::text,true);
 j:=department_scorecards('2098-01-01'); IF jsonb_array_length(j)<>2 OR j::text LIKE '%revenue_signed%' OR j::text LIKE '%25000%' THEN RAISE EXCEPTION 'HR revenue leak'; END IF; pass:=pass+1;
 BEGIN PERFORM save_department_month(bd,'2098-01-01',99,99); RAISE EXCEPTION 'HR edit'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Pipeline head or management only' THEN RAISE; END IF; END; pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 BEGIN j:=department_scorecards('2098-01-01'); RAISE EXCEPTION 'Owner scorecards'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Staff only' THEN RAISE; END IF; END; pass:=pass+1;
 EXECUTE 'RESET ROLE';
 IF has_function_privilege('anon','public.department_scorecards(date)','EXECUTE') OR has_function_privilege('authenticated','public._department_actual(uuid,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Auto source access leaked'; END IF; pass:=pass+1;
 RAISE EXCEPTION 'Q31 TESTS PASSED: %/23',pass;
END $$;
