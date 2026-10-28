CREATE OR REPLACE FUNCTION public._q71_run_suite(_script text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'Temporary SQL runner retired'; END $fn$;
REVOKE ALL ON FUNCTION public._q71_run_suite(text) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public._q71_run_suite(text) IS 'DEPRECATED: temporary SQL-suite runner, retired';
DROP TRIGGER IF EXISTS q71_run_suite_ins ON public._q31_test_stage;
CREATE OR REPLACE FUNCTION public._q31_run_staged_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'Temporary SQL runner retired'; END $fn$;