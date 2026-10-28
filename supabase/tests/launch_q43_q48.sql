-- Always aborts: real users, terms and messages remain unchanged.
DO $$
DECLARE c uuid:=gen_random_uuid(); l uuid; p uuid; bd uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); outside uuid:=gen_random_uuid(); owner uuid:=gen_random_uuid(); t uuid; core uuid; gate uuid; pid uuid; n int; pass int:=0; j jsonb; today date:=(now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at)
 SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'{}',now(),now() FROM (VALUES(bd,'q43-bd@test.local'),(adm,'q43-admin@test.local'),(staff,'q43-staff@test.local'),(outside,'q43-outside@test.local'),(owner,'q43-owner@test.local')) v(id,email);
 UPDATE profiles SET status='active',must_change_password=false WHERE id IN(bd,adm,staff,outside,owner);
 DELETE FROM user_roles WHERE user_id IN(bd,adm,staff,outside,owner);
 INSERT INTO user_roles(user_id,role) VALUES(bd,'bd_manager'),(adm,'admin'),(staff,'team_member'),(outside,'team_member'),(owner,'client');
 SELECT id INTO p FROM plans ORDER BY sort_order LIMIT 1;
 SELECT id INTO pid FROM pipelines WHERE code='social_media';
 INSERT INTO clients(id,hotel_name,is_demo) VALUES(c,'Q43 rollback hotel',false);
 UPDATE profiles SET client_id=c WHERE id=owner;
 INSERT INTO client_launches(client_id,plan_id,status) VALUES(c,p,'active') RETURNING id INTO l;
 INSERT INTO client_gates(launch_id,client_id,gate_code,gate_name,due_week,due_date,signer_role,rule,status) VALUES(l,c,'gate_a','Gate A',0,'2098-01-01','bd_manager','module','open') RETURNING id INTO gate;
 INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status,assignee_id)
 VALUES(l,c,'SMM','P3','Q43.T','Internal campaign',1,2,'2098-01-15','not_started',staff) RETURNING id INTO t;
 INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status,assignee_id)
 VALUES(l,c,'AM','P0','Q43.C','Core paperwork',0,0,'2098-01-01','not_started',staff) RETURNING id INTO core;
 IF NOT task_gate_a_locked(t) OR task_gate_a_locked(core) THEN RAISE EXCEPTION 'P1-P9 locked; P0 open'; END IF;pass:=pass+1;
 BEGIN UPDATE client_tasks SET status='in_progress' WHERE id=t; RAISE EXCEPTION 'Started locked task'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Locked: waiting for Gate A' THEN RAISE; END IF; END;pass:=pass+1;
 BEGIN UPDATE client_tasks SET notes='Illegal edit' WHERE id=t; RAISE EXCEPTION 'Edited locked task'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Locked: waiting for Gate A' THEN RAISE; END IF; END;pass:=pass+1;
 BEGIN UPDATE client_tasks SET status='done' WHERE id=t; RAISE EXCEPTION 'Completed locked task'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Locked: waiting for Gate A' THEN RAISE; END IF; END;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
 BEGIN PERFORM override_gate_a_task(t,' '); RAISE EXCEPTION 'Blank reason accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%reason%' THEN RAISE; END IF; END;pass:=pass+1;
 PERFORM override_gate_a_task(t,'Prepare urgent campaign');
 IF task_gate_a_locked(t) OR NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE actor=adm AND action='gate_a_task_override' AND target_id=t::text AND details->>'reason'='Prepare urgent campaign') THEN RAISE EXCEPTION 'Override/audit missing'; END IF;pass:=pass+1;
 UPDATE client_tasks SET notes='Allowed single task edit' WHERE id=t;pass:=pass+1;
 INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status,assignee_id)
 VALUES(l,c,'SMM','P3','Q43.SIBLING','Locked sibling',1,2,'2098-01-15','not_started',staff);
 IF NOT task_gate_a_locked((SELECT id FROM client_tasks WHERE launch_id=l AND code='Q43.SIBLING')) THEN RAISE EXCEPTION 'Override unlocked sibling'; END IF;pass:=pass+1;
 BEGIN INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status) VALUES(l,c,'SMM','P3','Q43.ILLEGAL','Illegal completion',1,2,'2098-01-15','done'); RAISE EXCEPTION 'Inserted completed locked task'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Locked: waiting for Gate A' THEN RAISE; END IF; END;pass:=pass+1;
 UPDATE client_tasks SET status='done' WHERE id=core;
 BEGIN PERFORM sign_gate(gate,NULL,NULL); RAISE EXCEPTION 'Admin signed Gate A'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%sign%' THEN RAISE; END IF; END;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',bd,'role','authenticated')::text,true);
 PERFORM sign_gate(gate,NULL,NULL);
 IF NOT EXISTS(SELECT 1 FROM client_tasks WHERE id=t AND due_date=today+14) THEN RAISE EXCEPTION 'Calendar offset not based on signoff'; END IF;pass:=pass+1;
 IF task_gate_a_locked((SELECT id FROM client_tasks WHERE launch_id=l AND code='Q43.SIBLING')) OR NOT EXISTS(SELECT 1 FROM client_tasks WHERE launch_id=l AND code='Q43.SIBLING' AND due_date=today+14) THEN RAISE EXCEPTION 'Signoff did not unlock all tasks'; END IF;pass:=pass+1;
 IF NOT EXISTS(SELECT 1 FROM client_tasks WHERE id=core AND due_date='2098-01-01') THEN RAISE EXCEPTION 'P0 date changed'; END IF;pass:=pass+1;
 PERFORM sign_gate(gate,NULL,NULL);IF NOT EXISTS(SELECT 1 FROM client_tasks WHERE id=t AND due_date=today+14) THEN RAISE EXCEPTION 'Repeat signoff changed date'; END IF;pass:=pass+1;
 INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status,requires_client_approval,evidence_url,assignee_id)
 VALUES(l,c,'SMM','P3','Q43.OWNER','Owner campaign approval',1,1,'2098-01-09','waiting_client',true,'https://example.com/evidence',staff);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
 j:=get_my_launch();
 IF jsonb_array_length(j->'waiting_on_you')<>1 OR j->'waiting_on_you'->0->>'code'<>'Q43.OWNER' THEN RAISE EXCEPTION 'Owner filter exposed internal tasks'; END IF;pass:=pass+1;
 IF (j->>'progress_pct')::numeric<>25 THEN RAISE EXCEPTION 'Progress not across full launch'; END IF;pass:=pass+1;
 INSERT INTO client_gates(launch_id,client_id,gate_code,gate_name,due_week,due_date,signer_role,rule,status) VALUES(l,c,'q43_approval','Approval Gate',1,'2098-01-10','bd_manager','module','ready') RETURNING id INTO gate;
 PERFORM client_approve_gate(gate);
 IF NOT EXISTS(SELECT 1 FROM client_gates WHERE id=gate AND client_approved_by=owner AND approval_method='owner_login') THEN RAISE EXCEPTION 'Owner approval method'; END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
 UPDATE client_gates SET status='signed',signed_by=adm,signed_at=now(),approval_file_path='https://example.com/approval.pdf' WHERE id=gate;
 IF NOT EXISTS(SELECT 1 FROM client_gates WHERE id=gate AND approval_method='uploaded_file') THEN RAISE EXCEPTION 'Uploaded gate approval method'; END IF;pass:=pass+1;
 INSERT INTO client_launches(client_id,plan_id,status,no_launch_checklist) VALUES(c,p,'closed',true) RETURNING id INTO gate;
 BEGIN INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status) VALUES(gate,c,'AM','P0','Q43.LIVE','Should never generate',0,0,'2098-01-01','not_started'); RAISE EXCEPTION 'Generated checklist for live client'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Live, no checklist:%' THEN RAISE; END IF; END;pass:=pass+1;
 PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE client_tasks SET due_date='2098-01-01' WHERE id=t;
 UPDATE client_tasks SET due_date='2099-01-01' WHERE launch_id=l AND code='Q43.SIBLING';
 INSERT INTO client_staff_assignments(client_id,user_id,pipeline_id,role) VALUES(c,staff,pid,'team_member');
 INSERT INTO activity_holidays(day,name) VALUES('2098-01-07','Q46 holiday');
 IF queue_overdue_digest('2098-01-05 11:00+05:30')<>0 THEN RAISE EXCEPTION 'Sunday digest'; END IF;pass:=pass+1;
 IF queue_overdue_digest('2098-01-07 11:00+05:30')<>0 THEN RAISE EXCEPTION 'Holiday digest'; END IF;pass:=pass+1;
 IF queue_overdue_digest('2098-01-08 09:00+05:30')<>0 THEN RAISE EXCEPTION 'Old 09 slot'; END IF;pass:=pass+1;
 PERFORM queue_overdue_digest('2098-01-08 11:00+05:30');
 IF NOT EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id=staff AND slot_at='2098-01-08 11:00+05:30' AND held AND sent_at IS NULL AND (SELECT count(*) FROM jsonb_array_elements(items) v WHERE v->>'section'='overdue')=1) THEN RAISE EXCEPTION 'One held personal overdue digest'; END IF;pass:=pass+1;
 IF EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id=outside) THEN RAISE EXCEPTION 'Zero-overdue recipient'; END IF;pass:=pass+1;
 PERFORM queue_overdue_digest('2098-01-08 11:00+05:30');SELECT count(*) INTO n FROM staff_digest_outbox WHERE user_id=staff AND slot_at='2098-01-08 11:00+05:30';IF n<>1 THEN RAISE EXCEPTION 'Duplicate slot'; END IF;pass:=pass+1;
 PERFORM queue_overdue_digest('2098-01-08 15:00+05:30');PERFORM queue_overdue_digest('2098-01-08 18:00+05:30');SELECT count(*) INTO n FROM staff_digest_outbox WHERE user_id=staff;IF n<>3 THEN RAISE EXCEPTION 'Three requested slots'; END IF;pass:=pass+1;
 IF has_function_privilege('authenticated','public.queue_overdue_digest(timestamptz)','EXECUTE') OR has_function_privilege('anon','public.override_gate_a_task(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Scheduler/override grants'; END IF;pass:=pass+1;
 RAISE EXCEPTION 'Q43 Q48 TESTS PASSED: %/27',pass;
END $$;