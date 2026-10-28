-- TEMPORARY test runner for the SQL suites (retired again right after the run). Only the sandbox console role can insert here.
CREATE OR REPLACE FUNCTION public._q31_run_staged_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.run THEN
    BEGIN
      EXECUTE NEW.script;
      NEW.name := NEW.name || ' => NO EXCEPTION';
    EXCEPTION WHEN others THEN
      NEW.name := NEW.name || ' => ' || SQLERRM;
    END;
    NEW.script := '';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public._q31_run_staged_trigger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS q71_run_suite_ins ON public._q31_test_stage;
CREATE TRIGGER q71_run_suite_ins BEFORE INSERT ON public._q31_test_stage FOR EACH ROW EXECUTE FUNCTION public._q31_run_staged_trigger();