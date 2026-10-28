CREATE TABLE public.weekly_kpi_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  ad_spend numeric NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  campaigns_live integer NOT NULL DEFAULT 0,
  cost_per_lead numeric GENERATED ALWAYS AS (CASE WHEN leads > 0 THEN ad_spend / leads ELSE NULL END) STORED,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_pipeline_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_kpi_entries TO authenticated;
GRANT ALL ON public.weekly_kpi_entries TO service_role;

ALTER TABLE public.weekly_kpi_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_select" ON public.weekly_kpi_entries
FOR SELECT TO authenticated
USING (public.can_view_client(client_id));

CREATE POLICY "weekly_write" ON public.weekly_kpi_entries
FOR ALL TO authenticated
USING (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))
WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));

CREATE TRIGGER t_weekly_upd BEFORE UPDATE ON public.weekly_kpi_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_weekly_client_week ON public.weekly_kpi_entries (client_id, week_start DESC);