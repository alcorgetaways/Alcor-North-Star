DO $migration$ DECLARE body text; old_branch text; new_branch text; BEGIN
SELECT pg_get_functiondef('public.main_kpi_values(uuid,date)'::regprocedure) INTO body;
old_branch := substring(body from 'ELSIF d.source_key LIKE ''gbp.%'' THEN.*?ELSIF d.source_key LIKE ''social.%'' THEN');
IF old_branch IS NULL THEN RAISE EXCEPTION 'GBP branch not found'; END IF;
new_branch := $branch$ELSIF d.source_key LIKE 'gbp.%' THEN
 metric_key:=substr(d.source_key,5);
 IF metric_key IN ('chat_clicks','booking_clicks') THEN
 SELECT sum((coalesce(f.fetched_values->metric_key,x.extra_values->metric_key)#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id WHERE f.client_pipeline_id=_cp AND f.month=m AND f.source='localo' AND NOT f.is_partial AND (NOT owner_read OR f.status='approved') AND jsonb_typeof(coalesce(f.fetched_values->metric_key,x.extra_values->metric_key))='number';
 IF v IS NULL THEN EXECUTE format('select sum(%I) from gbp_kpi_entries where client_pipeline_id=$1 and month=$2 and ($3=false or status=''approved'')',metric_key) INTO v USING _cp,m,owner_read; END IF;
 ELSE
 EXECUTE format('select sum(%I) from gbp_kpi_entries where client_pipeline_id=$1 and month=$2 and ($3=false or status=''approved'')',metric_key) INTO v USING _cp,m,owner_read;
 IF v IS NULL THEN SELECT sum((coalesce(f.corrected_values->metric_key,f.fetched_values->metric_key,x.extra_values->metric_key)#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id WHERE f.client_pipeline_id=_cp AND f.month=m AND NOT f.is_partial AND (NOT owner_read OR f.status='approved'); END IF;
 END IF;
 ELSIF d.source_key LIKE 'social.%' THEN$branch$;
body := replace(body,old_branch,new_branch);
EXECUTE body;
body := replace(body,'FUNCTION public.main_kpi_values','FUNCTION public.all_kpi_values');
body := replace(body,'AND k.is_main AND k.active','AND k.active');
EXECUTE body;
END $migration$;
REVOKE ALL ON FUNCTION public.all_kpi_values(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.all_kpi_values(uuid,date) TO authenticated;
COMMENT ON FUNCTION public.all_kpi_values(uuid,date) IS 'Display-only all active definitions with identical main_kpi_values access and approval boundaries; no scoring changes.';
CREATE OR REPLACE FUNCTION public.portfolio_main_kpi_values(_month date)
RETURNS TABLE(pipeline_code text,pipeline_name text,client_pipeline_id uuid,definition_id uuid,name text,kpi_type text,unit text,direction text,main_position integer,main_group text,value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO public AS $$
 SELECT p.code,p.name,cp.id,k.* FROM client_pipelines cp JOIN pipelines p ON p.id=cp.pipeline_id JOIN clients c ON c.id=cp.client_id CROSS JOIN LATERAL public.main_kpi_values(cp.id,_month) k WHERE cp.status='active' AND c.status='active' AND public.is_real_client(c.id)
$$;
REVOKE ALL ON FUNCTION public.portfolio_main_kpi_values(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portfolio_main_kpi_values(date) TO authenticated;
CREATE OR REPLACE FUNCTION public._q75_run_suite(_script text) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$ BEGIN BEGIN EXECUTE _script; RETURN 'NO EXCEPTION'; EXCEPTION WHEN others THEN RETURN SQLERRM; END; END $$;
REVOKE ALL ON FUNCTION public._q75_run_suite(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._q75_run_suite(text) TO service_role,supabase_read_only_user;
GRANT SELECT,INSERT,UPDATE ON public._q69_suites TO sandbox_exec;