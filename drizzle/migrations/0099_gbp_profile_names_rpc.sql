CREATE OR REPLACE FUNCTION public.gbp_profile_names()
RETURNS TABLE(client_id uuid, external_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.client_id, m.external_name
  FROM kpi_source_mappings m
  JOIN client_pipelines cp ON cp.id = m.client_pipeline_id
  WHERE m.source = 'localo' AND m.active
    AND public.can_view_client(cp.client_id);
$$;

GRANT EXECUTE ON FUNCTION public.gbp_profile_names() TO authenticated;