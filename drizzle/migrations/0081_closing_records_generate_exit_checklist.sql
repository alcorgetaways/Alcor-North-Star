DO $$ DECLARE s text; BEGIN SELECT pg_get_functiondef(oid) INTO s FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='close_launch'; s:=replace(s,'  UPDATE public.client_launches',$insert$  IF l.status IN ('active','live') THEN
    PERFORM public.record_termination_notice(l.id,(now() AT TIME ZONE 'Asia/Kolkata')::date,'alcor',_notes,NULL);
    UPDATE public.client_launches SET closing_reason_code=r.code,closed_reason=concat_ws(' — ',r.label,NULLIF(btrim(coalesce(_notes,'')),'')) WHERE id=l.id;
    RETURN;
  END IF;
  UPDATE public.client_launches$insert$); EXECUTE s; END $$;