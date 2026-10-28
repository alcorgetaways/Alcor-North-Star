-- Review fix: commercial launch columns readable only via can_view_commercials or the owner (retainer only).

CREATE OR REPLACE FUNCTION public.can_view_commercials(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','management','bd_manager','finance')
  );
$$;

REVOKE SELECT ON public.client_launches FROM authenticated;
GRANT SELECT (
  id, client_id, plan_id, addons, crm_option, meta_budget_daily, google_budget_daily,
  status, day0_date, launch_date, activated_at, activated_by, created_by, created_at, updated_at,
  upgraded_from_launch_id, advance_received_at, notice_date, notice_from, notice_reason, notice_file_path,
  exit_date, closed_at, closed_reason, change_kind, previous_status, plan_version_id, custom_plan_id,
  snapshot_addon_ids, contract_start, contract_end, renewal_date, notice_deadline, closing_reason_code,
  bd_owner_id, internal_owner_id
) ON public.client_launches TO authenticated;

CREATE OR REPLACE FUNCTION public.launch_commercials(_launch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.client_launches%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.client_launches WHERE id = _launch_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.can_view_commercials(auth.uid()) THEN
    RETURN jsonb_build_object(
      'retainer_inr', l.retainer_inr,
      'commission_direct_pct', l.commission_direct_pct,
      'commission_ota_pct', l.commission_ota_pct,
      'commission_weddings_pct', l.commission_weddings_pct,
      'commission_other_pct', l.commission_other_pct,
      'setup_fee_inr', l.setup_fee_inr,
      'deposit_inr', l.deposit_inr,
      'advance_amount', l.advance_amount,
      'quarterly_fee_inr', l.quarterly_fee_inr,
      'payment_reference', l.payment_reference,
      'payment_screenshot_path', l.payment_screenshot_path);
  END IF;
  IF public.my_client_id() = l.client_id THEN
    RETURN jsonb_build_object('retainer_inr', l.retainer_inr);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.launch_commercials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.launch_commercials(uuid) TO authenticated;