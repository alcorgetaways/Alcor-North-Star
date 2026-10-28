CREATE OR REPLACE FUNCTION public.q57_can_review(_month date, _at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT _month < (date_trunc('month',_at AT TIME ZONE 'Asia/Kolkata')-interval '1 month')::date
      OR public.q57_review_open(_month,_at) $$;

CREATE OR REPLACE FUNCTION public.review_fetched_kpis(_id uuid, _values jsonb, _confirm boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE f kpi_fetched_values; BEGIN
 SELECT * INTO f FROM kpi_fetched_values WHERE id=_id FOR UPDATE;
 IF f.id IS NULL OR NOT public.manages_pipeline(f.client_pipeline_id) THEN RAISE EXCEPTION 'Only the assigned pipeline head or team can review source data'; END IF;
 IF NOT public.q57_can_review(f.month) THEN RAISE EXCEPTION 'Review last month on the 1st–3rd (IST); earlier months can be reviewed any time, the running month only after it ends'; END IF;
 IF f.status='approved' THEN RAISE EXCEPTION 'Approved source values are locked'; END IF;
 IF jsonb_typeof(_values)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(_values) v WHERE jsonb_typeof(v.value) NOT IN ('number','null')) THEN RAISE EXCEPTION 'Corrections must contain numeric KPI values'; END IF;
 INSERT INTO kpi_source_history(fetched_id,actor,action,before_values,after_values) VALUES(_id,auth.uid(),CASE WHEN _confirm THEN 'confirmed' ELSE 'corrected' END,coalesce(f.corrected_values,f.fetched_values),_values);
 UPDATE kpi_fetched_values SET corrected_values=_values,corrected_by=auth.uid(),corrected_at=now(),confirmed_by=CASE WHEN _confirm THEN auth.uid() END,confirmed_at=CASE WHEN _confirm THEN now() END,status=CASE WHEN _confirm THEN 'confirmed' ELSE 'fetched' END WHERE id=_id; END $function$;

DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('public.activity_workspace(date,uuid,text,boolean)'::regprocedure),
    '''hotel'',c.hotel_name',
    '''hotel'',CASE WHEN c.is_internal AND pl.code=''gbp'' THEN ''All GMB profiles'' WHEN c.is_internal THEN ''All clients (portfolio)'' ELSE c.hotel_name END');
END $$;