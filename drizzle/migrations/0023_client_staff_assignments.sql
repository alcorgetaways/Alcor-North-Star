
-- Assignment-based per-client, per-pipeline staff access.
CREATE TABLE IF NOT EXISTS public.client_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('head','team_member')),
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  excluded boolean NOT NULL DEFAULT false,
  matched_service text,
  source_launch_id uuid REFERENCES public.client_launches(id) ON DELETE SET NULL,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id, pipeline_id)
);

GRANT SELECT ON public.client_staff_assignments TO authenticated;
GRANT ALL ON public.client_staff_assignments TO service_role;

ALTER TABLE public.client_staff_assignments ENABLE ROW LEVEL SECURITY;

-- can_view_client is SECURITY DEFINER (owner bypasses RLS), so no policy recursion.
CREATE POLICY csa_select ON public.client_staff_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_client(client_id));

-- Recompute one client's assignments from its effective active launch
-- (its own, or its parent brand's for child properties).
CREATE OR REPLACE FUNCTION public.recalc_client_assignments(_client_id uuid, _reset_manual boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_launch public.client_launches%ROWTYPE;
  v_parent uuid;
  v_svc record;
  v_pipeline_id uuid;
  v_unmatched text[] := '{}';
  v_count int;
BEGIN
  SELECT * INTO v_launch FROM public.client_launches
   WHERE client_id = _client_id AND status IN ('active','live')
   ORDER BY created_at DESC LIMIT 1;
  IF v_launch.id IS NULL THEN
    SELECT parent_client_id INTO v_parent FROM public.clients WHERE id = _client_id;
    IF v_parent IS NOT NULL THEN
      SELECT * INTO v_launch FROM public.client_launches
       WHERE client_id = v_parent AND status IN ('active','live')
       ORDER BY created_at DESC LIMIT 1;
    END IF;
  END IF;

  IF v_launch.id IS NULL THEN
    -- No active launch: no pipeline assignments (history stays in tasks/activity).
    DELETE FROM public.client_staff_assignments WHERE client_id = _client_id;
    RETURN jsonb_build_object('client_id', _client_id, 'assigned', 0, 'unmatched', '[]'::jsonb, 'launch', null);
  END IF;

  IF _reset_manual THEN
    DELETE FROM public.client_staff_assignments WHERE client_id = _client_id;
  ELSE
    DELETE FROM public.client_staff_assignments WHERE client_id = _client_id AND source = 'auto';
  END IF;

  FOR v_svc IN
    SELECT s.service_name, s.pipeline_code FROM public.custom_plan_services s
     WHERE v_launch.custom_plan_id IS NOT NULL AND s.custom_plan_id = v_launch.custom_plan_id AND s.included
    UNION ALL
    SELECT s.service_name, s.pipeline_code FROM public.plan_services s
     WHERE v_launch.custom_plan_id IS NULL AND s.plan_version_id = v_launch.plan_version_id AND s.included
  LOOP
    SELECT id INTO v_pipeline_id FROM public.pipelines WHERE code = v_svc.pipeline_code AND active;
    IF v_pipeline_id IS NULL THEN
      v_unmatched := v_unmatched || v_svc.pipeline_code;
      CONTINUE;
    END IF;
    INSERT INTO public.client_staff_assignments
      (client_id, user_id, pipeline_id, role, source, matched_service, source_launch_id, last_calculated_at)
    SELECT _client_id, pm.user_id, v_pipeline_id, pm.role, 'auto', v_svc.service_name, v_launch.id, now()
      FROM public.pipeline_members pm
     WHERE pm.pipeline_id = v_pipeline_id AND pm.active
    ON CONFLICT (client_id, user_id, pipeline_id) DO NOTHING;
  END LOOP;

  IF array_length(v_unmatched, 1) IS NOT NULL THEN
    UPDATE public.client_launches
       SET import_flags = coalesce(import_flags, '{}'::jsonb)
           || jsonb_build_object('unmatched_services', to_jsonb(v_unmatched))
     WHERE id = v_launch.id;
  END IF;

  -- Reconcile stale per-hotel manager placeholders to the pipeline's active head.
  UPDATE public.client_pipelines cp
     SET manager_id = (SELECT pm.user_id FROM public.pipeline_members pm
                        WHERE pm.pipeline_id = cp.pipeline_id AND pm.role = 'head' AND pm.active
                        ORDER BY pm.created_at LIMIT 1)
   WHERE cp.client_id = _client_id
     AND cp.manager_id IS DISTINCT FROM (SELECT pm.user_id FROM public.pipeline_members pm
                        WHERE pm.pipeline_id = cp.pipeline_id AND pm.role = 'head' AND pm.active
                        ORDER BY pm.created_at LIMIT 1);

  SELECT count(*) INTO v_count FROM public.client_staff_assignments
   WHERE client_id = _client_id AND NOT excluded;
  RETURN jsonb_build_object('client_id', _client_id, 'assigned', v_count,
                            'unmatched', to_jsonb(v_unmatched), 'launch', v_launch.id);
END
$fn$;

REVOKE ALL ON FUNCTION public.recalc_client_assignments(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_client_assignments(uuid, boolean) TO service_role;

-- Recalc on launch activation / plan change / close.
CREATE OR REPLACE FUNCTION public.client_launch_assignments_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.recalc_client_assignments(NEW.client_id, false);
  PERFORM public.recalc_client_assignments(c.id, false)
    FROM public.clients c WHERE c.parent_client_id = NEW.client_id;
  IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    PERFORM public.recalc_client_assignments(OLD.client_id, false);
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS client_launch_assignments_touch ON public.client_launches;
CREATE TRIGGER client_launch_assignments_touch
  AFTER INSERT OR UPDATE OF status, plan_version_id, custom_plan_id ON public.client_launches
  FOR EACH ROW EXECUTE FUNCTION public.client_launch_assignments_touch();

-- Recalc when a custom plan's services change.
CREATE OR REPLACE FUNCTION public.custom_plan_services_assignments_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client uuid;
BEGIN
  FOR v_client IN
    SELECT l.client_id FROM public.client_launches l
     WHERE l.custom_plan_id = COALESCE(NEW.custom_plan_id, OLD.custom_plan_id)
  LOOP
    PERFORM public.recalc_client_assignments(v_client, false);
    PERFORM public.recalc_client_assignments(c.id, false)
      FROM public.clients c WHERE c.parent_client_id = v_client;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$fn$;

DROP TRIGGER IF EXISTS custom_plan_services_assignments_touch ON public.custom_plan_services;
CREATE TRIGGER custom_plan_services_assignments_touch
  AFTER INSERT OR UPDATE OR DELETE ON public.custom_plan_services
  FOR EACH ROW EXECUTE FUNCTION public.custom_plan_services_assignments_touch();

-- Recalc when pipeline membership changes.
CREATE OR REPLACE FUNCTION public.pipeline_members_assignments_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_pid uuid := COALESCE(NEW.pipeline_id, OLD.pipeline_id);
  v_code text;
  v_client uuid;
BEGIN
  SELECT code INTO v_code FROM public.pipelines WHERE id = v_pid;
  FOR v_client IN
    SELECT DISTINCT a.client_id FROM public.client_staff_assignments a WHERE a.pipeline_id = v_pid
    UNION
    SELECT l.client_id FROM public.client_launches l
     WHERE l.status IN ('active','live') AND v_code IS NOT NULL AND (
       (l.custom_plan_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.custom_plan_services s
          WHERE s.custom_plan_id = l.custom_plan_id AND s.included AND s.pipeline_code = v_code))
       OR (l.custom_plan_id IS NULL AND EXISTS (SELECT 1 FROM public.plan_services s
          WHERE s.plan_version_id = l.plan_version_id AND s.included AND s.pipeline_code = v_code)))
    UNION
    SELECT c.id FROM public.clients c
     JOIN public.client_launches l ON l.client_id = c.parent_client_id AND l.status IN ('active','live')
     WHERE v_code IS NOT NULL AND (
       (l.custom_plan_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.custom_plan_services s
          WHERE s.custom_plan_id = l.custom_plan_id AND s.included AND s.pipeline_code = v_code))
       OR (l.custom_plan_id IS NULL AND EXISTS (SELECT 1 FROM public.plan_services s
          WHERE s.plan_version_id = l.plan_version_id AND s.included AND s.pipeline_code = v_code)))
  LOOP
    PERFORM public.recalc_client_assignments(v_client, false);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$fn$;

DROP TRIGGER IF EXISTS pipeline_members_assignments_touch ON public.pipeline_members;
CREATE TRIGGER pipeline_members_assignments_touch
  AFTER INSERT OR UPDATE OR DELETE ON public.pipeline_members
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_members_assignments_touch();

-- Staff client visibility is now assignment-based; pipeline-wide membership no longer grants access.
CREATE OR REPLACE FUNCTION public.can_view_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_manager(auth.uid())
      OR public.has_role(auth.uid(),'bd_manager')
      OR public.my_client_id() = _client_id
      OR EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = _client_id AND c.parent_client_id = public.my_client_id())
      OR public.is_client_am(_client_id)
      OR EXISTS (SELECT 1 FROM public.client_staff_assignments a
                 WHERE a.client_id = _client_id AND a.user_id = auth.uid() AND NOT a.excluded)
      OR EXISTS (SELECT 1 FROM public.client_module_assignments a
                 WHERE a.client_id = _client_id
                   AND (a.primary_user_id = auth.uid() OR a.backup_user_id = auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.can_view_pipeline(_client_pipeline_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_pipelines cp
    WHERE cp.id = _client_pipeline_id
      AND (EXISTS (SELECT 1 FROM public.client_staff_assignments a
                   WHERE a.client_id = cp.client_id AND a.pipeline_id = cp.pipeline_id
                     AND a.user_id = auth.uid() AND NOT a.excluded)
           OR public.can_view_client_full(cp.client_id)));
$function$;
