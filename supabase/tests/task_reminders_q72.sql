-- Q72: action completion stamp + staff task reminder digest. Always aborts (nothing is kept).
DO $$
DECLARE c uuid:=gen_random_uuid(); ct uuid:=gen_random_uuid(); l uuid; lt uuid; p uuid; pid uuid;
 staff uuid:=gen_random_uuid(); bk uuid:=gen_random_uuid(); owner uuid:=gen_random_uuid(); idle uuid:=gen_random_uuid(); optout uuid:=gen_random_uuid();
 a uuid; n int; pass int:=0; b text; ts timestamptz;
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at)
 SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'{}',now(),now() FROM (VALUES(staff,'q72-staff@test.local'),(bk,'q72-backup@test.local'),(owner,'q72-owner@test.local'),(idle,'q72-idle@test.local'),(optout,'q72-optout@test.local')) v(id,email);
 UPDATE profiles SET status='active',must_change_password=false WHERE id IN(staff,bk,owner,idle,optout);
 DELETE FROM user_roles WHERE user_id IN(staff,bk,owner,idle,optout);
 INSERT INTO user_roles(user_id,role) VALUES(staff,'team_member'),(bk,'team_member'),(owner,'client'),(idle,'team_member'),(optout,'team_member');
 SELECT id INTO p FROM plans ORDER BY sort_order LIMIT 1; SELECT id INTO pid FROM pipelines WHERE code='social_media';
 INSERT INTO clients(id,hotel_name,is_demo) VALUES(c,'Q72 real hotel',false);
 INSERT INTO clients(id,hotel_name,is_demo,is_test) VALUES(ct,'Q72 test hotel',false,true);
 UPDATE profiles SET client_id=c WHERE id=owner;
 INSERT INTO client_launches(client_id,plan_id,status) VALUES(c,p,'active') RETURNING id INTO l;
 INSERT INTO client_launches(client_id,plan_id,status) VALUES(ct,p,'active') RETURNING id INTO lt;
 INSERT INTO client_staff_assignments(client_id,user_id,pipeline_id,role,source) SELECT x,u,pid,'team_member','manual' FROM unnest(ARRAY[c,ct]) x, unnest(ARRAY[staff,bk,idle,optout]) u;
 -- Thursday 2098-01-08 IST: overdue (01-05), today (01-08), upcoming (01-10 Sat), beyond window (01-13)
 INSERT INTO client_tasks(launch_id,client_id,module_code,phase_code,code,name,week_start,week_due,due_date,status,assignee_id,backup_id) VALUES
  (l,c,'AM','P0','Q72.O','Overdue paperwork',0,0,'2098-01-05','not_started',staff,bk),
  (l,c,'AM','P0','Q72.T','Today call',0,0,'2098-01-08','in_progress',staff,NULL),
  (l,c,'AM','P0','Q72.U','Upcoming deck',0,0,'2098-01-10','not_started',optout,NULL),
  (l,c,'AM','P0','Q72.F','Far future',0,0,'2098-01-13','not_started',staff,NULL),
  (l,c,'AM','P0','Q72.D','Done task',0,0,'2098-01-02','done',staff,NULL),
  (l,c,'AM','P0','Q72.OWN','Owner assigned',0,0,'2098-01-05','not_started',owner,NULL),
  (lt,ct,'AM','P0','Q72.X','Test hotel task',0,0,'2098-01-05','not_started',staff,NULL);
 UPDATE profiles SET email_task_reminders=false WHERE id=optout;

 -- 1. Action completion stamp
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
 INSERT INTO action_items(client_id,issue,responsible_id,priority,status,due_date) VALUES(c,'Q72 action',staff,'medium','not_started','2098-01-06') RETURNING id INTO a;
 UPDATE action_items SET completed_at='2001-01-01', completed_by=owner WHERE id=a;
 IF (SELECT completed_at FROM action_items WHERE id=a) IS NOT NULL THEN RAISE EXCEPTION 'Forged stamp on open action'; END IF;pass:=pass+1;
 UPDATE action_items SET status='completed', evidence_url='https://example.com/e' WHERE id=a;
 SELECT completed_at INTO ts FROM action_items WHERE id=a;
 IF ts IS NULL OR (SELECT completed_by FROM action_items WHERE id=a)<>staff THEN RAISE EXCEPTION 'Not stamped on complete'; END IF;pass:=pass+1;
 UPDATE action_items SET completed_at='2001-01-01', completed_by=owner WHERE id=a;
 IF (SELECT completed_at FROM action_items WHERE id=a)<>ts OR (SELECT completed_by FROM action_items WHERE id=a)<>staff THEN RAISE EXCEPTION 'Forged stamp on completed action'; END IF;pass:=pass+1;
 UPDATE action_items SET status='in_progress' WHERE id=a;
 IF (SELECT completed_at FROM action_items WHERE id=a) IS NOT NULL THEN RAISE EXCEPTION 'Not cleared on reopen'; END IF;pass:=pass+1;
 UPDATE action_items SET status='dropped', drop_reason='No longer needed' WHERE id=a;
 IF (SELECT completed_at FROM action_items WHERE id=a) IS NOT NULL THEN RAISE EXCEPTION 'Dropped counted as completion'; END IF;pass:=pass+1;
 UPDATE action_items SET status='in_progress', due_date='2098-01-07' WHERE id=a;
 -- 2. RLS on action_items unchanged
 IF (SELECT string_agg(polname||'='||pg_get_expr(polqual,polrelid),'|' ORDER BY polname) FROM pg_policy WHERE polrelid='public.action_items'::regclass)
    <>'actions read=can_view_action(client_id, pipeline_id, responsible_id)|actions write=can_view_action(client_id, pipeline_id, responsible_id)' THEN RAISE EXCEPTION 'action_items policies changed'; END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM action_items WHERE id=a;
 RESET ROLE;
 IF n<>0 THEN RAISE EXCEPTION 'Owner can read action'; END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM action_items WHERE id=a;
 RESET ROLE;
 IF n<>1 THEN RAISE EXCEPTION 'Responsible staff cannot read action'; END IF;pass:=pass+1;
 PERFORM set_config('request.jwt.claims','{}',true);

 -- 3. Digest content
 PERFORM queue_overdue_digest('2098-01-08 11:00+05:30');
 SELECT body INTO b FROM staff_digest_outbox WHERE user_id=staff AND slot_at='2098-01-08 11:00+05:30';
 IF b IS NULL OR b NOT LIKE 'Overdue%' OR b NOT LIKE '%Overdue paperwork · due 05 Jan · 3 days overdue%' OR b NOT LIKE '%Due today%Today call%' OR b NOT LIKE '%Q72 action%' THEN RAISE EXCEPTION 'Staff digest content: %',b; END IF;pass:=pass+1;
 IF b LIKE '%Far future%' OR b LIKE '%Done task%' OR b LIKE '%Owner assigned%' OR b LIKE '%Upcoming deck%' THEN RAISE EXCEPTION 'Digest leaked others or out-of-window items'; END IF;pass:=pass+1;
 IF b LIKE '%Q72 test hotel%' THEN RAISE EXCEPTION 'Test hotel included'; END IF;pass:=pass+1;
 IF NOT EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id=bk AND body LIKE '%Overdue paperwork (as backup)%') THEN RAISE EXCEPTION 'Backup not labelled'; END IF;pass:=pass+1;
 IF EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id=owner) OR EXISTS(SELECT 1 FROM notifications WHERE user_id=owner AND kind='overdue_digest') THEN RAISE EXCEPTION 'Owner got digest'; END IF;pass:=pass+1;
 IF EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id=idle) THEN RAISE EXCEPTION 'Empty person got digest'; END IF;pass:=pass+1;
 IF NOT EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id=optout AND email_skipped='opted_out' AND body LIKE 'Due in the next 2 working days%Upcoming deck%')
    OR NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=optout AND kind='overdue_digest') THEN RAISE EXCEPTION 'Opt-out should skip email but keep notification'; END IF;pass:=pass+1;
 IF EXISTS(SELECT 1 FROM staff_digest_outbox WHERE user_id IN(staff,bk,optout) AND (NOT held OR sent_at IS NOT NULL)) THEN RAISE EXCEPTION 'Digest not held'; END IF;pass:=pass+1;
 -- 4. One per slot; upcoming-only people get 11:00 only
 PERFORM queue_overdue_digest('2098-01-08 11:00+05:30');
 SELECT count(*) INTO n FROM staff_digest_outbox WHERE user_id=staff; IF n<>1 THEN RAISE EXCEPTION 'Duplicate slot'; END IF;pass:=pass+1;
 PERFORM queue_overdue_digest('2098-01-08 15:00+05:30'); PERFORM queue_overdue_digest('2098-01-08 18:00+05:30');
 SELECT count(*) INTO n FROM staff_digest_outbox WHERE user_id=staff; IF n<>3 THEN RAISE EXCEPTION 'Overdue person should get 3 slots'; END IF;pass:=pass+1;
 SELECT count(*) INTO n FROM staff_digest_outbox WHERE user_id=optout; IF n<>1 THEN RAISE EXCEPTION 'Upcoming-only person got afternoon digests'; END IF;pass:=pass+1;
 -- 5. Switch still off; scheduler not callable by app users
 IF EXISTS(SELECT 1 FROM app_settings WHERE key='email_sending_enabled' AND value=to_jsonb(true)) THEN RAISE EXCEPTION 'Email switch is on'; END IF;pass:=pass+1;
 IF has_function_privilege('authenticated','public.build_task_digests(timestamptz)','EXECUTE') OR has_function_privilege('anon','public.task_digest_items(date)','EXECUTE') THEN RAISE EXCEPTION 'Digest builder exposed'; END IF;pass:=pass+1;
 RAISE EXCEPTION 'Q72 TASK REMINDERS PASSED: %/21',pass;
END $$;
