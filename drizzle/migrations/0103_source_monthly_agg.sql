CREATE INDEX IF NOT EXISTS kpi_fetched_values_cp_source_month_idx ON public.kpi_fetched_values (client_pipeline_id, source, month);

-- Server-side per client_pipeline per month aggregate for the marketing dashboards.
-- SECURITY INVOKER: kpi_fetched_values RLS (fetched_read + fetched_read_assigned) applies exactly as for raw reads.
CREATE OR REPLACE FUNCTION public.source_monthly_agg(_source text, _from date, _to date)
RETURNS TABLE(client_pipeline_id uuid, month date, vals jsonb, approved boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH r AS (
    SELECT f.client_pipeline_id, f.month, f.status,
           f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb) AS v
    FROM public.kpi_fetched_values f
    WHERE f.source = _source AND f.month BETWEEN _from AND _to
  ), kv AS (
    SELECT r.client_pipeline_id, r.month, e.key, sum((e.value #>> '{}')::numeric) AS total
    FROM r, jsonb_each(r.v) e
    WHERE e.key NOT LIKE 'keyword_rank.%' AND jsonb_typeof(e.value) = 'number'
    GROUP BY 1, 2, 3
  ), st AS (
    SELECT r.client_pipeline_id, r.month, bool_and(r.status = 'approved') AS approved
    FROM r GROUP BY 1, 2
  )
  SELECT st.client_pipeline_id, st.month,
         coalesce((SELECT jsonb_object_agg(kv.key, kv.total) FROM kv WHERE kv.client_pipeline_id = st.client_pipeline_id AND kv.month = st.month), '{}'::jsonb),
         st.approved
  FROM st
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.source_monthly_agg(text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.source_monthly_agg(text, date, date) TO authenticated, service_role;