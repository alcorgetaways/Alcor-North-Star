CREATE OR REPLACE FUNCTION public.source_profile_names(_source text)
RETURNS TABLE(mapping_id uuid, client_pipeline_id uuid, external_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id, m.client_pipeline_id, m.external_name
  FROM kpi_source_mappings m
  JOIN client_pipelines cp ON cp.id = m.client_pipeline_id
  WHERE m.source = _source AND m.active AND public.can_view_client(cp.client_id);
$$;
REVOKE EXECUTE ON FUNCTION public.source_profile_names(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.source_profile_names(text) TO authenticated;