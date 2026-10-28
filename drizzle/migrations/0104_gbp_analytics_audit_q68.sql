CREATE TABLE public.kpi_fetched_extras (
  fetched_value_id uuid PRIMARY KEY REFERENCES public.kpi_fetched_values(id) ON DELETE CASCADE,
  extra_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_data jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kpi_fetched_extras TO authenticated;
GRANT ALL ON public.kpi_fetched_extras TO service_role;
ALTER TABLE public.kpi_fetched_extras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Extras follow the fetched row" ON public.kpi_fetched_extras FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.kpi_fetched_values f WHERE f.id = fetched_value_id));
COMMENT ON TABLE public.kpi_fetched_extras IS 'Additive extra source keys per fetched row; existing keys are never overwritten (kpi_fetched_values stays immutable).';

CREATE OR REPLACE FUNCTION public.kpi_extras_additive() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_each(OLD.extra_values) o WHERE NEW.extra_values -> o.key IS DISTINCT FROM o.value) THEN
    RAISE EXCEPTION 'Extra source values are additive only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kpi_extras_additive BEFORE UPDATE ON public.kpi_fetched_extras FOR EACH ROW EXECUTE FUNCTION public.kpi_extras_additive();

CREATE OR REPLACE FUNCTION public.source_profile_monthly(_source text, _from date, _to date)
RETURNS TABLE(client_pipeline_id uuid, mapping_id uuid, month date, vals jsonb, approved boolean, fetched_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT f.client_pipeline_id, f.mapping_id, f.month,
    (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
       FROM jsonb_each(coalesce(x.extra_values, '{}'::jsonb) || f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb)) e
      WHERE e.key NOT LIKE 'keyword_rank.%' AND jsonb_typeof(e.value) = 'number'),
    f.status = 'approved', f.fetched_at
  FROM public.kpi_fetched_values f
  LEFT JOIN public.kpi_fetched_extras x ON x.fetched_value_id = f.id
  WHERE f.source = _source AND f.month BETWEEN _from AND _to
  ORDER BY 1, 2, 3;
$$;
GRANT EXECUTE ON FUNCTION public.source_profile_monthly(text, date, date) TO authenticated;

-- Per-profile rules: leading all-zero GBP months are "not tracked"; review deltas per mapping, consecutive months only.
CREATE OR REPLACE FUNCTION public.source_monthly_agg(_source text, _from date, _to date)
RETURNS TABLE(client_pipeline_id uuid, month date, vals jsonb, approved boolean)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH r AS (
    SELECT f.client_pipeline_id, f.mapping_id, f.month, f.status,
           coalesce(x.extra_values, '{}'::jsonb) || f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb) AS v
    FROM public.kpi_fetched_values f
    LEFT JOIN public.kpi_fetched_extras x ON x.fetched_value_id = f.id
    WHERE f.source = _source AND f.month <= _to
  ), t AS (
    SELECT r.*, CASE WHEN _source = 'localo' THEN bool_and(
             coalesce((r.v->>'views')::numeric, 0) = 0 AND coalesce((r.v->>'calls')::numeric, 0) = 0
             AND coalesce((r.v->>'website_clicks')::numeric, 0) = 0 AND coalesce((r.v->>'direction_requests')::numeric, 0) = 0)
           OVER (PARTITION BY r.mapping_id ORDER BY r.month ROWS UNBOUNDED PRECEDING) ELSE false END AS untracked
    FROM r
  ), d AS (
    SELECT t.*,
      CASE WHEN lag(t.month) OVER w = (t.month - interval '1 month')::date
           THEN (t.v->>'reviews_received')::numeric - lag((t.v->>'reviews_received')::numeric) OVER w END AS dr,
      CASE WHEN lag(t.month) OVER w = (t.month - interval '1 month')::date
           THEN (t.v->>'five_star_reviews')::numeric - lag((t.v->>'five_star_reviews')::numeric) OVER w END AS d5
    FROM t WHERE NOT t.untracked
    WINDOW w AS (PARTITION BY t.mapping_id ORDER BY t.month)
  ), dd AS (SELECT * FROM d WHERE d.month BETWEEN _from AND _to),
  kv AS (
    SELECT dd.client_pipeline_id, dd.month, e.key, sum((e.value #>> '{}')::numeric) AS total
    FROM dd, jsonb_each(dd.v || jsonb_strip_nulls(jsonb_build_object('new_reviews', dd.dr, 'new_five_star', dd.d5))) e
    WHERE e.key NOT LIKE 'keyword_rank.%' AND jsonb_typeof(e.value) = 'number'
    GROUP BY 1, 2, 3
  ), st AS (
    SELECT dd.client_pipeline_id, dd.month, bool_and(dd.status = 'approved') AS approved FROM dd GROUP BY 1, 2
  )
  SELECT st.client_pipeline_id, st.month,
         coalesce((SELECT jsonb_object_agg(kv.key, kv.total) FROM kv WHERE kv.client_pipeline_id = st.client_pipeline_id AND kv.month = st.month), '{}'::jsonb),
         st.approved
  FROM st ORDER BY 1, 2;
$$;