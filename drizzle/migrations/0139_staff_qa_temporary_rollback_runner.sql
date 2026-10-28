CREATE FUNCTION public._q76_run_suite(_script text) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$ BEGIN BEGIN EXECUTE _script; RETURN 'FAIL: suite did not roll back'; EXCEPTION WHEN others THEN RETURN SQLERRM; END; END $$;
REVOKE ALL ON FUNCTION public._q76_run_suite(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._q76_run_suite(text) TO service_role,supabase_read_only_user;
GRANT SELECT,INSERT,UPDATE ON public._q69_suites TO sandbox_exec;