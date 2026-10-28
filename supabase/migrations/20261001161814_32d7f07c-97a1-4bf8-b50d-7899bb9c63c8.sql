UPDATE public.kpi_definitions SET direction='lower_better' WHERE name IN ('Cost Per Lead','Commission','Cancellation %');

ALTER TABLE public.kpi_entries DROP COLUMN achievement_pct;
ALTER TABLE public.kpi_entries ADD COLUMN achievement_pct numeric,
  ADD COLUMN red_reason text,
  ADD COLUMN corrective_action text,
  ADD COLUMN action_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN action_deadline date,
  ADD COLUMN action_item_id uuid REFERENCES public.action_items(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.kpi_entry_compute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _dir text; _name text; _client uuid; _pipeline uuid; _month date; _issue text;
BEGIN
  SELECT direction, name, pipeline_id INTO _dir, _name, _pipeline FROM kpi_definitions WHERE id = NEW.kpi_definition_id;
  IF NEW.target IS NULL OR NEW.actual IS NULL OR NEW.target <= 0 THEN
    NEW.achievement_pct := NULL;
  ELSIF _dir = 'lower_better' THEN
    NEW.achievement_pct := CASE WHEN NEW.actual <= 0 THEN 120 ELSE LEAST(120, round(NEW.target / NEW.actual * 100, 2)) END;
  ELSE
    NEW.achievement_pct := LEAST(120, round(NEW.actual / NEW.target * 100, 2));
  END IF;

  IF NEW.achievement_pct IS NOT NULL AND NEW.achievement_pct < 70
     AND coalesce(trim(NEW.red_reason),'') <> '' AND coalesce(trim(NEW.corrective_action),'') <> ''
     AND NEW.action_owner_id IS NOT NULL AND NEW.action_deadline IS NOT NULL THEN
    SELECT client_id, month INTO _client, _month FROM monthly_reports WHERE id = NEW.report_id;
    _issue := _name || ' below target (' || to_char(_month,'Mon YYYY') || '): ' || NEW.red_reason;
    IF NEW.action_item_id IS NOT NULL AND EXISTS (SELECT 1 FROM action_items WHERE id = NEW.action_item_id) THEN
      UPDATE action_items SET issue=_issue, action_required=NEW.corrective_action,
        responsible_id=NEW.action_owner_id, due_date=NEW.action_deadline WHERE id = NEW.action_item_id;
    ELSE
      INSERT INTO action_items (client_id, pipeline_id, issue, action_required, responsible_id, priority, due_date, status, created_by)
      VALUES (_client, _pipeline, _issue, NEW.corrective_action, NEW.action_owner_id, 'high', NEW.action_deadline, 'not_started', auth.uid())
      RETURNING id INTO NEW.action_item_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.kpi_entry_compute() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER t_kpi_entry_compute BEFORE INSERT OR UPDATE ON public.kpi_entries
  FOR EACH ROW EXECUTE FUNCTION public.kpi_entry_compute();
UPDATE public.kpi_entries SET target = target;

-- Block submitting a report while RED KPIs lack a recovery plan
CREATE OR REPLACE FUNCTION public.report_submit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status <> 'draft' AND OLD.status = 'draft' AND EXISTS (
    SELECT 1 FROM kpi_entries e WHERE e.report_id = NEW.id AND e.achievement_pct < 70
      AND (coalesce(trim(e.red_reason),'') = '' OR coalesce(trim(e.corrective_action),'') = ''
           OR e.action_owner_id IS NULL OR e.action_deadline IS NULL)) THEN
    RAISE EXCEPTION 'Every red KPI needs what went wrong, corrective action, owner and deadline before submitting';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.report_submit_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER t_report_submit_guard BEFORE UPDATE OF status ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.report_submit_guard();

DROP POLICY IF EXISTS "targets write" ON public.client_kpi_targets;
CREATE POLICY "targets write" ON public.client_kpi_targets FOR ALL TO authenticated
  USING (is_manager(auth.uid())) WITH CHECK (is_manager(auth.uid()));