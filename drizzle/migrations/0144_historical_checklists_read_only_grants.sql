REVOKE ALL ON public.historical_launch_tasks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.historical_launch_tasks TO authenticated;