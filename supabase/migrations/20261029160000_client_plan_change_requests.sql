-- Custom pipeline and plan quote requests. Additive only; does not alter existing launches or client data.
CREATE TABLE IF NOT EXISTS public.client_plan_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  from_launch_id uuid NOT NULL REFERENCES public.client_launches(id),
  requested_plan_code text NOT NULL REFERENCES public.plans(code),
  requested_plan_name text NOT NULL,
  requested_pipeline_quotes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requested_pipeline_quotes) = 'array'),
  base_monthly_inr numeric NOT NULL CHECK (base_monthly_inr >= 0),
  quoted_monthly_inr numeric NOT NULL CHECK (quoted_monthly_inr >= 0),
  setup_fee_inr numeric NOT NULL DEFAULT 0 CHECK (setup_fee_inr >= 0),
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);

CREATE INDEX IF NOT EXISTS client_plan_change_requests_client_created_idx
  ON public.client_plan_change_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_plan_change_requests_status_created_idx
  ON public.client_plan_change_requests (status, created_at DESC);

ALTER TABLE public.client_plan_change_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.client_plan_change_requests TO authenticated;
GRANT ALL ON public.client_plan_change_requests TO service_role;
REVOKE DELETE ON public.client_plan_change_requests FROM authenticated, anon;

CREATE POLICY client_plan_change_requests_read ON public.client_plan_change_requests
  FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR created_by = auth.uid());

CREATE POLICY client_plan_change_requests_insert ON public.client_plan_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_edit_client(client_id)
    AND status = 'pending'
  );

CREATE POLICY client_plan_change_requests_decide ON public.client_plan_change_requests
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()) AND status = 'pending')
  WITH CHECK (
    public.is_manager(auth.uid())
    AND status IN ('approved','rejected')
    AND decided_by = auth.uid()
    AND decided_at IS NOT NULL
  );

