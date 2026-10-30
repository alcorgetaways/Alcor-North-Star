-- Core onboarding is a 15-day milestone. Pipeline launch gates retain their
-- plan-specific sequence and durations, starting after Gate A clears.
ALTER TABLE public.client_launches
  ADD COLUMN core_onboarding_due_date date
    GENERATED ALWAYS AS (day0_date + 15) STORED,
  ADD COLUMN core_onboarding_completed_at timestamptz;

UPDATE public.client_launches l
SET core_onboarding_completed_at = g.signed_at
FROM public.client_gates g
WHERE g.launch_id = l.id
  AND g.gate_code = 'gate_a'
  AND g.status = 'signed'
  AND l.core_onboarding_completed_at IS NULL;

UPDATE public.client_gates g
SET due_date = l.day0_date + 15
FROM public.client_launches l
WHERE g.launch_id = l.id
  AND g.gate_code = 'gate_a'
  AND g.status <> 'signed'
  AND l.day0_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_core_onboarding_gate_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE core_due date;
BEGIN
  IF NEW.gate_code = 'gate_a' THEN
    SELECT day0_date + 15 INTO core_due
    FROM public.client_launches
    WHERE id = NEW.launch_id;
    NEW.due_date := core_due;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_core_onboarding_gate_deadline() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER set_core_onboarding_gate_deadline
  BEFORE INSERT ON public.client_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_core_onboarding_gate_deadline();

CREATE OR REPLACE FUNCTION public.record_core_onboarding_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gate_code = 'gate_a'
     AND NEW.status = 'signed'
     AND OLD.status IS DISTINCT FROM 'signed' THEN
    UPDATE public.client_launches
    SET core_onboarding_completed_at = coalesce(NEW.signed_at, now())
    WHERE id = NEW.launch_id
      AND core_onboarding_completed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_core_onboarding_completion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_core_onboarding_completion
  AFTER UPDATE ON public.client_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.record_core_onboarding_completion();
