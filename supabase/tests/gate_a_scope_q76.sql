-- Gate A is ready once P0 tasks due by Gate A's week are done; later-week P0 tasks never hold it back.
DO $$
DECLARE _l uuid; _g uuid; _st text;
BEGIN
  SELECT g.launch_id, g.id INTO _l, _g FROM client_gates g
  WHERE g.gate_code = 'gate_a' AND EXISTS (
    SELECT 1 FROM client_tasks t WHERE t.launch_id = g.launch_id AND t.phase = 'onboarding' AND t.week_due > g.due_week
      AND coalesce(t.phase_code,'P0') = 'P0' AND t.status NOT IN ('done','not_applicable'))
  LIMIT 1;
  IF _l IS NULL THEN RAISE EXCEPTION 'FAIL no fixture launch'; END IF;
  UPDATE client_gates SET status = 'open' WHERE id = _g;
  UPDATE client_tasks t SET status = 'done' FROM client_gates g, launch_modules m
   WHERE g.id = _g AND t.launch_id = _l AND t.phase = 'onboarding' AND m.code = t.module_code
     AND coalesce(t.phase_code, m.phase_code, 'P0') = 'P0' AND t.week_due <= g.due_week;
  PERFORM refresh_gate_status(_l);
  SELECT status INTO _st FROM client_gates WHERE id = _g;
  IF _st <> 'ready' THEN RAISE EXCEPTION 'FAIL 1 later-week tasks held Gate A: %', _st; END IF;
  UPDATE client_tasks t SET status = 'not_started' FROM client_gates g, launch_modules m
   WHERE g.id = _g AND t.launch_id = _l AND t.phase = 'onboarding' AND m.code = t.module_code
     AND coalesce(t.phase_code, m.phase_code, 'P0') = 'P0' AND t.week_due <= g.due_week;
  PERFORM refresh_gate_status(_l);
  SELECT status INTO _st FROM client_gates WHERE id = _g;
  IF _st <> 'open' THEN RAISE EXCEPTION 'FAIL 2 open Gate A task ignored: %', _st; END IF;
  RAISE EXCEPTION 'PASS gate_a_scope_q76 2/2';
END $$;
