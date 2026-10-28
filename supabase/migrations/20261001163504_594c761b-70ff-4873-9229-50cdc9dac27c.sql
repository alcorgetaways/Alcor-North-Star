INSERT INTO public.pipelines (code, name, default_weight, sort_order, active)
SELECT v.code, v.name, 1, v.so, true FROM (VALUES
  ('email_marketing','Email Marketing',8),
  ('corporate_comms','Corporate Communication',9),
  ('reservations_desk','Reservations Desk',10)) AS v(code,name,so)
WHERE NOT EXISTS (SELECT 1 FROM public.pipelines p WHERE p.code = v.code);

ALTER TABLE public.social_kpi_entries
  ADD COLUMN IF NOT EXISTS engagement integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_followers integer NOT NULL DEFAULT 0;

ALTER TABLE public.gbp_kpi_entries
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direction_requests integer NOT NULL DEFAULT 0;

-- OTA monthly records
ALTER TABLE public.ota_records ALTER COLUMN report_id DROP NOT NULL;
ALTER TABLE public.ota_records
  ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN client_pipeline_id uuid REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  ADD COLUMN month date,
  ADD COLUMN live_channels integer NOT NULL DEFAULT 0,
  ADD COLUMN new_channels integer NOT NULL DEFAULT 0,
  ADD COLUMN active_channels integer NOT NULL DEFAULT 0,
  ADD COLUMN content_score numeric,
  ADD COLUMN reputation_score numeric,
  ADD COLUMN bookings integer,
  ADD COLUMN notes text,
  ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN created_by uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.ota_records ALTER COLUMN ota_name SET DEFAULT 'All OTAs';
CREATE UNIQUE INDEX ota_records_cp_month_ota ON public.ota_records (client_pipeline_id, month, ota_name) WHERE client_pipeline_id IS NOT NULL;
CREATE TRIGGER t_ota_upd BEFORE UPDATE ON public.ota_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Generic monthly pipeline KPI entries
CREATE TABLE public.pipeline_kpi_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  month date NOT NULL,
  channel text NOT NULL DEFAULT '',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_pipeline_id, month, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_kpi_entries TO authenticated;
GRANT ALL ON public.pipeline_kpi_entries TO service_role;
ALTER TABLE public.pipeline_kpi_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER t_pke_upd BEFORE UPDATE ON public.pipeline_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Approval guard shared by both tables: only management may approve; edits re-open approval
CREATE OR REPLACE FUNCTION public.kpi_approval_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_manager(auth.uid()) THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    RAISE EXCEPTION 'Only management can approve KPI entries';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    NEW.status := 'submitted'; NEW.approved_by := NULL; NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.kpi_approval_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER t_pke_guard BEFORE INSERT OR UPDATE ON public.pipeline_kpi_entries FOR EACH ROW EXECUTE FUNCTION public.kpi_approval_guard();
CREATE TRIGGER t_ota_guard BEFORE INSERT OR UPDATE ON public.ota_records FOR EACH ROW WHEN (NEW.client_pipeline_id IS NOT NULL) EXECUTE FUNCTION public.kpi_approval_guard();

CREATE POLICY "pke staff read" ON public.pipeline_kpi_entries FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "pke client read approved" ON public.pipeline_kpi_entries FOR SELECT TO authenticated
  USING (status = 'approved' AND client_id = public.my_client_id());
CREATE POLICY "pke write" ON public.pipeline_kpi_entries FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));

-- OTA policies: keep report-based rows, add monthly rows
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ota_records' LOOP
    EXECUTE format('DROP POLICY %I ON public.ota_records', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "ota read" ON public.ota_records FOR SELECT TO authenticated USING (
  (report_id IS NOT NULL AND public.report_visible(report_id))
  OR (client_id IS NOT NULL AND public.is_staff(auth.uid()) AND public.can_view_client(client_id))
  OR (client_id IS NOT NULL AND status = 'approved' AND client_id = public.my_client_id()));
CREATE POLICY "ota write" ON public.ota_records FOR ALL TO authenticated
  USING ((report_id IS NOT NULL AND public.report_editable(report_id))
    OR (client_pipeline_id IS NOT NULL AND (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))))
  WITH CHECK ((report_id IS NOT NULL AND public.report_editable(report_id))
    OR (client_pipeline_id IS NOT NULL AND (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))));