REVOKE ALL ON FUNCTION public._q76_run_suite(text) FROM PUBLIC,anon,authenticated,service_role,supabase_read_only_user;
DROP FUNCTION public._q76_run_suite(text);
REVOKE SELECT,INSERT,UPDATE ON public._q69_suites FROM sandbox_exec;