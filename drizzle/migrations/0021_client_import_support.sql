ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS import_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS source_row integer;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS contract_start_approx boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_launches ADD COLUMN IF NOT EXISTS import_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS client_launches_source_row_key ON public.client_launches (source_row) WHERE source_row IS NOT NULL;
ALTER TABLE public.custom_plans ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.custom_plan_approval_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM 'approved' THEN
    IF NOT (public.is_manager(auth.uid()) OR COALESCE(auth.jwt()->>'role','') = 'service_role') THEN
      RAISE EXCEPTION 'Only management or admin can approve a custom plan';
    END IF;
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.launch_reporting_counts()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN jsonb_build_object(
    'unique_clients', (SELECT count(DISTINCT l.client_id) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test),
    'active_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status IN ('active','live','on_hold','offboarding')),
    'closed_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status = 'closed'),
    'churned_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id JOIN public.closing_reasons r ON r.code = l.closing_reason_code WHERE NOT c.is_test AND l.status IN ('closed','completed') AND r.is_churn),
    'completed_launches', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status = 'completed'),
    'cancelled_before_start', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND l.status = 'cancelled' AND l.activated_at IS NULL),
    'returning_clients', (SELECT count(*) FROM (SELECT l.client_id FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test GROUP BY l.client_id HAVING count(*) > 1) x),
    'upgrades', (SELECT count(*) FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id WHERE NOT c.is_test AND (l.change_kind IN ('upgrade','plan_change') OR l.upgraded_from_launch_id IS NOT NULL))
  );
END
$function$;