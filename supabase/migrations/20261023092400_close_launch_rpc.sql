-- Guarded close action: a closing reason is required, notes required for 'other'.
CREATE OR REPLACE FUNCTION public.close_launch(_launch_id uuid, _reason_code text, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.client_launches%ROWTYPE;
  r public.closing_reasons%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.client_launches WHERE id = _launch_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Launch not found'; END IF;
  IF NOT (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager')) THEN
    RAISE EXCEPTION 'Only management or the BD team can close a launch';
  END IF;
  SELECT * INTO r FROM public.closing_reasons WHERE code = _reason_code;
  IF r.code IS NULL THEN RAISE EXCEPTION 'Choose a valid closing reason'; END IF;
  IF r.requires_notes AND ( _notes IS NULL OR btrim(_notes) = '' ) THEN
    RAISE EXCEPTION 'Notes are required for this closing reason';
  END IF;
  UPDATE public.client_launches
  SET previous_status = l.status,
      status = 'closed',
      closing_reason_code = r.code,
      closed_reason = concat_ws(' — ', r.label, NULLIF(btrim(coalesce(_notes,'')), '')),
      closed_at = now(),
      updated_at = now()
  WHERE id = _launch_id;
  INSERT INTO public.launch_events (launch_id, user_id, kind, details)
  VALUES (_launch_id, auth.uid(), 'closed', jsonb_build_object('reason_code', r.code, 'notes', _notes, 'previous_status', l.status));
END $$;
REVOKE ALL ON FUNCTION public.close_launch(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_launch(uuid,text,text) TO authenticated;