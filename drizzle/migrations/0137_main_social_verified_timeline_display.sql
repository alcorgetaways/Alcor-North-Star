DO $migration$ DECLARE body text; old_branch text; new_branch text; BEGIN
SELECT pg_get_functiondef('public.main_kpi_values(uuid,date)'::regprocedure) INTO body;
old_branch:=substring(body from 'ELSIF d.source_key LIKE ''social.%'' THEN.*?ELSIF d.source_key LIKE ''ota.%'' THEN');
IF old_branch IS NULL THEN RAISE EXCEPTION 'social branch missing'; END IF;
new_branch:=$branch$ELSIF d.source_key LIKE 'social.%' THEN
 metric_key:=split_part(d.source_key,'.',3);
 IF metric_key IN ('new_followers','engagement') THEN
 SELECT sum((e.value#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id CROSS JOIN LATERAL jsonb_each(coalesce(x.extra_values,'{}')||f.fetched_values) e WHERE f.client_pipeline_id=_cp AND f.month=m AND NOT f.is_partial AND (NOT owner_read OR f.status='approved') AND e.key LIKE '%.'||CASE metric_key WHEN 'new_followers' THEN 'new_subscribers' ELSE 'interactions' END AND jsonb_typeof(e.value)='number';
 END IF;
 IF v IS NULL THEN EXECUTE format('select sum(%I) from social_kpi_entries where client_pipeline_id=$1 and month=$2 and ($3=false or status=''approved'')',metric_key) INTO v USING _cp,m,owner_read; END IF;
 IF v IS NULL THEN SELECT sum((e.value#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id CROSS JOIN LATERAL jsonb_each(coalesce(x.extra_values,'{}')||f.fetched_values||coalesce(f.corrected_values,'{}')) e WHERE f.client_pipeline_id=_cp AND f.month=m AND NOT f.is_partial AND (NOT owner_read OR f.status='approved') AND e.key LIKE '%.'||metric_key AND jsonb_typeof(e.value)='number'; END IF;
 ELSIF d.source_key LIKE 'ota.%' THEN$branch$;
body:=replace(body,old_branch,new_branch);
body:=replace(body,'metric_key:=substr(d.source_key,6);','metric_key:=substr(d.source_key,6); IF metric_key LIKE ''%.content_views'' THEN metric_key:=replace(metric_key,''.content_views'',''.publication_views''); END IF;');
EXECUTE body;
body:=replace(body,'FUNCTION public.main_kpi_values','FUNCTION public.all_kpi_values'); body:=replace(body,'AND k.is_main AND k.active','AND k.active'); EXECUTE body;
END $migration$;