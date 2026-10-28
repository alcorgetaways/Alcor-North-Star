CREATE OR REPLACE FUNCTION public.custom_plan_set_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base public.plan_versions%ROWTYPE;
BEGIN
  -- Explicit management decisions (approve / reject) pass through untouched.
  IF TG_OP = 'UPDATE'
     AND NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NEW.approval_status IN ('approved','rejected') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO base FROM public.plan_versions WHERE id = NEW.base_plan_version_id;
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
  ELSE
    NEW.approval_status := 'approved'; -- identical to base terms: nothing to approve
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.custom_plan_set_approval() FROM PUBLIC, anon, authenticated;