-- Stage 3b: editable third-party costs, demo implies test, booking void (no hard deletes), login emails.
ALTER TABLE public.client_launches
  ADD COLUMN IF NOT EXISTS third_party_costs text,
  ADD COLUMN IF NOT EXISTS third_party_cost_items text[];

CREATE OR REPLACE FUNCTION public.demo_implies_test() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN IF NEW.is_demo THEN NEW.is_test := true; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS t_clients_demo_implies_test ON public.clients;
CREATE TRIGGER t_clients_demo_implies_test BEFORE INSERT OR UPDATE OF is_demo, is_test ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.demo_implies_test();
UPDATE public.clients SET is_test = true WHERE is_demo AND NOT is_test;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;
REVOKE DELETE, TRUNCATE ON public.bookings, public.booking_guest_contacts FROM authenticated, anon;
ALTER TABLE public.booking_guest_contacts DROP CONSTRAINT IF EXISTS booking_guest_contacts_booking_id_fkey;
ALTER TABLE public.booking_guest_contacts ADD CONSTRAINT booking_guest_contacts_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION public.block_hard_delete() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN RAISE EXCEPTION 'Bookings cannot be deleted — void them with a reason instead'; END $$;
DROP TRIGGER IF EXISTS t_bookings_no_delete ON public.bookings;
CREATE TRIGGER t_bookings_no_delete BEFORE DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.block_hard_delete();
DROP TRIGGER IF EXISTS t_booking_contacts_no_delete ON public.booking_guest_contacts;
CREATE TRIGGER t_booking_contacts_no_delete BEFORE DELETE ON public.booking_guest_contacts FOR EACH ROW EXECUTE FUNCTION public.block_hard_delete();
CREATE OR REPLACE FUNCTION public.guard_booking_void() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF current_setting('north_star.voiding', true) IS DISTINCT FROM 'on'
     AND (NEW.voided_at IS DISTINCT FROM OLD.voided_at OR NEW.voided_by IS DISTINCT FROM OLD.voided_by OR NEW.void_reason IS DISTINCT FROM OLD.void_reason) THEN
    RAISE EXCEPTION 'Use "Void booking" to void a booking';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN NEW.status := 'CANCELLED'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_bookings_guard_void ON public.bookings;
CREATE TRIGGER t_bookings_guard_void BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_booking_void();

CREATE OR REPLACE FUNCTION public.void_booking(_booking_id uuid, _reason text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only Finance or admin can void a booking';
  END IF;
  IF coalesce(btrim(_reason), '') = '' OR length(_reason) > 500 THEN RAISE EXCEPTION 'Give a reason (up to 500 characters)'; END IF;
  PERFORM set_config('north_star.voiding', 'on', true);
  UPDATE public.bookings SET status = 'CANCELLED', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(_reason)
   WHERE id = _booking_id AND voided_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or already voided'; END IF;
  PERFORM set_config('north_star.voiding', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public.void_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_booking(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_third_party_change(_launch_id uuid, _costs text, _items text[], _reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE l public.client_launches%ROWTYPE; v_mgr boolean := public.is_manager(auth.uid()); v_id uuid; v_terms jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (v_mgr OR public.has_role(auth.uid(), 'bd_manager')) THEN
    RAISE EXCEPTION 'Only admin, management or BD can edit commercial terms';
  END IF;
  SELECT * INTO l FROM public.client_launches WHERE id = _launch_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF l.status NOT IN ('active','live','on_hold','draft','proposed','awaiting_day0') THEN
    RAISE EXCEPTION 'Closed launches keep their terms as history and cannot be edited';
  END IF;
  IF coalesce(btrim(_costs), '') = '' OR length(_costs) > 500 THEN RAISE EXCEPTION 'Describe who pays third-party costs (up to 500 characters)'; END IF;
  IF coalesce(array_length(_items, 1), 0) > 30 THEN RAISE EXCEPTION 'Too many cost items'; END IF;
  IF EXISTS (SELECT 1 FROM public.commercial_term_changes WHERE launch_id = _launch_id AND status = 'pending') THEN
    RAISE EXCEPTION 'A change for this launch is already waiting for management approval';
  END IF;
  v_terms := jsonb_build_object('third_party_costs', btrim(_costs),
    'third_party_cost_items', to_jsonb(ARRAY(SELECT btrim(x) FROM unnest(coalesce(_items, '{}')) x WHERE btrim(x) <> '')));
  INSERT INTO public.commercial_term_changes (launch_id, client_id, old_terms, new_terms, reason, requested_by, decided_by, decided_at)
  VALUES (_launch_id, l.client_id, public._launch_terms(_launch_id), v_terms, _reason, auth.uid(),
          CASE WHEN v_mgr THEN auth.uid() END, CASE WHEN v_mgr THEN now() END)
  RETURNING id INTO v_id;
  IF v_mgr THEN PERFORM public._apply_term_change(v_id); END IF;
  PERFORM public.log_admin_action(auth.uid(), 'commercial_terms_' || CASE WHEN v_mgr THEN 'applied' ELSE 'requested' END,
    'client_launch', _launch_id::text, 'ok', jsonb_build_object('change_id', v_id, 'new_terms', v_terms));
  RETURN jsonb_build_object('id', v_id, 'status', CASE WHEN v_mgr THEN 'applied' ELSE 'pending' END);
END $$;
REVOKE ALL ON FUNCTION public.request_third_party_change(uuid, text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_third_party_change(uuid, text, text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.term_change_apply_third_party() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t jsonb := NEW.new_terms; v_items text[];
BEGIN
  IF NEW.status <> 'applied' OR OLD.status = 'applied' OR NOT (t ?| ARRAY['third_party_costs','third_party_cost_items']) THEN RETURN NEW; END IF;
  IF t ? 'third_party_cost_items' THEN v_items := ARRAY(SELECT jsonb_array_elements_text(t->'third_party_cost_items')); END IF;
  UPDATE public.client_launches SET
    third_party_costs = CASE WHEN t ? 'third_party_costs' THEN t->>'third_party_costs' ELSE third_party_costs END,
    third_party_cost_items = CASE WHEN t ? 'third_party_cost_items' THEN v_items ELSE third_party_cost_items END
  WHERE id = NEW.launch_id;
  UPDATE public.custom_plans cp SET
    third_party_costs = CASE WHEN t ? 'third_party_costs' THEN t->>'third_party_costs' ELSE cp.third_party_costs END,
    third_party_cost_items = CASE WHEN t ? 'third_party_cost_items' THEN v_items ELSE cp.third_party_cost_items END
  FROM public.client_launches l WHERE l.id = NEW.launch_id AND cp.id = l.custom_plan_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.term_change_apply_third_party() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS t_term_change_third_party ON public.commercial_term_changes;
CREATE TRIGGER t_term_change_third_party AFTER UPDATE OF status ON public.commercial_term_changes
  FOR EACH ROW EXECUTE FUNCTION public.term_change_apply_third_party();

CREATE OR REPLACE FUNCTION public._launch_terms(_launch_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'retainer_inr', l.retainer_inr,
    'commission_direct_pct', l.commission_direct_pct,
    'commission_ota_pct', l.commission_ota_pct,
    'commission_weddings_pct', l.commission_weddings_pct,
    'setup_fee_inr', l.setup_fee_inr,
    'contract_start', l.contract_start,
    'contract_end', l.contract_end,
    'notice_days', coalesce(l.notice_days, cp.notice_days, pv.notice_days),
    'payment_cycle', coalesce(l.payment_cycle, cp.payment_cycle),
    'billing_basis', coalesce(l.billing_basis, pv.billing_basis),
    'invoice_day', coalesce(l.invoice_day, pv.invoice_day),
    'due_day', coalesce(l.due_day, pv.due_day),
    'late_interest_pct', coalesce(l.late_interest_pct, pv.late_interest_pct),
    'min_term_months', coalesce(l.min_term_months, pv.min_term_months),
    'annual_revision_applicable', coalesce(l.annual_revision_applicable, coalesce(pv.annual_revision_pct, 0) > 0),
    'team_incentive_pct', coalesce(l.team_incentive_pct, pv.team_incentive_pct),
    'commission_reconcile_day', l.commission_reconcile_day,
    'booking_advances_via_alcor', l.booking_advances_via_alcor,
    'auto_renew', coalesce(l.auto_renew, pv.auto_renew),
    'contract_signed_on', l.contract_signed_on,
    'contract_reference', l.contract_reference,
    'annual_revision_pct', CASE WHEN l.annual_revision_applicable IS FALSE THEN NULL ELSE coalesce(l.annual_revision_pct, pv.annual_revision_pct) END,
    'third_party_costs', coalesce(l.third_party_costs, cp.third_party_costs, pv.third_party_costs),
    'third_party_cost_items', to_jsonb(coalesce(l.third_party_cost_items, cp.third_party_cost_items, pv.third_party_cost_items)),
    'recurring_fees', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'monthly_inr', f.monthly_inr,
                         'starts_on', f.starts_on, 'ends_on', f.ends_on) ORDER BY f.starts_on, f.name), '[]'::jsonb)
                       FROM public.launch_recurring_fees f WHERE f.launch_id = l.id))
  FROM public.client_launches l
  LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
  LEFT JOIN public.plan_versions pv ON pv.id = l.plan_version_id
  WHERE l.id = _launch_id
$function$;

-- Login emails + global send switch (off until the owner releases). Passwords are never stored.
INSERT INTO public.app_settings (key, value) VALUES ('email_sending_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.login_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  to_address text NOT NULL,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual','bulk_staff','test')),
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  failed_at timestamptz
);
CREATE INDEX IF NOT EXISTS login_emails_pending_idx ON public.login_emails (created_at) WHERE sent_at IS NULL AND failed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS login_emails_one_auto ON public.login_emails (user_id) WHERE source = 'auto';
GRANT SELECT ON public.login_emails TO authenticated;
GRANT ALL ON public.login_emails TO service_role;
REVOKE ALL ON public.login_emails FROM anon;
ALTER TABLE public.login_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read login emails" ON public.login_emails;
CREATE POLICY "Admins read login emails" ON public.login_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.queue_login_email_for_new_user() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_email text; v_created timestamptz;
BEGIN
  SELECT email, created_at INTO v_email, v_created FROM public.profiles WHERE id = NEW.user_id;
  IF v_email IS NULL OR v_created < now() - interval '1 day' THEN RETURN NEW; END IF;
  INSERT INTO public.login_emails (user_id, to_address, source) VALUES (NEW.user_id, v_email, 'auto')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_login_email_for_new_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS t_user_roles_login_email ON public.user_roles;
CREATE TRIGGER t_user_roles_login_email AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.queue_login_email_for_new_user();