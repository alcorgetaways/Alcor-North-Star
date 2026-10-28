-- Relaunch must treat completed/cancelled launches as closed (new status set).
CREATE OR REPLACE FUNCTION public.relaunch_client(_client_id uuid, _plan_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE np public.plans; last public.client_launches; new_id uuid;
BEGIN
  IF NOT can_edit_client(_client_id) THEN RAISE EXCEPTION 'Only BD or management can re-launch a client'; END IF;
  IF EXISTS (SELECT 1 FROM client_launches WHERE client_id = _client_id AND status NOT IN ('closed','completed','cancelled')) THEN
    RAISE EXCEPTION 'This client still has an open launch';
  END IF;
  SELECT * INTO np FROM plans WHERE code = _plan_code AND active;
  IF np.id IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _plan_code; END IF;
  SELECT * INTO last FROM client_launches WHERE client_id = _client_id ORDER BY created_at DESC LIMIT 1;
  INSERT INTO client_launches (client_id, plan_id, upgraded_from_launch_id, change_kind, quarterly_fee_inr, created_by)
  VALUES (_client_id, np.id, last.id, CASE WHEN last.id IS NULL THEN NULL ELSE 'relaunch' END, np.quarterly_fee_inr, auth.uid())
  RETURNING id INTO new_id;
  UPDATE clients SET status = 'active' WHERE id = _client_id;
  INSERT INTO launch_events (launch_id, user_id, kind, details) VALUES (new_id, auth.uid(), 'relaunched', jsonb_build_object('plan', np.code, 'previous_launch', last.id));
  RETURN new_id;
END $function$;
REVOKE ALL ON FUNCTION public.relaunch_client(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relaunch_client(uuid, text) TO authenticated;