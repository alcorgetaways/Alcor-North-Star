ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS generated_proposal boolean NOT NULL DEFAULT false;
CREATE TABLE public.department_month_entries (pipeline_id uuid NOT NULL REFERENCES public.pipelines(id), month date NOT NULL, outside_proposals integer CHECK(outside_proposals>=0), meetings integer CHECK(meetings>=0), updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(pipeline_id,month), CHECK(month=date_trunc('month',month)::date));
GRANT SELECT ON public.department_month_entries TO authenticated; GRANT ALL ON public.department_month_entries TO service_role;
ALTER TABLE public.department_month_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY department_entries_read ON public.department_month_entries FOR SELECT TO authenticated USING(public.is_manager(auth.uid()) OR public.is_pipeline_head(auth.uid(),pipeline_id));
CREATE TABLE public.department_kpi_targets (pipeline_id uuid NOT NULL REFERENCES public.pipelines(id), kpi_definition_id uuid NOT NULL REFERENCES public.kpi_definitions(id), month date NOT NULL, target numeric NOT NULL CHECK(target>=0), status text NOT NULL DEFAULT 'provisional' CHECK(status IN ('provisional','approved')), proposed_by uuid, approved_by uuid, approved_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(pipeline_id,kpi_definition_id,month), CHECK(month=date_trunc('month',month)::date));
GRANT SELECT ON public.department_kpi_targets TO authenticated; GRANT ALL ON public.department_kpi_targets TO service_role;
ALTER TABLE public.department_kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY department_targets_read ON public.department_kpi_targets FOR SELECT TO authenticated USING((public.is_manager(auth.uid()) OR public.is_pipeline_head(auth.uid(),pipeline_id)) AND (NOT EXISTS(SELECT 1 FROM public.kpi_definitions k WHERE k.id=kpi_definition_id AND k.source_key='dept.revenue_signed') OR public.can_view_commercials(auth.uid())));
CREATE FUNCTION public._department_actual(_pipeline uuid,_month date,_key text) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',_month)::date; e date:=(m+interval '1 month')::date; v numeric; manual_n numeric; n bigint;
BEGIN
 IF (SELECT code FROM pipelines WHERE id=_pipeline)='business_development' THEN
  IF _key IN ('dept.new_properties','dept.revenue_signed') THEN
   WITH first_launch AS (SELECT DISTINCT ON(l.client_id) l.* FROM client_launches l JOIN clients c ON c.id=l.client_id WHERE NOT c.is_test AND NOT c.is_demo ORDER BY l.client_id,coalesce(l.contract_start,l.day0_date,l.launch_date) NULLS LAST,l.source_row NULLS LAST,l.created_at,l.id)
   SELECT count(*),CASE WHEN count(retainer_inr)=count(*) THEN sum(retainer_inr) END INTO n,v FROM first_launch WHERE coalesce(contract_start,day0_date,launch_date)>=m AND coalesce(contract_start,day0_date,launch_date)<e AND upgraded_from_launch_id IS NULL AND coalesce(change_kind,'new') NOT IN ('upgrade','downgrade','renewal') AND status NOT IN ('draft','proposed','cancelled');
   RETURN CASE WHEN n=0 THEN NULL WHEN _key='dept.new_properties' THEN n ELSE v END;
  ELSIF _key='dept.proposals' THEN
   SELECT count(*) INTO n FROM documents d JOIN clients c ON c.id=d.client_id WHERE d.generated_proposal AND d.category='proposal' AND d.file_path IS NOT NULL AND NOT c.is_demo AND NOT c.is_test AND d.created_at>=m AND d.created_at<e;
   SELECT outside_proposals INTO manual_n FROM department_month_entries WHERE pipeline_id=_pipeline AND month=m;
   RETURN CASE WHEN n=0 AND manual_n IS NULL THEN NULL ELSE n+coalesce(manual_n,0) END;
  ELSIF _key='dept.meetings' THEN SELECT meetings INTO v FROM department_month_entries WHERE pipeline_id=_pipeline AND month=m; RETURN v;
  END IF;
 ELSIF (SELECT code FROM pipelines WHERE id=_pipeline)='corporate_comms' AND _key='dept.tasks_on_time' THEN
  SELECT CASE WHEN count(*)=0 THEN NULL ELSE round(100.0*count(*) FILTER(WHERE t.status='done' AND (t.done_at AT TIME ZONE 'Asia/Kolkata')::date<=t.due_date)/count(*),2) END INTO v FROM client_tasks t JOIN clients c ON c.id=t.client_id JOIN client_launches l ON l.id=t.launch_id WHERE t.due_date>=m AND t.due_date<e AND t.status<>'not_applicable' AND l.status<>'on_hold' AND NOT c.is_test AND NOT c.is_demo AND EXISTS(SELECT 1 FROM pipeline_members pm WHERE pm.pipeline_id=_pipeline AND pm.active AND pm.user_id=t.assignee_id);
  RETURN v;
 END IF; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._department_actual(uuid,date,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public._department_actual(uuid,date,text) TO service_role;
CREATE FUNCTION public.department_scorecards(_month date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',_month)::date; p record; k record; a numeric; prev numeric; tar numeric; st text; metrics jsonb; result jsonb:='[]'; split jsonb; manual jsonb; sc numeric; score_sum numeric; score_n int;
BEGIN
 IF auth.uid() IS NULL OR NOT (is_staff(auth.uid()) OR has_role(auth.uid(),'hr')) THEN RAISE EXCEPTION 'Staff only'; END IF;
 FOR p IN SELECT pl.*,pr.full_name,pm.user_id FROM pipelines pl JOIN pipeline_members pm ON pm.pipeline_id=pl.id AND pm.active AND pm.role='head' JOIN profiles pr ON pr.id=pm.user_id WHERE pl.code IN ('business_development','corporate_comms') AND (is_manager(auth.uid()) OR has_role(auth.uid(),'hr') OR is_pipeline_member(auth.uid(),pl.id)) ORDER BY pl.sort_order LOOP
  metrics:='[]'; score_sum:=0; score_n:=0;
  FOR k IN SELECT * FROM kpi_definitions WHERE pipeline_id=p.id AND active AND source_key LIKE 'dept.%' ORDER BY sort_order LOOP
   IF k.source_key='dept.revenue_signed' AND NOT can_view_commercials(auth.uid()) THEN CONTINUE; END IF;
   a:=_department_actual(p.id,m,k.source_key); prev:=_department_actual(p.id,(m-interval '1 month')::date,k.source_key); tar:=NULL; st:=NULL;
   IF prev IS NULL THEN st:='baseline'; ELSE
    SELECT target,status INTO tar,st FROM department_kpi_targets WHERE pipeline_id=p.id AND kpi_definition_id=k.id AND month<=m AND status='approved' ORDER BY month DESC LIMIT 1;
    IF tar IS NULL THEN SELECT target,status INTO tar,st FROM department_kpi_targets WHERE pipeline_id=p.id AND kpi_definition_id=k.id AND month=m; END IF; st:=coalesce(st,'missing');
   END IF;
   sc:=CASE WHEN st='approved' AND tar>0 AND a IS NOT NULL THEN least(120,round(a/tar*100,2)) END;
   IF sc IS NOT NULL THEN score_sum:=score_sum+sc; score_n:=score_n+1; END IF;
   metrics:=metrics||jsonb_build_array(jsonb_build_object('id',k.id,'name',k.name,'unit',k.unit,'source_key',k.source_key,'actual',a,'target',tar,'target_status',st,'suggested',CASE WHEN prev IS NOT NULL THEN round(prev*1.1,2) END,'achievement',sc));
  END LOOP;
  split:='[]'; manual:=NULL;
  IF p.code='corporate_comms' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'name',x.full_name,'due',x.due,'on_time',x.on_time,'pct',CASE WHEN x.due>0 THEN round(100.0*x.on_time/x.due,2) END) ORDER BY x.full_name),'[]') INTO split FROM (
    SELECT pm.user_id,pr.full_name,count(t.id) due,count(t.id) FILTER(WHERE t.status='done' AND (t.done_at AT TIME ZONE 'Asia/Kolkata')::date<=t.due_date) on_time FROM pipeline_members pm JOIN profiles pr ON pr.id=pm.user_id LEFT JOIN client_tasks t ON t.assignee_id=pm.user_id AND t.due_date>=m AND t.due_date<(m+interval '1 month')::date AND t.status<>'not_applicable' AND EXISTS(SELECT 1 FROM clients c JOIN client_launches l ON l.client_id=c.id WHERE c.id=t.client_id AND l.id=t.launch_id AND NOT c.is_test AND NOT c.is_demo AND l.status<>'on_hold') WHERE pm.pipeline_id=p.id AND pm.active GROUP BY pm.user_id,pr.full_name) x;
  ELSE SELECT jsonb_build_object('outside_proposals',outside_proposals,'meetings',meetings) INTO manual FROM department_month_entries WHERE pipeline_id=p.id AND month=m; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'manager',p.full_name,'manager_id',p.user_id,'month',m,'can_edit',is_manager(auth.uid()) OR is_pipeline_head(auth.uid(),p.id),'can_approve',is_manager(auth.uid()),'metrics',metrics,'people',split,'manual',manual,'score',CASE WHEN score_n>0 THEN round(score_sum/score_n,2) END));
 END LOOP; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.department_scorecards(date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.department_scorecards(date) TO authenticated,service_role;
CREATE FUNCTION public.save_department_month(_pipeline uuid,_month date,_outside integer,_meetings integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (is_manager(auth.uid()) OR is_pipeline_head(auth.uid(),_pipeline)) THEN RAISE EXCEPTION 'Pipeline head or management only'; END IF;
 IF (SELECT code FROM pipelines WHERE id=_pipeline) IS DISTINCT FROM 'business_development' THEN RAISE EXCEPTION 'BD monthly entry only'; END IF;
 INSERT INTO department_month_entries(pipeline_id,month,outside_proposals,meetings,updated_by) VALUES(_pipeline,date_trunc('month',_month)::date,_outside,_meetings,auth.uid()) ON CONFLICT(pipeline_id,month) DO UPDATE SET outside_proposals=excluded.outside_proposals,meetings=excluded.meetings,updated_by=auth.uid(),updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_department_month(uuid,date,integer,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_department_month(uuid,date,integer,integer) TO authenticated;
CREATE FUNCTION public.save_department_target(_pipeline uuid,_definition uuid,_month date,_target numeric,_approve boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k record; m date:=date_trunc('month',_month)::date; mgr boolean:=coalesce(is_manager(auth.uid()),false);
BEGIN
 IF auth.uid() IS NULL OR NOT(mgr OR is_pipeline_head(auth.uid(),_pipeline)) THEN RAISE EXCEPTION 'Pipeline head or management only'; END IF;
 SELECT * INTO k FROM kpi_definitions WHERE id=_definition AND pipeline_id=_pipeline AND active AND source_key LIKE 'dept.%'; IF NOT FOUND THEN RAISE EXCEPTION 'Active department KPI required'; END IF;
 IF k.source_key='dept.revenue_signed' AND NOT can_view_commercials(auth.uid()) THEN RAISE EXCEPTION 'Commercial access required'; END IF;
 IF _approve AND NOT mgr THEN RAISE EXCEPTION 'Only management can approve'; END IF;
 IF _department_actual(_pipeline,(m-interval '1 month')::date,k.source_key) IS NULL THEN RAISE EXCEPTION 'Baseline month has no target'; END IF;
 IF NOT mgr AND EXISTS(SELECT 1 FROM department_kpi_targets WHERE pipeline_id=_pipeline AND kpi_definition_id=_definition AND month=m AND status='approved') THEN RAISE EXCEPTION 'Only management can change approved targets'; END IF;
 INSERT INTO department_kpi_targets(pipeline_id,kpi_definition_id,month,target,status,proposed_by,approved_by,approved_at) VALUES(_pipeline,_definition,m,_target,CASE WHEN _approve THEN 'approved' ELSE 'provisional' END,auth.uid(),CASE WHEN _approve THEN auth.uid() END,CASE WHEN _approve THEN now() END) ON CONFLICT(pipeline_id,kpi_definition_id,month) DO UPDATE SET target=excluded.target,status=excluded.status,proposed_by=excluded.proposed_by,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_department_target(uuid,uuid,date,numeric,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_department_target(uuid,uuid,date,numeric,boolean) TO authenticated;