CREATE OR REPLACE FUNCTION public._q71_run_suite(_script text) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $fn$ BEGIN BEGIN EXECUTE _script; RETURN 'NO EXCEPTION'; EXCEPTION WHEN others THEN RETURN SQLERRM; END; END $fn$;
REVOKE ALL ON FUNCTION public._q71_run_suite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._q71_run_suite(text) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._q69_suites TO service_role;