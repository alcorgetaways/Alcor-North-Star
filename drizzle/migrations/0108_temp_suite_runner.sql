-- TEMPORARY test runner (dropped again after this verification run). Not callable by anon,
-- signed-in users or the service role; runs only from the privileged SQL console.
CREATE TABLE public._q69_suites (name text PRIMARY KEY, script text NOT NULL);
GRANT ALL ON public._q69_suites TO service_role;
ALTER TABLE public._q69_suites ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public._q69_run_suite(_name text)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s text; r text;
BEGIN
  SELECT script INTO s FROM public._q69_suites WHERE name = _name;
  IF s IS NULL THEN RETURN 'missing'; END IF;
  BEGIN
    EXECUTE s;
    r := 'NO RESULT RAISED';
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public._q69_run_suite(text) FROM PUBLIC, anon, authenticated, service_role;