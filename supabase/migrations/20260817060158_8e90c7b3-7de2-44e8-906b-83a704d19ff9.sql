
CREATE TABLE public.gbp_kpi_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  month date NOT NULL,
  posts integer NOT NULL DEFAULT 0,
  photos integer NOT NULL DEFAULT 0,
  five_star_reviews integer NOT NULL DEFAULT 0,
  profile_interactions integer NOT NULL DEFAULT 0,
  chat_clicks integer NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0,
  website_clicks integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_pipeline_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_kpi_entries TO authenticated;
GRANT ALL ON public.gbp_kpi_entries TO service_role;
ALTER TABLE public.gbp_kpi_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbp_kpi_select" ON public.gbp_kpi_entries FOR SELECT TO authenticated USING (public.can_view_client(client_id));
CREATE POLICY "gbp_kpi_write" ON public.gbp_kpi_entries FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));
CREATE TRIGGER t_gbp_kpi_upd BEFORE UPDATE ON public.gbp_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gbp_monthly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  month date NOT NULL,
  target_reviews integer NOT NULL DEFAULT 0,
  target_photos integer NOT NULL DEFAULT 0,
  target_posts integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_pipeline_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_monthly_goals TO authenticated;
GRANT ALL ON public.gbp_monthly_goals TO service_role;
ALTER TABLE public.gbp_monthly_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbp_goal_select" ON public.gbp_monthly_goals FOR SELECT TO authenticated USING (public.can_view_client(client_id));
CREATE POLICY "gbp_goal_write" ON public.gbp_monthly_goals FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));
CREATE TRIGGER t_gbp_goal_upd BEFORE UPDATE ON public.gbp_monthly_goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gbp_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'nap',
  title text NOT NULL,
  month date,
  file_path text,
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_reports TO authenticated;
GRANT ALL ON public.gbp_reports TO service_role;
ALTER TABLE public.gbp_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbp_report_select" ON public.gbp_reports FOR SELECT TO authenticated USING (public.can_view_client(client_id));
CREATE POLICY "gbp_report_write" ON public.gbp_reports FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));
CREATE TRIGGER t_gbp_report_upd BEFORE UPDATE ON public.gbp_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
