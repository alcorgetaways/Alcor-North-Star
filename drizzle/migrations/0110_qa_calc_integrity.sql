-- QA fix batch L1–L13, L18: calculations & data integrity.

CREATE OR REPLACE FUNCTION public.is_real_client(_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client AND NOT c.is_test AND NOT c.is_demo)
$$;
REVOKE EXECUTE ON FUNCTION public.is_real_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_real_client(uuid) TO authenticated, service_role;

ALTER TABLE public.kpi_fetched_values ADD COLUMN IF NOT EXISTS is_partial boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.kpi_fetched_values.is_partial IS 'Stored before the month ended; ignored by analytics, reports and review until re-fetched.';
UPDATE public.kpi_fetched_values SET is_partial = true
 WHERE month >= date_trunc('month', (fetched_at AT TIME ZONE 'Asia/Kolkata'))::date;

CREATE OR REPLACE FUNCTION public.q57_fetched_identity_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mapping_id IS DISTINCT FROM OLD.mapping_id OR NEW.client_pipeline_id IS DISTINCT FROM OLD.client_pipeline_id
     OR NEW.month IS DISTINCT FROM OLD.month OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Fetched source provenance is immutable';
  END IF;
  IF NEW.fetched_values IS DISTINCT FROM OLD.fetched_values OR NEW.fetched_at IS DISTINCT FROM OLD.fetched_at OR NEW.raw_data IS DISTINCT FROM OLD.raw_data THEN
    IF NOT (OLD.status = 'fetched' AND NEW.status = 'fetched' AND NEW.fetched_at > OLD.fetched_at
            AND NEW.raw_data->'previous_fetch'->'values' = OLD.fetched_values
            AND (NEW.raw_data->'previous_fetch'->>'fetched_at')::timestamptz = OLD.fetched_at) THEN
      RAISE EXCEPTION 'Fetched source provenance is immutable';
    END IF;
  END IF;
  IF NEW.is_partial AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'This month was fetched before it ended. It will be re-fetched after month end before it can be reviewed.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fetched_no_running_month()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.month >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date THEN
    RAISE EXCEPTION 'Source data for the running month (%) is not stored until the month ends', to_char(NEW.month, 'Mon YYYY');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fetched_no_running_month ON public.kpi_fetched_values;
CREATE TRIGGER fetched_no_running_month BEFORE INSERT ON public.kpi_fetched_values FOR EACH ROW EXECUTE FUNCTION public.fetched_no_running_month();

CREATE OR REPLACE FUNCTION public.source_profile_monthly(_source text, _from date, _to date)
 RETURNS TABLE(client_pipeline_id uuid, mapping_id uuid, month date, vals jsonb, approved boolean, fetched_at timestamp with time zone)
 LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT f.client_pipeline_id, f.mapping_id, f.month,
    (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
       FROM jsonb_each(coalesce(x.extra_values, '{}'::jsonb) || f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb)) e
      WHERE e.key NOT LIKE 'keyword_rank.%' AND jsonb_typeof(e.value) = 'number'),
    f.status = 'approved', f.fetched_at
  FROM public.kpi_fetched_values f
  LEFT JOIN public.kpi_fetched_extras x ON x.fetched_value_id = f.id
  WHERE f.source = _source AND f.month BETWEEN _from AND _to AND NOT f.is_partial
  ORDER BY 1, 2, 3;
$function$;

DO $do$
DECLARE def text; nd text;
BEGIN
  def := pg_get_functiondef('public.source_monthly_agg(text,date,date)'::regprocedure);
  nd := replace(def, 'WHERE f.source = _source AND f.month <= _to', 'WHERE f.source = _source AND f.month <= _to AND NOT f.is_partial');
  IF nd = def THEN RAISE EXCEPTION 'source_monthly_agg patch failed'; END IF; EXECUTE nd;

  def := pg_get_functiondef('public.portfolio_report_health(date)'::regprocedure);
  nd := replace(def, 'FROM clients c WHERE NOT c.is_demo', 'FROM clients c WHERE public.is_real_client(c.id)');
  IF nd = def THEN RAISE EXCEPTION 'portfolio_report_health patch failed'; END IF; EXECUTE nd;

  def := pg_get_functiondef('public.overdue_digest_items(date)'::regprocedure);
  nd := replace(def, 'NOT c.is_demo', 'public.is_real_client(c.id)');
  IF nd = def THEN RAISE EXCEPTION 'overdue_digest_items patch failed'; END IF; EXECUTE nd;

  def := pg_get_functiondef('public.launch_reporting_counts()'::regprocedure);
  nd := replace(def, 'NOT c.is_test', 'public.is_real_client(c.id)');
  IF nd = def THEN RAISE EXCEPTION 'launch_reporting_counts patch failed'; END IF; EXECUTE nd;

  def := pg_get_functiondef('public.team_scorecard(date)'::regprocedure);
  nd := replace(def, 'FROM recurring_tasks rt) t',
    'FROM recurring_tasks rt WHERE NOT EXISTS (SELECT 1 FROM activity_items ai JOIN staff_duty_templates sdt ON md5(''staffduty-item:'' || sdt.id::text)::uuid = ai.occurrence_key WHERE ai.id = rt.item_id AND sdt.frequency = ''ongoing'')) t');
  nd := replace(nd, 'count(*) FILTER (WHERE a.due_date < today)::int overdue_n',
    'count(*) FILTER (WHERE a.due_date >= m0 AND a.due_date < LEAST(m1, today))::int overdue_n');
  IF nd = def OR position('sdt.frequency' in nd) = 0 OR position('LEAST(m1, today)' in nd) = 0 THEN RAISE EXCEPTION 'team_scorecard patch failed'; END IF;
  EXECUTE nd;

  def := pg_get_functiondef('public.generate_staff_duties(date)'::regprocedure);
  nd := replace(def, 'OR (t.frequency = ''twice_monthly'' AND extract(day FROM dd) = ANY (coalesce(t.month_days, ''{15,30}''::int[])))',
    'OR (t.frequency = ''twice_monthly'' AND (extract(day FROM dd) = ANY (coalesce(t.month_days, ''{15,30}''::int[])) OR (dd::date = (m + interval ''1 month'' - interval ''1 day'')::date AND EXISTS (SELECT 1 FROM unnest(coalesce(t.month_days, ''{15,30}''::int[])) md WHERE md > extract(day FROM dd)))))');
  IF nd = def THEN RAISE EXCEPTION 'generate_staff_duties patch failed'; END IF; EXECUTE nd;
END $do$;

CREATE OR REPLACE FUNCTION public.kpi_achievement(_direction text, _target numeric, _actual numeric)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE ratio numeric;
BEGIN
  IF _target IS NULL OR _actual IS NULL OR _target < 0 OR _actual < 0 THEN RETURN NULL; END IF;
  IF _direction = 'lower_better' THEN
    IF _target = 0 THEN RETURN CASE WHEN _actual = 0 THEN 100 ELSE 0 END; END IF;
    IF _actual = 0 THEN RETURN 100; END IF;
    RETURN LEAST(120, round(_target / _actual * 100, 2));
  ELSIF _direction = 'within_budget' THEN
    IF _target = 0 THEN RETURN CASE WHEN _actual = 0 THEN 100 ELSE 0 END; END IF;
    ratio := _actual / _target;
    RETURN CASE WHEN ratio BETWEEN 0.9 AND 1.0 THEN 100
                WHEN ratio < 0.9 THEN round(ratio / 0.9 * 100, 2)
                ELSE GREATEST(0, round((2 - ratio) * 100, 2)) END;
  ELSE
    IF _target = 0 THEN RETURN 100; END IF;
    RETURN LEAST(120, round(_actual / _target * 100, 2));
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.kpi_achievement(text, numeric, numeric) TO authenticated, service_role;

DO $do$
DECLARE def text; s1 int; s2 int;
BEGIN
  def := pg_get_functiondef('public.kpi_entry_compute()'::regprocedure);
  s1 := position('IF NEW.target IS NULL OR NEW.actual IS NULL' in def);
  s2 := position('IF NEW.achievement_pct IS NOT NULL' in def);
  IF s1 = 0 OR s2 = 0 OR s2 < s1 THEN RAISE EXCEPTION 'kpi_entry_compute patch failed'; END IF;
  EXECUTE left(def, s1 - 1) || 'NEW.achievement_pct := public.kpi_achievement(d.direction, NEW.target, NEW.actual);' || E'\n\n  ' || substr(def, s2);
END $do$;

CREATE OR REPLACE FUNCTION public.kpi_source_value(_cp uuid, _month date, _key text, _avg boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m date := date_trunc('month', _month)::date; sk text; val numeric; n int;
BEGIN
  sk := CASE WHEN _key LIKE 'social.sum.%' THEN substr(_key, 12) WHEN _key LIKE 'gbp.%' THEN substr(_key, 5) END;
  IF sk IS NOT NULL THEN
    SELECT count(*) INTO n FROM kpi_fetched_values f
     WHERE f.client_pipeline_id = _cp AND f.month = m AND f.status = 'approved' AND NOT f.is_partial
       AND coalesce(f.raw_data->>'period', 'alcor') <> 'before_alcor';
    IF n > 0 THEN
      IF _key LIKE 'social.sum.%' THEN
        SELECT sum(e.value::numeric) INTO val
          FROM kpi_fetched_values f, jsonb_each_text(f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb)) e
         WHERE f.client_pipeline_id = _cp AND f.month = m AND f.status = 'approved' AND NOT f.is_partial
           AND coalesce(f.raw_data->>'period', 'alcor') <> 'before_alcor'
           AND e.key LIKE '%.' || sk AND e.value ~ '^-?[0-9]+(\.[0-9]+)?$';
        IF val IS NOT NULL THEN RETURN val; END IF;
      ELSIF sk IN ('five_star_reviews', 'reviews_received') THEN
        SELECT sum(cur.v - prev.v) INTO val
          FROM (SELECT f.mapping_id, ((f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb))->>sk)::numeric v
                  FROM kpi_fetched_values f
                 WHERE f.client_pipeline_id = _cp AND f.month = m AND f.status = 'approved' AND NOT f.is_partial
                   AND coalesce(f.raw_data->>'period', 'alcor') <> 'before_alcor') cur
          JOIN LATERAL (SELECT ((p.fetched_values || coalesce(p.corrected_values, '{}'::jsonb))->>sk)::numeric v
                          FROM kpi_fetched_values p
                         WHERE p.mapping_id = cur.mapping_id AND p.month = (m - interval '1 month')::date AND NOT p.is_partial) prev ON true
         WHERE cur.v IS NOT NULL AND prev.v IS NOT NULL;
        RETURN val;
      ELSE
        SELECT sum(((f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb))->>sk)::numeric) INTO val
          FROM kpi_fetched_values f
         WHERE f.client_pipeline_id = _cp AND f.month = m AND f.status = 'approved' AND NOT f.is_partial
           AND coalesce(f.raw_data->>'period', 'alcor') <> 'before_alcor'
           AND (f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb)) ? sk;
        IF val IS NOT NULL THEN RETURN val; END IF;
      END IF;
    END IF;
  END IF;
  RETURN public.kpi_source_value_legacy(_cp, _month, _key, _avg);
END $function$;

CREATE OR REPLACE FUNCTION public.kpi_source_value_legacy(_cp uuid, _month date, _key text, _avg boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m0 date := date_trunc('month', _month)::date; m1 date := (date_trunc('month', _month) + interval '1 month')::date;
        parts text[] := string_to_array(_key, '.'); v numeric; s numeric; l numeric;
BEGIN
  IF _key IS NULL THEN RETURN NULL; END IF;
  IF parts[1] = 'weekly' THEN
    IF parts[2] = 'cpl' THEN
      SELECT sum(w.ad_spend * (LEAST(w.week_start + 7, m1) - GREATEST(w.week_start, m0))::numeric / 7),
             sum(w.leads * (LEAST(w.week_start + 7, m1) - GREATEST(w.week_start, m0))::numeric / 7)
        INTO s, l FROM weekly_kpi_entries w
       WHERE w.client_pipeline_id = _cp AND w.week_start > m0 - 7 AND w.week_start < m1;
      RETURN CASE WHEN coalesce(l, 0) = 0 THEN NULL ELSE round(s / l, 2) END;
    END IF;
    IF parts[2] = 'max' THEN
      EXECUTE format('SELECT max(%I)::numeric FROM weekly_kpi_entries WHERE client_pipeline_id=$1 AND week_start>$2-7 AND week_start<$3', parts[3])
        INTO v USING _cp, m0, m1;
    ELSE
      EXECUTE format('SELECT round(sum(%I * (LEAST(week_start + 7, $3) - GREATEST(week_start, $2))::numeric / 7), 2) FROM weekly_kpi_entries WHERE client_pipeline_id=$1 AND week_start>$2-7 AND week_start<$3', parts[3])
        INTO v USING _cp, m0, m1;
    END IF;
  ELSIF parts[1] = 'social' THEN
    EXECUTE format('SELECT sum(%I)::numeric FROM social_kpi_entries WHERE client_pipeline_id=$1 AND month=$2', parts[3]) INTO v USING _cp, m0;
  ELSIF parts[1] = 'gbp' THEN
    EXECUTE format('SELECT sum(%I)::numeric FROM gbp_kpi_entries WHERE client_pipeline_id=$1 AND month=$2', parts[2]) INTO v USING _cp, m0;
  ELSIF parts[1] = 'ota' THEN
    EXECUTE format('SELECT round(%s(%I)::numeric,2) FROM ota_records WHERE client_pipeline_id=$1 AND month=$2',
      CASE parts[2] WHEN 'max' THEN 'max' WHEN 'avg' THEN 'avg' ELSE 'sum' END, parts[3]) INTO v USING _cp, m0;
  ELSIF parts[1] = 'pke' THEN
    SELECT CASE WHEN _avg THEN round(avg((metrics->>parts[2])::numeric), 2) ELSE sum((metrics->>parts[2])::numeric) END INTO v
      FROM pipeline_kpi_entries WHERE client_pipeline_id = _cp AND month = m0 AND (metrics->>parts[2]) ~ '^-?[0-9]+(\.[0-9]+)?$';
  END IF;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public._revision_candidates(_on date)
 RETURNS TABLE(launch_id uuid, client_id uuid, hotel_name text, old_retainer numeric, new_retainer numeric, pct numeric, anniversary date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT l.id, l.client_id, c.hotel_name, l.retainer_inr, round(l.retainer_inr * (1 + r.pct / 100)), r.pct, a.d
    FROM public.client_launches l
    JOIN public.clients c ON c.id = l.client_id
    LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
    CROSS JOIN LATERAL (SELECT CASE WHEN l.annual_revision_applicable IS FALSE THEN NULL
                                    ELSE coalesce(l.annual_revision_pct, pv.annual_revision_pct) END AS pct) r
    CROSS JOIN LATERAL (SELECT (extract(year FROM _on) - extract(year FROM l.contract_start))::int AS n) y
    CROSS JOIN LATERAL (SELECT CASE WHEN (l.contract_start + make_interval(years => y.n))::date <= _on
                                    THEN (l.contract_start + make_interval(years => y.n))::date
                                    ELSE (l.contract_start + make_interval(years => y.n - 1))::date END AS d) a
   WHERE l.status IN ('active','live') AND l.notice_date IS NULL
     AND public.is_real_client(c.id)
     AND l.contract_start IS NOT NULL AND l.retainer_inr > 0 AND coalesce(r.pct, 0) > 0
     AND a.d > l.contract_start AND a.d <= _on
     AND (a.d >= _on - 7 OR coalesce((SELECT s.value = 'true'::jsonb FROM public.app_settings s WHERE s.key = 'annual_revision_catchup'), false))
     AND (l.last_revised_on IS NULL OR l.last_revised_on < a.d)
$function$;

DO $do$
DECLARE def text; nd text;
BEGIN
  def := pg_get_functiondef('public.create_monthly_reports(date)'::regprocedure);
  nd := replace(def, 'WHERE cp.status = ''active'' AND cp.manager_id IS NOT NULL',
    'WHERE cp.status = ''active'' AND cp.manager_id IS NOT NULL AND public.is_real_client(cp.client_id) AND EXISTS (SELECT 1 FROM clients ac WHERE ac.id = cp.client_id AND ac.status = ''active'')');
  IF nd = def THEN RAISE EXCEPTION 'create_monthly_reports patch failed'; END IF; EXECUTE nd;
END $do$;

ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS no_data_reason text;
DO $do$
DECLARE def text; nd text;
BEGIN
  def := pg_get_functiondef('public.report_submit_guard()'::regprocedure);
  nd := replace(def, E'IF NEW.status <> ''draft'' AND OLD.status = ''draft'' THEN\n    PERFORM public.refresh_report_kpis(NEW.id);',
    E'IF NEW.status <> ''draft'' AND OLD.status = ''draft'' THEN\n'
    || E'    IF (now() AT TIME ZONE ''Asia/Kolkata'')::date < (NEW.month + interval ''1 month'')::date THEN\n'
    || E'      RAISE EXCEPTION ''The % report can be submitted once the month has ended (India time).'', to_char(NEW.month, ''Mon YYYY'');\n    END IF;\n'
    || E'    PERFORM public.refresh_report_kpis(NEW.id);\n'
    || E'    IF NOT EXISTS (SELECT 1 FROM kpi_entries e WHERE e.report_id = NEW.id AND e.actual IS NOT NULL) AND coalesce(trim(NEW.no_data_reason), '''') = '''' THEN\n'
    || E'      RAISE EXCEPTION ''No actual figures are entered. Enter the results, or give a reason why there is no data this month.'';\n    END IF;');
  IF nd = def THEN RAISE EXCEPTION 'report_submit_guard patch failed'; END IF; EXECUTE nd;
END $do$;

CREATE OR REPLACE FUNCTION public.dashboard_pipeline_scores(_months date[])
RETURNS TABLE(month date, client_id uuid, hotel_name text, client_pipeline_id uuid, weight numeric, score numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT r.month, r.client_id, c.hotel_name, cp.id, coalesce(cp.weight, pl.default_weight, 1)::numeric, round(avg(e.achievement_pct), 2)
    FROM monthly_reports r
    JOIN clients c ON c.id = r.client_id
    JOIN client_pipelines cp ON cp.id = r.client_pipeline_id
    JOIN pipelines pl ON pl.id = cp.pipeline_id
    JOIN kpi_entries e ON e.report_id = r.id
   WHERE r.month = ANY (_months) AND r.status = 'approved' AND public.is_real_client(r.client_id)
   GROUP BY r.month, r.client_id, c.hotel_name, cp.id, cp.weight, pl.default_weight
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_pipeline_scores(date[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_pipeline_scores(date[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._qa_run_suite(_sql text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN EXECUTE _sql; RETURN 'NO EXCEPTION';
  EXCEPTION WHEN others THEN RETURN SQLERRM; END;
END $$;
REVOKE EXECUTE ON FUNCTION public._qa_run_suite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._qa_run_suite(text) TO service_role;
