CREATE OR REPLACE FUNCTION public.create_rd_followup(_user uuid, _client uuid, _date date, _notes text, _name text, _phone text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  IF NOT ((_user = auth.uid() AND public.is_rd_associate(auth.uid())) OR public.can_manage_rd(auth.uid())) THEN RAISE EXCEPTION 'You cannot add this follow-up'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Choose a follow-up date'; END IF;
  INSERT INTO public.rd_followups(user_id,client_id,next_followup_date,notes) VALUES (_user,_client,_date,nullif(btrim(_notes),'')) RETURNING id INTO _id;
  IF nullif(btrim(_name),'') IS NOT NULL OR nullif(btrim(_phone),'') IS NOT NULL THEN
    INSERT INTO public.rd_followup_contacts(followup_id,lead_name,lead_phone) VALUES (_id,nullif(btrim(_name),''),nullif(btrim(_phone),''));
  END IF;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.create_rd_followup(uuid,uuid,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rd_followup(uuid,uuid,date,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.create_rd_followup(uuid,uuid,date,text,text,text) IS 'QA-39: atomic follow-up and restricted contact creation; SECURITY INVOKER preserves existing table RLS.';