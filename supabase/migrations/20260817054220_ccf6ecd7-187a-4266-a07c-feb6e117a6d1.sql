CREATE TABLE public.social_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  client_pipeline_id uuid not null references public.client_pipelines(id) on delete cascade,
  month date not null,
  platform text not null,
  posts integer not null default 0,
  followers integer not null default 0,
  content_views integer not null default 0,
  profile_views integer not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_pipeline_id, month, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_kpi_entries TO authenticated;
GRANT ALL ON public.social_kpi_entries TO service_role;
ALTER TABLE public.social_kpi_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_select ON public.social_kpi_entries FOR SELECT TO authenticated USING (public.can_view_client(client_id));
CREATE POLICY social_write ON public.social_kpi_entries FOR ALL TO authenticated USING (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id)) WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));
CREATE TRIGGER t_social_upd BEFORE UPDATE ON public.social_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();