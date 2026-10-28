-- QA-39 atomicity and unchanged self/head scope. Every fixture rolls back on PASS.
DO $$
DECLARE u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); rd uuid; cid uuid; f uuid; n int:=0; before_count int; denied boolean;
BEGIN
 SELECT id INTO rd FROM pipelines WHERE code='reservations_desk';
 INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at) VALUES(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa73@example.invalid','{}',now(),now());
 INSERT INTO profiles(id,full_name,status) VALUES(u,'QA73','active') ON CONFLICT(id) DO UPDATE SET status='active',client_id=NULL;
 INSERT INTO user_roles(user_id,role) VALUES(u,'team_member') ON CONFLICT DO NOTHING;
 INSERT INTO pipeline_members(user_id,pipeline_id,role,source) VALUES(u,rd,'team_member','manual');
 INSERT INTO clients(hotel_name,is_test) VALUES('QA73 rollback fixture',true) RETURNING id INTO cid;
 IF has_function_privilege('anon','create_rd_followup(uuid,uuid,date,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'QA39 anonymous execute'; END IF; n:=n+1;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='create_rd_followup(uuid,uuid,date,text,text,text)'::regprocedure) THEN RAISE EXCEPTION 'QA39 invoker required'; END IF; n:=n+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 SET LOCAL ROLE authenticated;
 f:=create_rd_followup(u,cid,current_date,'test','Lead','123');
 IF NOT EXISTS(SELECT 1 FROM rd_followup_contacts WHERE followup_id=f AND lead_name='Lead') THEN RAISE EXCEPTION 'QA39 contact missing'; END IF; n:=n+1;
 SELECT count(*) INTO before_count FROM rd_followups WHERE user_id=u;
 denied:=false;
 BEGIN PERFORM create_rd_followup(u,cid,NULL,'invalid','Lead','123'); EXCEPTION WHEN others THEN denied:=true; END;
 IF NOT denied OR (SELECT count(*) FROM rd_followups WHERE user_id=u)<>before_count THEN RAISE EXCEPTION 'QA39 failed operation retained parent'; END IF; n:=n+1;
 denied:=false;
 BEGIN PERFORM create_rd_followup(other,cid,current_date,'invalid','Lead','123'); EXCEPTION WHEN others THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'QA39 cross-user write'; END IF; n:=n+1;
 RAISE EXCEPTION 'PASS qa_p3_q73 % assertions',n;
END $$;
