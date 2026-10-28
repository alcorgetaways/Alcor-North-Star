CREATE OR REPLACE FUNCTION public.main_kpi_values(_cp uuid, _month date)
RETURNS TABLE(definition_id uuid, name text, kpi_type text, unit text, direction text, main_position integer, main_group text, value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE m date:=date_trunc('month',_month)::date; cid uuid; pid uuid; owner_read boolean; d record; v numeric; cur numeric; base numeric; key text;
BEGIN
 SELECT cp.client_id,cp.pipeline_id INTO cid,pid FROM client_pipelines cp WHERE cp.id=_cp;
 owner_read:=coalesce(public.my_client_id()=cid AND public.has_role(auth.uid(),'client'),false);
 IF auth.uid() IS NULL OR pid IS NULL OR NOT (owner_read OR public.can_view_pipeline(_cp)) THEN RETURN; END IF;
 FOR d IN SELECT k.* FROM kpi_definitions k WHERE k.pipeline_id=pid AND k.is_main AND k.active ORDER BY k.main_position LOOP
 v:=NULL;
 IF d.source_key LIKE 'weekly.%' THEN
 -- Identical hotel boundary to get_my_kpis; weekly ads have no approval state.
 v:=public.kpi_source_value(_cp,m,d.source_key);
 ELSIF d.source_key LIKE 'auto.cc.%' THEN
 IF NOT owner_read OR EXISTS(SELECT 1 FROM monthly_reports r WHERE r.client_pipeline_id=_cp AND r.month=m AND r.status='approved') THEN
 SELECT count(*),count(*) FILTER(WHERE t.status='done') INTO cur,base FROM client_tasks t WHERE t.client_id=cid AND t.pipeline_code='corporate_comms' AND t.due_date>=m AND t.due_date<(m+interval '1 month')::date;
 v:=CASE d.source_key WHEN 'auto.cc.assigned' THEN cur WHEN 'auto.cc.completed' THEN base ELSE cur-base END;
 END IF;
 ELSIF d.source_key LIKE 'yoy.ota.%' THEN
 key:=CASE WHEN d.source_key LIKE '%bookings' THEN 'bookings' ELSE 'revenue' END;
 EXECUTE format('select sum(%I) from ota_records where client_pipeline_id=$1 and month=$2 and status=''approved''',key) INTO cur USING _cp,m;
 EXECUTE format('select sum(%I) from ota_records where client_pipeline_id=$1 and month=$2 and status=''approved''',key) INTO base USING _cp,(m-interval '1 year')::date;
 v:=CASE WHEN base>0 AND cur IS NOT NULL THEN round((cur-base)/base*100,1) END;
 ELSIF d.source_key LIKE 'sync:%' THEN
 key:=substr(d.source_key,6);
 SELECT sum((e.value#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id CROSS JOIN LATERAL jsonb_each(coalesce(x.extra_values,'{}')||f.fetched_values||coalesce(f.corrected_values,'{}')) e
 WHERE f.client_pipeline_id=_cp AND f.month=m AND NOT f.is_partial AND (NOT owner_read OR f.status='approved') AND e.key=key AND jsonb_typeof(e.value)='number';
 ELSIF d.source_key LIKE 'gbp.%' THEN
 key:=substr(d.source_key,5);
 EXECUTE format('select sum(%I) from gbp_kpi_entries where client_pipeline_id=$1 and month=$2 and ($3=false or status=''approved'')',key) INTO v USING _cp,m,owner_read;
 IF v IS NULL THEN SELECT sum((coalesce(f.corrected_values->key,f.fetched_values->key,x.extra_values->key)#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id WHERE f.client_pipeline_id=_cp AND f.month=m AND NOT f.is_partial AND (NOT owner_read OR f.status='approved'); END IF;
 ELSIF d.source_key LIKE 'social.%' THEN
 key:=split_part(d.source_key,'.',3);
 EXECUTE format('select sum(%I) from social_kpi_entries where client_pipeline_id=$1 and month=$2 and ($3=false or status=''approved'')',key) INTO v USING _cp,m,owner_read;
 IF v IS NULL THEN SELECT sum((e.value#>>'{}')::numeric) INTO v FROM kpi_fetched_values f LEFT JOIN kpi_fetched_extras x ON x.fetched_value_id=f.id CROSS JOIN LATERAL jsonb_each(coalesce(x.extra_values,'{}')||f.fetched_values||coalesce(f.corrected_values,'{}')) e WHERE f.client_pipeline_id=_cp AND f.month=m AND NOT f.is_partial AND (NOT owner_read OR f.status='approved') AND e.key LIKE '%.'||key AND jsonb_typeof(e.value)='number'; END IF;
 ELSIF d.source_key LIKE 'ota.%' THEN
 EXECUTE format('select %s(%I) from ota_records where client_pipeline_id=$1 and month=$2 and ($3=false or status=''approved'')',CASE split_part(d.source_key,'.',2) WHEN 'max' THEN 'max' WHEN 'avg' THEN 'avg' ELSE 'sum' END,split_part(d.source_key,'.',3)) INTO v USING _cp,m,owner_read;
 ELSIF d.source_key LIKE 'pke.%' THEN
 key:=substr(d.source_key,5);
 SELECT CASE WHEN d.kpi_type='percentage' OR d.unit='minutes' THEN avg((e.metrics->>key)::numeric) ELSE sum((e.metrics->>key)::numeric) END INTO v FROM pipeline_kpi_entries e WHERE e.client_pipeline_id=_cp AND e.month=m AND (NOT owner_read OR e.status='approved') AND jsonb_typeof(e.metrics->key)='number';
 END IF;
 definition_id:=d.id;name:=d.name;kpi_type:=d.kpi_type;unit:=d.unit;direction:=d.direction;main_position:=d.main_position;main_group:=d.main_group;value:=v;RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.main_kpi_values(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.main_kpi_values(uuid,date) TO authenticated;
COMMENT ON FUNCTION public.main_kpi_values(uuid,date) IS 'Scoped display-only Main KPIs; scoring unchanged. Weekly owner Ads retain get_my_kpis hotel scope, monthly sources require approval for owners.';