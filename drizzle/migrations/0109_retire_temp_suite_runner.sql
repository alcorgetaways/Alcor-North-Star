DROP FUNCTION IF EXISTS public._q69_run_suite(text);
REVOKE ALL ON public._q69_suites FROM service_role;
COMMENT ON TABLE public._q69_suites IS 'DEPRECATED: temporary Q69 test-runner staging; emptied and unused.';