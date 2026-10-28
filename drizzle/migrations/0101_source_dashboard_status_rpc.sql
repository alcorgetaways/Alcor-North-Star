CREATE OR REPLACE FUNCTION public.source_mapping_status(_source text)
RETURNS TABLE(client_pipeline_id uuid, listings integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.id, count(m.id)::int
  FROM client_pipelines cp
  LEFT JOIN kpi_source_mappings m ON m.client_pipeline_id = cp.id AND m.source = _source AND m.active
  WHERE public.can_view_client(cp.client_id)
  GROUP BY cp.id;
$$;
REVOKE ALL ON FUNCTION public.source_mapping_status(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.source_mapping_status(text) TO authenticated;