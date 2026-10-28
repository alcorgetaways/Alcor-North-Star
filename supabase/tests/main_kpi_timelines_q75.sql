DO $$
DECLARE cp uuid; cid uuid; mapping uuid; f uuid; u uuid; v numeric; n integer:=0;
BEGIN
 SELECT user_id INTO u FROM user_roles WHERE role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 SELECT m.id,m.client_pipeline_id,p.client_id INTO mapping,cp,cid FROM kpi_source_mappings m JOIN client_pipelines p ON p.id=m.client_pipeline_id WHERE m.source='localo' AND m.active LIMIT 1;
 IF cp IS NULL THEN RAISE EXCEPTION 'missing localo fixture'; END IF;
 INSERT INTO gbp_kpi_entries(client_id,client_pipeline_id,month,chat_clicks,booking_clicks,status) VALUES(cid,cp,'2019-03-01',99,88,'approved'),(cid,cp,'2019-04-01',7,8,'approved');
 INSERT INTO kpi_fetched_values(mapping_id,client_pipeline_id,month,source,fetched_values,raw_data,status) VALUES(mapping,cp,'2019-03-01','localo','{}','{"period":"before_alcor"}','approved') RETURNING id INTO f;
 INSERT INTO kpi_fetched_extras(fetched_value_id,extra_values,raw_data) VALUES(f,'{"chat_clicks":0,"booking_clicks":2}','{}');
 SELECT value INTO v FROM main_kpi_values(cp,'2019-03-01') WHERE main_position=3;
 IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Localo zero must win over manual 99, got %',v; END IF;n:=n+1;
 SELECT value INTO v FROM main_kpi_values(cp,'2019-03-01') WHERE main_position=4;
 IF v IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Localo booking must win over manual 88'; END IF;n:=n+1;
 SELECT value INTO v FROM main_kpi_values(cp,'2019-04-01') WHERE main_position=3;
 IF v IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'Manual fallback missing'; END IF;n:=n+1;
 IF has_function_privilege('anon','all_kpi_values(uuid,date)','execute') OR has_function_privilege('anon','portfolio_main_kpi_values(date)','execute') THEN RAISE EXCEPTION 'anon new display access'; END IF;n:=n+1;
 IF (SELECT count(*) FROM all_kpi_values(cp,'2019-03-01')) < (SELECT count(*) FROM main_kpi_values(cp,'2019-03-01')) THEN RAISE EXCEPTION 'All excludes main'; END IF;n:=n+1;
 SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT 1 FROM portfolio_main_kpi_values('2026-09-01') r WHERE NOT can_view_pipeline(r.client_pipeline_id)) THEN RAISE EXCEPTION 'portfolio scope widened'; END IF;n:=n+1;
 RESET ROLE;
 IF pg_get_functiondef('public.all_kpi_values(uuid,date)'::regprocedure) LIKE '%AND k.is_main%' THEN RAISE EXCEPTION 'All still restricted to main'; END IF;n:=n+1;
 RAISE EXCEPTION 'PASS main_kpi_timelines_q75 % assertions',n;
END $$;