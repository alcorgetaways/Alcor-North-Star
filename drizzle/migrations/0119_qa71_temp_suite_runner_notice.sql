CREATE OR REPLACE FUNCTION public._q31_run_staged_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r text;
BEGIN
  BEGIN
    EXECUTE NEW.script;
    r := 'NO EXCEPTION';
  EXCEPTION WHEN others THEN
    r := SQLERRM;
  END;
  RAISE NOTICE 'SUITE % => %', NEW.name, r;
  RETURN NULL; -- nothing is stored
END $fn$;
REVOKE ALL ON FUNCTION public._q31_run_staged_trigger() FROM PUBLIC, anon, authenticated;