DO $run$
DECLARE s record; msg text;
BEGIN
  FOR s IN SELECT name, script FROM public._q69_suites ORDER BY name LOOP
    BEGIN
      EXECUTE s.script;
      msg := 'NO EXCEPTION';
    EXCEPTION WHEN others THEN msg := SQLERRM;
    END;
    RESET ROLE;
    UPDATE public._q69_suites SET result = left(msg, 500) WHERE name = s.name;
  END LOOP;
END $run$;