-- Fix merge_clients: collect moved row ids, write client_merges + audit log,
-- mark the merged record, and allow authenticated calls (the function guards internally).
CREATE OR REPLACE FUNCTION public.merge_clients(_survivor uuid, _merged uuid, _field_choices jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text; ids uuid[]; moved jsonb := '{}'::jsonb;
  tables text[] := ARRAY[
    'client_launches','client_tasks','client_gates','client_module_assignments','documents',
    'internal_notes','client_pipelines','client_questions','action_items','room_categories',
    'client_assets','client_credentials','client_social_accounts','client_checklist_items',
    'client_message_outbox','onboarding_audit_log','gbp_kpi_entries','gbp_monthly_goals',
    'gbp_reports','social_kpi_entries','ota_records','pipeline_kpi_entries','weekly_kpi_entries',
    'monthly_reports','profiles'
  ];
  f text; val text;
  contact_fields text[] := ARRAY['owner_name','contact_person','email','mobile','whatsapp','address','city','state','country','pin_code','website','gst_number'];
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only admin or management can merge clients';
  END IF;
  IF _survivor = _merged THEN
    RAISE EXCEPTION 'Survivor and merged record must be different';
  END IF;
  PERFORM 1 FROM public.clients WHERE id = _survivor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surviving client not found'; END IF;
  PERFORM 1 FROM public.clients WHERE id = _merged;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merged client not found'; END IF;

  -- Explicit conflicting-field choices: 'merged' keeps the duplicate's value.
  FOREACH f IN ARRAY contact_fields LOOP
    IF _field_choices ->> f = 'merged' THEN
      EXECUTE format('SELECT %I::text FROM public.clients WHERE id = $1', f) INTO val USING _merged;
      EXECUTE format('UPDATE public.clients SET %I = $1, updated_at = now() WHERE id = $2', f) USING val, _survivor;
    END IF;
  END LOOP;

  -- Move every child row to the survivor, recording moved ids.
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT array_agg(id) FROM (UPDATE public.%I SET client_id = $1 WHERE client_id = $2 RETURNING id) u', t)
      INTO ids USING _survivor, _merged;
    moved := moved || jsonb_build_object(t, COALESCE(to_jsonb(ids), '[]'::jsonb));
  END LOOP;

  -- The merged (losing) record stays for audit but is clearly marked.
  UPDATE public.clients SET status = 'merged', updated_at = now() WHERE id = _merged;

  INSERT INTO public.client_merges (survivor_id, merged_id, merged_by, field_choices, moved)
  VALUES (_survivor, _merged, auth.uid(), COALESCE(_field_choices, '{}'::jsonb), moved);

  INSERT INTO public.admin_audit_log (actor, action, target_type, target_id, outcome, details)
  VALUES (auth.uid(), 'client_merge', 'client', _merged::text, 'success',
          jsonb_build_object('survivor_id', _survivor, 'field_choices', COALESCE(_field_choices, '{}'::jsonb), 'moved', moved));

  RETURN moved;
END $$;
REVOKE ALL ON FUNCTION public.merge_clients(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_clients(uuid,uuid,jsonb) TO authenticated;