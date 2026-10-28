ALTER TABLE public._q69_suites ADD COLUMN IF NOT EXISTS result text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._q69_suites TO service_role;
DROP FUNCTION IF EXISTS public._qa_run_suite(text);