-- =============================================================
-- Plans module rebuild: versioned plans, monthly fees, services,
-- add-ons catalogue and custom plans. Additive + re-runnable.
-- No existing data is deleted; plan codes stay unchanged.
-- =============================================================

-- ---------- 1. Plan versions (terms live here) ----------
CREATE TABLE IF NOT EXISTS public.plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  code text NOT NULL,                -- mirrors plans.code (unchanged codes)
  name text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  effective_from date NOT NULL,
  effective_to date,
  monthly_retainer_inr numeric NOT NULL,   -- GST extra
  billing_basis text NOT NULL DEFAULT 'advance',
  invoice_day integer NOT NULL,
  due_day integer NOT NULL,
  notice_days integer NOT NULL,
  min_term_months integer NOT NULL DEFAULT 0,
  late_interest_pct numeric NOT NULL DEFAULT 0,
  annual_revision_pct numeric NOT NULL DEFAULT 10,
  auto_renew boolean NOT NULL DEFAULT true,
  team_incentive_pct numeric NOT NULL DEFAULT 0,  -- % of Alcor-generated revenue
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);
GRANT SELECT ON public.plan_versions TO authenticated;
GRANT ALL ON public.plan_versions TO service_role;
ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_versions_read ON public.plan_versions;
CREATE POLICY plan_versions_read ON public.plan_versions FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR my_client_id() IS NOT NULL);
DROP POLICY IF EXISTS plan_versions_write ON public.plan_versions;
CREATE POLICY plan_versions_write ON public.plan_versions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------- 2. Plan services (one row per service per plan version) ----------
CREATE TABLE IF NOT EXISTS public.plan_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id uuid NOT NULL REFERENCES public.plan_versions(id),
  service_name text NOT NULL,
  scope text,
  frequency text,
  pipeline_code text,               -- plain text; website_seo pipeline arrives later
  included boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (plan_version_id, service_name)
);
GRANT SELECT ON public.plan_services TO authenticated;
GRANT ALL ON public.plan_services TO service_role;
ALTER TABLE public.plan_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_services_read ON public.plan_services;
CREATE POLICY plan_services_read ON public.plan_services FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR my_client_id() IS NOT NULL);
DROP POLICY IF EXISTS plan_services_write ON public.plan_services;
CREATE POLICY plan_services_write ON public.plan_services FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------- 3. Add-ons catalogue ----------
CREATE TABLE IF NOT EXISTS public.addons_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_inr numeric,                -- NULL = vendor-priced
  price_type text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed','from','vendor')),
  billing text NOT NULL DEFAULT 'one_time' CHECK (billing IN ('one_time','monthly','vendor_direct')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.addons_catalogue TO authenticated;
GRANT ALL ON public.addons_catalogue TO service_role;
ALTER TABLE public.addons_catalogue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS addons_catalogue_read ON public.addons_catalogue;
CREATE POLICY addons_catalogue_read ON public.addons_catalogue FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR my_client_id() IS NOT NULL);
DROP POLICY IF EXISTS addons_catalogue_write ON public.addons_catalogue;
CREATE POLICY addons_catalogue_write ON public.addons_catalogue FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------- 4. Custom plans ----------
CREATE TABLE IF NOT EXISTS public.custom_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_plan_version_id uuid NOT NULL REFERENCES public.plan_versions(id),
  name text NOT NULL,
  created_by uuid,                  -- BDM who drafted it
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive')),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  -- money categories kept separate
  monthly_retainer_inr numeric,     -- fixed retainer
  commission_direct_pct numeric NOT NULL DEFAULT 0,
  commission_ota_pct numeric NOT NULL DEFAULT 0,
  commission_weddings_pct numeric NOT NULL DEFAULT 0,
  commission_other_pct numeric NOT NULL DEFAULT 0,
  setup_fee_inr numeric,            -- one-time fee
  addon_ids uuid[] NOT NULL DEFAULT '{}',
  contract_start date,
  contract_end date,
  payment_cycle text NOT NULL DEFAULT 'monthly' CHECK (payment_cycle IN ('monthly','quarterly','annual','milestone')),
  notice_days integer,
  termination_terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.custom_plans TO authenticated;
GRANT ALL ON public.custom_plans TO service_role;
ALTER TABLE public.custom_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_plans_read ON public.custom_plans;
CREATE POLICY custom_plans_read ON public.custom_plans FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS custom_plans_insert ON public.custom_plans;
CREATE POLICY custom_plans_insert ON public.custom_plans FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()) AND created_by = auth.uid());
DROP POLICY IF EXISTS custom_plans_update ON public.custom_plans;
CREATE POLICY custom_plans_update ON public.custom_plans FOR UPDATE TO authenticated
  USING (is_manager(auth.uid()) OR (created_by = auth.uid() AND approval_status <> 'approved'))
  WITH CHECK (is_manager(auth.uid()) OR (created_by = auth.uid() AND approval_status <> 'approved'));
-- no DELETE policy: custom plans are never deleted

-- Services of a custom plan (add/remove vs base)
CREATE TABLE IF NOT EXISTS public.custom_plan_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_plan_id uuid NOT NULL REFERENCES public.custom_plans(id),
  service_name text NOT NULL,
  scope text,
  frequency text,
  pipeline_code text,
  included boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (custom_plan_id, service_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_plan_services TO authenticated;
GRANT ALL ON public.custom_plan_services TO service_role;
ALTER TABLE public.custom_plan_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_plan_services_read ON public.custom_plan_services;
CREATE POLICY custom_plan_services_read ON public.custom_plan_services FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS custom_plan_services_write ON public.custom_plan_services;
CREATE POLICY custom_plan_services_write ON public.custom_plan_services FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.custom_plans cp
    WHERE cp.id = custom_plan_id
      AND (is_manager(auth.uid()) OR (cp.created_by = auth.uid() AND cp.approval_status <> 'approved'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.custom_plans cp
    WHERE cp.id = custom_plan_id
      AND (is_manager(auth.uid()) OR (cp.created_by = auth.uid() AND cp.approval_status <> 'approved'))
  ));

-- Approval rule: any discount / commission / term different from the base
-- version forces approval_status = pending.
CREATE OR REPLACE FUNCTION public.custom_plan_set_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base public.plan_versions%ROWTYPE;
BEGIN
  SELECT * INTO base FROM public.plan_versions WHERE id = NEW.base_plan_version_id;
  IF NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW; -- explicit management approval handled by guard trigger
  END IF;
  IF base.id IS NOT NULL AND (
       NEW.monthly_retainer_inr IS DISTINCT FROM base.monthly_retainer_inr
       OR COALESCE(NEW.commission_direct_pct,0) <> 0
       OR COALESCE(NEW.commission_ota_pct,0) <> 0
       OR COALESCE(NEW.commission_weddings_pct,0) <> 0
       OR COALESCE(NEW.commission_other_pct,0) <> 0
       OR COALESCE(NEW.setup_fee_inr,0) <> 0
       OR NEW.notice_days IS DISTINCT FROM base.notice_days
       OR NEW.payment_cycle IS DISTINCT FROM 'monthly'
       OR COALESCE(NEW.termination_terms,'') <> ''
     ) THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  ELSIF NEW.approval_status IS DISTINCT FROM 'rejected' THEN
    NEW.approval_status := 'approved'; -- identical to base terms: nothing to approve
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS custom_plan_set_approval ON public.custom_plans;
CREATE TRIGGER custom_plan_set_approval BEFORE INSERT OR UPDATE ON public.custom_plans
  FOR EACH ROW EXECUTE FUNCTION public.custom_plan_set_approval();

-- Only management/admin may set approval_status = 'approved'.
CREATE OR REPLACE FUNCTION public.custom_plan_approval_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM 'approved'
     AND NOT is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only management or admin can approve a custom plan';
  END IF;
  IF NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM 'approved' THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS custom_plan_approval_guard ON public.custom_plans;
CREATE TRIGGER custom_plan_approval_guard BEFORE UPDATE ON public.custom_plans
  FOR EACH ROW EXECUTE FUNCTION public.custom_plan_approval_guard();

-- Editing a custom plan's services after approval sends it back to pending.
CREATE OR REPLACE FUNCTION public.custom_plan_services_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid := COALESCE(NEW.custom_plan_id, OLD.custom_plan_id);
BEGIN
  UPDATE public.custom_plans
     SET approval_status = 'pending', approved_by = NULL, approved_at = NULL
   WHERE id = cid AND approval_status = 'approved' AND NOT is_manager(auth.uid());
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS custom_plan_services_touch ON public.custom_plan_services;
CREATE TRIGGER custom_plan_services_touch AFTER INSERT OR UPDATE OR DELETE ON public.custom_plan_services
  FOR EACH ROW EXECUTE FUNCTION public.custom_plan_services_touch();
REVOKE ALL ON FUNCTION public.custom_plan_set_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.custom_plan_approval_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.custom_plan_services_touch() FROM PUBLIC, anon, authenticated;

-- ---------- 5. Fees become monthly; quarterly_fee_inr = 3 x monthly (legacy) ----------
UPDATE public.plans SET fee_inr = 25000,  billing_period = 'monthly', notice_days = 60, min_term_months = 0 WHERE code = 'diamond_start';
UPDATE public.plans SET fee_inr = 45000,  billing_period = 'monthly', notice_days = 60, min_term_months = 0 WHERE code = 'diamond_grow';
UPDATE public.plans SET fee_inr = 75000,  billing_period = 'monthly', notice_days = 60, min_term_months = 0 WHERE code = 'diamond_scale';
UPDATE public.plans SET fee_inr = 12000,  billing_period = 'monthly', notice_days = 90, min_term_months = 3 WHERE code = 'gmb_seo';
UPDATE public.plans SET quarterly_fee_inr = fee_inr * 3;

-- Keep the legacy quarterly column in sync forever (3 x monthly).
CREATE OR REPLACE FUNCTION public.plans_fee_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.quarterly_fee_inr := NEW.fee_inr * 3;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS plans_fee_sync ON public.plans;
CREATE TRIGGER plans_fee_sync BEFORE INSERT OR UPDATE OF fee_inr ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plans_fee_sync();

-- ---------- 6. Seed the four signed standard plan versions ----------
INSERT INTO public.plan_versions (plan_id, code, name, version, status, effective_from,
  monthly_retainer_inr, billing_basis, invoice_day, due_day, notice_days, min_term_months,
  late_interest_pct, annual_revision_pct, auto_renew, team_incentive_pct)
SELECT p.id, p.code, p.name, 1, 'active', DATE '2026-10-23',
  v.retainer, 'advance', 1, v.due_day, v.notice, v.min_term, v.late, 10, true, v.incentive
FROM public.plans p
JOIN (VALUES
  ('gmb_seo',       12000, 15, 90, 3, 18, 0),
  ('diamond_start', 25000,  7, 60, 0,  0, 2),
  ('diamond_grow',  45000,  7, 60, 0,  0, 2),
  ('diamond_scale', 75000,  7, 60, 0,  0, 2)
) AS v(code, retainer, due_day, notice, min_term, late, incentive) ON v.code = p.code
ON CONFLICT (plan_id, version) DO NOTHING;

-- ---------- 7. Seed plan services ----------
INSERT INTO public.plan_services (plan_version_id, service_name, scope, frequency, pipeline_code, included, sort_order)
SELECT pv.id, s.service_name, s.scope, s.frequency, s.pipeline_code, true, s.sort_order
FROM public.plan_versions pv
JOIN (VALUES
  ('gmb_seo','GMB SEO','Google Business Profile optimisation and local SEO','monthly','gbp',1),
  ('diamond_start','Rate Strategy','Pricing and rate planning','monthly','ota',1),
  ('diamond_start','Website Audit & CRO','Website audit and conversion-rate optimisation','one_time','website_seo',2),
  ('diamond_start','GMB SEO','Google Business Profile optimisation and local SEO','monthly','gbp',3),
  ('diamond_start','Social Media','Organic social media management','monthly','social_media',4),
  ('diamond_start','OTA Management','OTA listing and channel management','monthly','ota',5),
  ('diamond_start','Meta Ads','Meta (Facebook/Instagram) advertising','monthly','performance_marketing',6),
  ('diamond_grow','Rate Strategy','Pricing and rate planning','monthly','ota',1),
  ('diamond_grow','Website Audit & CRO','Website audit and conversion-rate optimisation','one_time','website_seo',2),
  ('diamond_grow','GMB SEO','Google Business Profile optimisation and local SEO','monthly','gbp',3),
  ('diamond_grow','Social Media','Organic social media management','monthly','social_media',4),
  ('diamond_grow','OTA Management','OTA listing and channel management','monthly','ota',5),
  ('diamond_grow','Meta Ads','Meta (Facebook/Instagram) advertising','monthly','performance_marketing',6),
  ('diamond_grow','Google Ads','Google search and display advertising','monthly','performance_marketing',7),
  ('diamond_grow','TA Connect – B2B email','B2B email outreach to travel agents','monthly','email_marketing',8),
  ('diamond_grow','Influencer','Influencer partnerships and collaborations','monthly','influencer',9),
  ('diamond_scale','Rate Strategy','Pricing and rate planning','monthly','ota',1),
  ('diamond_scale','Website Audit & CRO','Website audit and conversion-rate optimisation','one_time','website_seo',2),
  ('diamond_scale','GMB SEO','Google Business Profile optimisation and local SEO','monthly','gbp',3),
  ('diamond_scale','Social Media','Organic social media management','monthly','social_media',4),
  ('diamond_scale','OTA Management','OTA listing and channel management','monthly','ota',5),
  ('diamond_scale','Meta Ads','Meta (Facebook/Instagram) advertising','monthly','performance_marketing',6),
  ('diamond_scale','Google Ads','Google search and display advertising','monthly','performance_marketing',7),
  ('diamond_scale','TA Connect – B2B email','B2B email outreach to travel agents','monthly','email_marketing',8),
  ('diamond_scale','Influencer','Influencer partnerships and collaborations','monthly','influencer',9),
  ('diamond_scale','Virtual Reservations Desk','Centralised reservations and enquiry handling','monthly','reservations_desk',10),
  ('diamond_scale','WhatsApp Automation & Drip','WhatsApp automation and drip campaigns','monthly','whatsapp',11)
) AS s(code, service_name, scope, frequency, pipeline_code, sort_order) ON s.code = pv.code
WHERE pv.version = 1
ON CONFLICT (plan_version_id, service_name) DO NOTHING;

-- ---------- 8. Seed add-ons catalogue ----------
INSERT INTO public.addons_catalogue (code, name, description, price_inr, price_type, billing, sort_order) VALUES
  ('website_development','Website development','Hotel website design and development',15000,'from','one_time',1),
  ('marketing_funnel','Marketing funnel','Marketing funnel setup',10000,'fixed','one_time',2),
  ('crm','CRM','CRM subscription — vendor-priced, paid directly to the vendor',NULL,'vendor','vendor_direct',3)
ON CONFLICT (code) DO NOTHING;
