CREATE OR REPLACE FUNCTION public.can_read_fetched(_cp uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'bd_manager')
      OR EXISTS (
        SELECT 1 FROM client_pipelines cp
        JOIN client_staff_assignments a ON a.client_id = cp.client_id AND a.pipeline_id = cp.pipeline_id
        WHERE cp.id = _cp AND a.user_id = auth.uid() AND NOT coalesce(a.excluded, false)
      );
$$;
REVOKE ALL ON FUNCTION public.can_read_fetched(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_fetched(uuid) TO authenticated;
CREATE POLICY fetched_read_assigned ON public.kpi_fetched_values FOR SELECT TO authenticated
  USING (public.can_read_fetched(client_pipeline_id));