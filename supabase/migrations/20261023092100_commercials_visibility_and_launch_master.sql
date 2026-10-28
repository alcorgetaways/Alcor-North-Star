-- Prompt 2 (part 1): commercials visibility fix + client master record. Additive + re-runnable.

CREATE OR REPLACE FUNCTION public.can_view_commercials(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','management','bd_manager')
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_commercials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_commercials(uuid) TO authenticated;

DROP POLICY IF EXISTS custom_plans_read ON public.custom_plans;
CREATE POLICY custom_plans_read ON public.custom_plans FOR SELECT TO authenticated
  USING (public.can_view_commercials(auth.uid()));

DROP POLICY IF EXISTS custom_plan_services_read ON public.custom_plan_services;
CREATE POLICY custom_plan_services_read ON public.custom_plan_services FOR SELECT TO authenticated
  USING (public.can_view_commercials(auth.uid()));

CREATE TABLE IF NOT EXISTS public.closing_reasons (
  code text PRIMARY KEY,
  label text NOT NULL,
  is_churn boolean NOT NULL DEFAULT false,
  requires_notes boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.closing_reasons TO authenticated;
GRANT ALL ON public.closing_reasons TO service_role;
ALTER TABLE public.closing_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS closing_reasons_read ON public.closing_reasons;
CREATE POLICY closing_reasons_read ON public.closing_reasons FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

INSERT INTO public.closing_reasons (code, label, is_churn, requires_notes, sort_order) VALUES
  ('client_discontinued','Client discontinued', true, false, 1),
  ('non_payment','Non-payment', true, false, 2),
  ('contract_expired','Contract expired without renewal', true, false, 3),
  ('moved_to_another_provider','Moved to another provider', true, false, 4),
  ('mutual_termination','Mutual termination', false, false, 5),
  ('business_closure','Business / property closure', false, false, 6),
  ('other','Other', false, true, 7)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, is_churn = EXCLUDED.is_churn,
  requires_notes = EXCLUDED.requires_notes, sort_order = EXCLUDED.sort_order;

ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS plan_version_id uuid REFERENCES public.plan_versions(id);
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS custom_plan_id uuid REFERENCES public.custom_plans(id);
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS retainer_inr numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS commission_direct_pct numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS commission_ota_pct numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS commission_weddings_pct numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS commission_other_pct numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS setup_fee_inr numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS snapshot_addon_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS deposit_inr numeric;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS contract_start date;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS contract_end date;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS renewal_date date;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS notice_deadline date;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS closing_reason_code text REFERENCES public.closing_reasons(code);
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS bd_owner_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS internal_owner_id uuid REFERENCES public.profiles(id);

ALTER TABLE public.client_launches DROP CONSTRAINT IF EXISTS client_launches_status_check;
ALTER TABLE public.client_launches ADD CONSTRAINT client_launches_status_check
  CHECK (status IN ('draft','proposed','awaiting_day0','active','on_hold','live','offboarding','completed','cancelled','closed'));

CREATE OR REPLACE FUNCTION public.client_launch_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pv public.plan_versions%ROWTYPE;
  cp public.custom_plans%ROWTYPE;
  v_notice_days integer;
BEGIN
  IF NEW.plan_version_id IS NULL AND NEW.plan_id IS NOT NULL AND NEW.custom_plan_id IS NULL THEN
    SELECT * INTO pv FROM public.plan_versions
    WHERE plan_id = NEW.plan_id AND status = 'active'
    ORDER BY version DESC LIMIT 1;
    IF pv.id IS NOT NULL THEN
      NEW.plan_version_id := pv.id;
      NEW.retainer_inr := COALESCE(NEW.retainer_inr, pv.monthly_retainer_inr);
      NEW.commission_direct_pct := COALESCE(NEW.commission_direct_pct, 0);
      NEW.commission_ota_pct := COALESCE(NEW.commission_ota_pct, 0);
      NEW.commission_weddings_pct := COALESCE(NEW.commission_weddings_pct, 0);
      NEW.commission_other_pct := COALESCE(NEW.commission_other_pct, 0);
      v_notice_days := pv.notice_days;
    END IF;
  END IF;

  IF NEW.custom_plan_id IS NOT NULL THEN
    SELECT * INTO cp FROM public.custom_plans WHERE id = NEW.custom_plan_id;
    IF cp.id IS NOT NULL THEN
      NEW.plan_version_id := COALESCE(NEW.plan_version_id, cp.base_plan_version_id);
      NEW.retainer_inr := COALESCE(NEW.retainer_inr, cp.monthly_retainer_inr);
      NEW.commission_direct_pct := COALESCE(NEW.commission_direct_pct, cp.commission_direct_pct);
      NEW.commission_ota_pct := COALESCE(NEW.commission_ota_pct, cp.commission_ota_pct);
      NEW.commission_weddings_pct := COALESCE(NEW.commission_weddings_pct, cp.commission_weddings_pct);
      NEW.commission_other_pct := COALESCE(NEW.commission_other_pct, cp.commission_other_pct);
      NEW.setup_fee_inr := COALESCE(NEW.setup_fee_inr, cp.setup_fee_inr);
      NEW.snapshot_addon_ids := CASE WHEN array_length(NEW.snapshot_addon_ids,1) IS NULL THEN cp.addon_ids ELSE NEW.snapshot_addon_ids END;
      NEW.contract_start := COALESCE(NEW.contract_start, cp.contract_start);
      NEW.contract_end := COALESCE(NEW.contract_end, cp.contract_end);
      v_notice_days := COALESCE(cp.notice_days, (SELECT notice_days FROM public.plan_versions WHERE id = cp.base_plan_version_id));
    END IF;
  END IF;

  IF NEW.contract_end IS NOT NULL
     AND (NEW.renewal_date IS NULL OR NEW.contract_end IS DISTINCT FROM OLD.contract_end) THEN
    NEW.renewal_date := NEW.contract_end;
    NEW.notice_deadline := NEW.contract_end - COALESCE(v_notice_days,
      (SELECT notice_days FROM public.plan_versions WHERE id = NEW.plan_version_id), 0);
  END IF;

  IF NEW.status IN ('closed','completed','cancelled')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.closing_reason_code IS NULL THEN
    NEW.closing_reason_code := 'other';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.client_launch_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS client_launch_snapshot ON public.client_launches;
CREATE TRIGGER client_launch_snapshot
  BEFORE INSERT OR UPDATE ON public.client_launches
  FOR EACH ROW EXECUTE FUNCTION public.client_launch_snapshot();

UPDATE public.client_launches l
SET plan_version_id = pv.id, retainer_inr = pv.monthly_retainer_inr
FROM public.plan_versions pv
WHERE l.plan_version_id IS NULL AND l.plan_id = pv.plan_id
  AND pv.status = 'active'
  AND pv.version = (SELECT max(version) FROM public.plan_versions x WHERE x.plan_id = l.plan_id AND x.status = 'active');

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS parent_client_id uuid REFERENCES public.clients(id);
CREATE INDEX IF NOT EXISTS clients_parent_client_id_idx ON public.clients(parent_client_id);

CREATE OR REPLACE FUNCTION public.can_view_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_manager(auth.uid())
      OR public.has_role(auth.uid(),'bd_manager')
      OR public.my_client_id() = _client_id
      OR EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = _client_id AND c.parent_client_id = public.my_client_id())
      OR EXISTS (SELECT 1 FROM public.client_pipelines cp
                 WHERE cp.client_id = _client_id
                   AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.client_module_assignments a
                 WHERE a.client_id = _client_id
                   AND (a.primary_user_id = auth.uid() OR a.backup_user_id = auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.can_view_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_client(uuid) TO authenticated;