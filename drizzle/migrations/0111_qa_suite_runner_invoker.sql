CREATE OR REPLACE FUNCTION public._qa_run_suite(_sql text) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
BEGIN
  BEGIN EXECUTE _sql; RETURN 'NO EXCEPTION';
  EXCEPTION WHEN others THEN RETURN SQLERRM; END;
END $$;
REVOKE EXECUTE ON FUNCTION public._qa_run_suite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._qa_run_suite(text) TO service_role;