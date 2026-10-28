CREATE OR REPLACE FUNCTION public.refresh_gate_status(_launch_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Gate A needs only P0 tasks due by Gate A's own week; later-week P0 tasks no longer hold it back.
  UPDATE client_gates g SET status = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM client_tasks t JOIN launch_modules m ON m.code = t.module_code
        WHERE t.launch_id = g.launch_id AND t.phase = 'onboarding'
          AND CASE WHEN g.gate_code='gate_a'
                   THEN coalesce(t.phase_code,m.phase_code,'P0')='P0' AND t.week_due <= g.due_week
                   ELSE gate_task_filter(g.rule, g.gate_code, t.week_due, g.due_week, m.gate_code) END
          AND t.status NOT IN ('done','not_applicable'))
      AND (g.rule <> 'final' OR NOT EXISTS (
        SELECT 1 FROM client_gates o WHERE o.launch_id = g.launch_id AND o.id <> g.id AND o.status <> 'signed'))
      THEN 'ready' ELSE 'open' END
  WHERE g.launch_id = _launch_id AND g.status <> 'signed';
END $function$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT launch_id FROM client_gates WHERE gate_code='gate_a' AND status <> 'signed' LOOP
    PERFORM public.refresh_gate_status(r.launch_id);
  END LOOP;
END $$;