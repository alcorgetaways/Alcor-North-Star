CREATE TABLE public.historical_launch_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), launch_id uuid NOT NULL REFERENCES public.client_launches(id), client_id uuid NOT NULL REFERENCES public.clients(id), template_id uuid NOT NULL REFERENCES public.checklist_templates(id), module_code text NOT NULL, code text NOT NULL, name text NOT NULL, standard text, week_label text, week_start integer NOT NULL, week_due integer NOT NULL, phase_code text, sort_order integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'done' CHECK(status='done'), notes text NOT NULL DEFAULT 'Completed before North Star', imported_at timestamptz NOT NULL DEFAULT now(), UNIQUE(launch_id,code)
);
GRANT SELECT ON public.historical_launch_tasks TO authenticated;
GRANT ALL ON public.historical_launch_tasks TO service_role;
ALTER TABLE public.historical_launch_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_task_read ON public.historical_launch_tasks FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND (public.can_view_client_full(client_id) OR EXISTS(SELECT 1 FROM public.client_module_assignments a WHERE a.launch_id=historical_launch_tasks.launch_id AND a.module_code=historical_launch_tasks.module_code AND (a.primary_user_id=auth.uid() OR a.backup_user_id=auth.uid()))));
COMMENT ON TABLE public.historical_launch_tasks IS 'Owner-authorized completed-before-North-Star checklist snapshots; no claimed completion dates, approvals, gates or scoring. Read-only staff scope matches launch tasks; owners receive overall progress only through get_my_launch.';
DO $ddl$ DECLARE d text; old_part text := $old$'progress_pct', (SELECT round(100.0 * count(*) FILTER (WHERE status IN ('done','not_applicable')) / NULLIF(count(*),0))
                     FROM client_tasks WHERE launch_id = l.id AND phase = 'onboarding')$old$; BEGIN SELECT pg_get_functiondef('public.get_my_launch()'::regprocedure) INTO d;
IF position(old_part in d)=0 THEN RAISE EXCEPTION 'Unexpected get_my_launch shape'; END IF;
d:=replace(d,old_part,$new$'progress_pct', CASE WHEN l.no_launch_checklist AND EXISTS(SELECT 1 FROM public.historical_launch_tasks h WHERE h.launch_id=l.id) THEN 100 ELSE (SELECT round(100.0 * count(*) FILTER (WHERE status IN ('done','not_applicable')) / NULLIF(count(*),0)) FROM client_tasks WHERE launch_id=l.id AND phase='onboarding') END$new$);
EXECUTE d; END $ddl$;