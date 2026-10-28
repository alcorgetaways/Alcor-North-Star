REVOKE ALL ON FUNCTION public._q71_run_suite(text) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public._q71_run_suite(text) IS 'DEPRECATED: temporary SQL suite runner retired after QA73 verification.';
REVOKE ALL ON public._q69_suites FROM service_role, anon, authenticated;
COMMENT ON TABLE public._q69_suites IS 'DEPRECATED: temporary SQL-suite staging emptied and locked after QA73 verification.';