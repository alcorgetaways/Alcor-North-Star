-- Q35–40: rollback-safe timing, reminders and scorecard permissions.
DO $$
DECLARE head_id uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();outside_id uuid:=gen_random_uuid();owner_id uuid:=gen_random_uuid();c uuid:=gen_random_uuid();pid uuid;cp uuid;pl uuid;tid uuid;bid uuid;aid uuid;pass int:=0;n int;u uuid;j jsonb;
BEGIN
 IF blocked_escalation_level('2026-10-01 00:00Z','2026-10-02 23:59Z')<>0 THEN RAISE EXCEPTION 'Before 48 hours';END IF;pass:=pass+1;
 IF blocked_escalation_level('2026-10-01 00:00Z','2026-10-03 00:00Z')<>1 THEN RAISE EXCEPTION '48 hours';END IF;pass:=pass+1;
 IF blocked_escalation_level('2026-10-01 00:00Z','2026-10-05 00:00Z')<>2 THEN RAISE EXCEPTION '96 hours';END IF;pass:=pass+1;
 IF blocked_escalation_level('2026-10-01 00:00Z','2026-10-07 00:00Z')<>3 THEN RAISE EXCEPTION '144 hours';END IF;pass:=pass+1;
 INSERT INTO activity_holidays(day,name) VALUES('2098-01-06','Q36 holiday');
 IF working_days_after('2098-01-01','2098-01-08')<>5 THEN RAISE EXCEPTION 'Five working days excludes Sunday and holiday';END IF;pass:=pass+1;
 IF working_days_after('2098-01-01','2098-01-09')<>6 THEN RAISE EXCEPTION 'More than five working days';END IF;pass:=pass+1;
 IF working_day_after('2098-01-04')<>'2098-01-07' THEN RAISE EXCEPTION 'Activation deadline crosses Sunday and holiday';END IF;pass:=pass+1;
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at) VALUES
 (head_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q35-head@test.local','{}',now(),now()),
 (member_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q35-member@test.local','{}',now(),now()),
 (outside_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q35-outside@test.local','{}',now(),now()),
 (owner_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','q35-owner@test.local','{}',now(),now());
 UPDATE profiles SET status='active',must_change_password=false WHERE id IN(head_id,member_id,outside_id,owner_id);
 DELETE FROM user_roles WHERE user_id IN(head_id,member_id,outside_id,owner_id);
 INSERT INTO user_roles(user_id,role) VALUES(head_id,'pipeline_manager'),(member_id,'team_member'),(outside_id,'team_member'),(owner_id,'client');
 SELECT id INTO pid FROM pipelines WHERE code='social_media';SELECT id INTO pl FROM plans ORDER BY sort_order LIMIT 1;
 INSERT INTO clients(id,hotel_name) VALUES(c,'Q35 rollback hotel');UPDATE profiles SET client_id=c WHERE id=owner_id;
 INSERT INTO client_launches(client_id,plan_id,status) VALUES(c,pl,'active');
 -- Q43: blocker timing starts only after BD has signed Gate A.
 INSERT INTO client_gates(launch_id,client_id,gate_code,gate_name,due_week,due_date,signer_role,rule,status)
 SELECT id,c,'gate_a','Gate A',0,'2098-01-01','bd_manager','module','signed' FROM client_launches WHERE client_id=c;
 INSERT INTO client_pipelines(client_id,pipeline_id,status) VALUES(c,pid,'active') ON CONFLICT(client_id,pipeline_id) DO UPDATE SET status='active' RETURNING id INTO cp;
 INSERT INTO pipeline_members(pipeline_id,user_id,role) VALUES(pid,head_id,'head'),(pid,member_id,'team_member');
 INSERT INTO client_staff_assignments(client_id,pipeline_id,user_id,role,source) VALUES(c,pid,head_id,'head','manual'),(c,pid,member_id,'team_member','manual') ON CONFLICT DO NOTHING;
 INSERT INTO client_tasks(launch_id,client_id,module_code,code,name,week_start,week_due,due_date,pipeline_code,status,requires_client_approval,evidence_url)
 SELECT id,c,'SMM','Q35.TEST','Approve campaign',1,1,'2098-01-09','social_media','waiting_client',true,'https://example.com/evidence' FROM client_launches WHERE client_id=c RETURNING id INTO tid;
 SELECT id INTO bid FROM task_approval_blockers WHERE task_id=tid;
 UPDATE task_approval_blockers SET blocked_since='2098-01-01 00:00+05:30' WHERE id=bid;
 PERFORM queue_blocker_reminders('2098-01-08 12:00+05:30');IF EXISTS(SELECT 1 FROM client_message_outbox WHERE blocker_id=bid) THEN RAISE EXCEPTION 'Reminder at only five days';END IF;pass:=pass+1;
 PERFORM queue_blocker_reminders('2098-01-09 12:00+05:30');SELECT count(*) INTO n FROM client_message_outbox WHERE blocker_id=bid AND held AND cardinality(cc_addresses)>=2;IF n<>1 THEN RAISE EXCEPTION 'First held reminder and CC';END IF;pass:=pass+1;
 PERFORM queue_blocker_reminders('2098-01-15 12:00+05:30');SELECT count(*) INTO n FROM client_message_outbox WHERE blocker_id=bid;IF n<>1 THEN RAISE EXCEPTION 'Early weekly repeat';END IF;pass:=pass+1;
 PERFORM queue_blocker_reminders('2098-01-16 12:00+05:30');SELECT count(*) INTO n FROM client_message_outbox WHERE blocker_id=bid;IF n<>2 THEN RAISE EXCEPTION 'Seven day repeat';END IF;pass:=pass+1;
 UPDATE task_approval_blockers SET owner_approved_at=now() WHERE id=bid;
 PERFORM queue_blocker_reminders('2098-01-23 12:00+05:30');SELECT count(*) INTO n FROM client_message_outbox WHERE blocker_id=bid;IF n<>3 THEN RAISE EXCEPTION 'Approval alone stopped reminders';END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',head_id,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';PERFORM resolve_approval_blocker(bid,'Approval verified and issue resolved');EXECUTE 'RESET ROLE';
 PERFORM queue_blocker_reminders('2098-01-30 12:00+05:30');SELECT count(*) INTO n FROM client_message_outbox WHERE blocker_id=bid;IF n<>3 THEN RAISE EXCEPTION 'Reminder after resolution';END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',member_id,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT scorecard_can_view(member_id) OR scorecard_can_view(head_id) OR scorecard_can_view(outside_id) THEN RAISE EXCEPTION 'Staff self-only';END IF;pass:=pass+1;
 SELECT count(*) INTO n FROM team_scorecard('2026-09-01');IF n<>1 THEN RAISE EXCEPTION 'Staff RPC scope';END IF;pass:=pass+1;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',head_id,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT scorecard_can_view(member_id) OR scorecard_can_view(outside_id) THEN RAISE EXCEPTION 'Head pipeline scope';END IF;pass:=pass+1;EXECUTE 'RESET ROLE';
 FOR u IN SELECT DISTINCT user_id FROM user_roles WHERE role IN('bd_manager','hr','admin','management') LOOP
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';IF NOT scorecard_can_view(outside_id) THEN RAISE EXCEPTION 'Authorized all-staff scope for %',u;END IF;EXECUTE 'RESET ROLE';END LOOP;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';IF scorecard_can_view(member_id) THEN RAISE EXCEPTION 'Owner saw staff scorecard';END IF;pass:=pass+1;EXECUTE 'RESET ROLE';
 INSERT INTO pipeline_activation_requests(client_id,user_id,pipeline_id,created_at) VALUES(c,owner_id,pid,'2098-01-04 12:00+05:30') RETURNING id INTO aid;
 IF NOT EXISTS(SELECT 1 FROM pipeline_activation_requests a JOIN profiles p ON p.id=a.assigned_to WHERE a.id=aid AND p.email='shalini@alcorgetaways.com' AND follow_up_due='2098-01-07') THEN RAISE EXCEPTION 'Shalini activation deadline';END IF;pass:=pass+1;
 IF NOT EXISTS(SELECT 1 FROM client_message_outbox WHERE activation_request_id=aid AND to_address='mohnish@group2001.in' AND held) THEN RAISE EXCEPTION 'Held activation copy';END IF;pass:=pass+1;
 IF EXISTS(SELECT 1 FROM profiles WHERE full_name ILIKE '%chhavi%' OR full_name ILIKE '%sahil%') THEN RAISE EXCEPTION 'Unexpected Q39 account';END IF;pass:=pass+1;
 IF has_function_privilege('anon','public.blocked_workspace()','EXECUTE') OR has_function_privilege('authenticated','public.queue_blocker_reminders(timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Scheduler grants';END IF;pass:=pass+1;
 RAISE EXCEPTION 'Q35 Q40 TESTS PASSED: %/22',pass;
END $$;