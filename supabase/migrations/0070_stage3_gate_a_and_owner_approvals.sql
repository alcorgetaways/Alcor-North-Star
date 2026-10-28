ALTER TABLE public.client_launches ADD COLUMN no_launch_checklist boolean NOT NULL DEFAULT false;
UPDATE public.client_launches SET no_launch_checklist=true WHERE source_row IS NOT NULL AND activated_at IS NULL AND status IN('active','live','on_hold') AND NOT EXISTS(SELECT 1 FROM public.client_tasks t WHERE t.launch_id=client_launches.id);
ALTER TABLE public.client_tasks ADD COLUMN gate_a_override_by uuid REFERENCES public.profiles(id), ADD COLUMN gate_a_override_at timestamptz, ADD COLUMN gate_a_override_reason text, ADD COLUMN owner_action_kind text;
ALTER TABLE public.checklist_templates ADD COLUMN owner_action_kind text;
UPDATE public.checklist_templates t SET owner_action_kind=CASE WHEN t.requires_client_approval THEN 'approval' WHEN m.client_side THEN 'input' ELSE NULL END FROM public.launch_modules m WHERE m.code=t.module_code;
UPDATE public.client_tasks t SET owner_action_kind=CASE WHEN t.requires_client_approval THEN 'approval' ELSE ct.owner_action_kind END FROM public.checklist_templates ct WHERE ct.id=t.template_id;
UPDATE public.client_tasks SET owner_action_kind='approval' WHERE requires_client_approval AND owner_action_kind IS NULL;
ALTER TABLE public.client_gates ADD COLUMN client_approved_at timestamptz, ADD COLUMN client_approved_by uuid REFERENCES public.profiles(id), ADD COLUMN approval_method text;
CREATE FUNCTION public.task_gate_a_locked(_task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT t.phase='onboarding' AND coalesce(t.phase_code,m.phase_code,'P0')<>'P0' AND t.gate_a_override_at IS NULL AND NOT EXISTS(SELECT 1 FROM client_gates g WHERE g.launch_id=t.launch_id AND g.gate_code='gate_a' AND g.status='signed') FROM client_tasks t LEFT JOIN launch_modules m ON m.code=t.module_code WHERE t.id=_task),false) $$;
REVOKE ALL ON FUNCTION public.task_gate_a_locked(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.task_gate_a_locked(uuid) TO authenticated,service_role;
CREATE FUNCTION public.gate_a_lock_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE ph text; BEGIN
IF TG_OP='INSERT' THEN
 IF NEW.phase='onboarding' AND EXISTS(SELECT 1 FROM client_launches WHERE id=NEW.launch_id AND no_launch_checklist) THEN RAISE EXCEPTION 'Live, no checklist: launch tasks are not generated for this client'; END IF;
 SELECT coalesce(NEW.phase_code,m.phase_code,'P0') INTO ph FROM launch_modules m WHERE m.code=NEW.module_code;
 IF NEW.phase='onboarding' AND ph<>'P0' AND NEW.status NOT IN('not_started','done','not_applicable') AND NOT EXISTS(SELECT 1 FROM client_gates WHERE launch_id=NEW.launch_id AND gate_code='gate_a' AND status='signed') THEN RAISE EXCEPTION 'Locked: waiting for Gate A'; END IF;
 NEW.owner_action_kind:=coalesce(NEW.owner_action_kind,CASE WHEN NEW.requires_client_approval THEN 'approval' END,(SELECT owner_action_kind FROM checklist_templates WHERE id=NEW.template_id));
 RETURN NEW;
END IF;
IF ROW(NEW.gate_a_override_by,NEW.gate_a_override_at,NEW.gate_a_override_reason) IS DISTINCT FROM ROW(OLD.gate_a_override_by,OLD.gate_a_override_at,OLD.gate_a_override_reason) THEN
 IF NOT coalesce(is_manager(auth.uid()),false) OR NEW.gate_a_override_by IS DISTINCT FROM auth.uid() OR NEW.gate_a_override_at IS NULL OR coalesce(trim(NEW.gate_a_override_reason),'')='' THEN RAISE EXCEPTION 'Only Admin or Management can override a task with a reason'; END IF;
 INSERT INTO admin_audit_log(actor,action,target_type,target_id,outcome,details) VALUES(auth.uid(),'gate_a_task_override','client_tasks',OLD.id::text,'ok',jsonb_build_object('reason',NEW.gate_a_override_reason,'when',NEW.gate_a_override_at,'launch_id',OLD.launch_id));
 IF (to_jsonb(NEW)-ARRAY['gate_a_override_by','gate_a_override_at','gate_a_override_reason','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['gate_a_override_by','gate_a_override_at','gate_a_override_reason','updated_at']) THEN RAISE EXCEPTION 'Override only this task first, then edit it'; END IF;
 RETURN NEW;
END IF;
IF public.task_gate_a_locked(OLD.id) AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Locked: waiting for Gate A'; END IF;
RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.gate_a_lock_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a0_gate_a_lock BEFORE INSERT OR UPDATE ON public.client_tasks FOR EACH ROW EXECUTE FUNCTION public.gate_a_lock_guard();
CREATE FUNCTION public.override_gate_a_task(_task uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT coalesce(is_manager(auth.uid()),false) THEN RAISE EXCEPTION 'Only Admin or Management can override'; END IF; IF NOT task_gate_a_locked(_task) THEN RAISE EXCEPTION 'Task is not locked'; END IF; UPDATE client_tasks SET gate_a_override_by=auth.uid(),gate_a_override_at=now(),gate_a_override_reason=trim(_reason) WHERE id=_task; END $$;
REVOKE ALL ON FUNCTION public.override_gate_a_task(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.override_gate_a_task(uuid,text) TO authenticated;
DO $ddl$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.client_task_guard()'::regprocedure) INTO d; d:=replace(d,'IF NEW.phase = ''onboarding'' AND NEW.status IN (''in_progress'',''done'') AND NOT (NEW.module_code = ANY(pl.lock_exempt_modules))','IF false AND NEW.phase = ''onboarding'' AND NEW.status IN (''in_progress'',''done'') AND NOT (NEW.module_code = ANY(pl.lock_exempt_modules))'); EXECUTE d; END $ddl$;
CREATE FUNCTION public.client_approve_gate(_gate uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE g client_gates; BEGIN SELECT * INTO g FROM client_gates WHERE id=_gate FOR UPDATE; IF g.id IS NULL OR g.client_id IS DISTINCT FROM my_client_id() OR NOT has_role(auth.uid(),'client') THEN RAISE EXCEPTION 'Only this hotel owner can approve'; END IF; IF g.status<>'ready' THEN RAISE EXCEPTION 'Gate is not ready for approval'; END IF; UPDATE client_gates SET client_approved_at=now(),client_approved_by=auth.uid(),approval_method='owner_login' WHERE id=_gate; INSERT INTO launch_events(launch_id,user_id,kind,details) VALUES(g.launch_id,auth.uid(),'gate_owner_approved',jsonb_build_object('gate',g.gate_code,'method','owner_login')); END $$;
REVOKE ALL ON FUNCTION public.client_approve_gate(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.client_approve_gate(uuid) TO authenticated;
CREATE FUNCTION public.gate_approval_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='signed' AND OLD.status<>'signed' AND NEW.gate_code='gate_a' AND (auth.uid() IS NULL OR NOT has_role(auth.uid(),'bd_manager')) THEN RAISE EXCEPTION 'Only the BD Manager can sign Gate A'; END IF;
 IF NEW.client_approved_at IS DISTINCT FROM OLD.client_approved_at OR NEW.client_approved_by IS DISTINCT FROM OLD.client_approved_by THEN IF NEW.client_id IS DISTINCT FROM my_client_id() OR NOT has_role(auth.uid(),'client') OR NEW.client_approved_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only this hotel owner can approve'; END IF; END IF;
 IF NEW.status='signed' AND OLD.status<>'signed' THEN
  IF coalesce(trim(NEW.approval_file_path),'')<>'' THEN NEW.approval_method:='uploaded_file'; ELSIF NEW.client_approved_at IS NOT NULL THEN NEW.approval_method:='owner_login'; END IF;
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.gate_approval_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_gate_approval_guard BEFORE UPDATE ON public.client_gates FOR EACH ROW EXECUTE FUNCTION public.gate_approval_guard();
CREATE OR REPLACE FUNCTION public.sign_gate(_gate_id uuid,_approval_file_path text DEFAULT NULL,_notes text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE g client_gates; allowed boolean; pl plans; BEGIN
SELECT * INTO g FROM client_gates WHERE id=_gate_id FOR UPDATE; IF g.id IS NULL THEN RAISE EXCEPTION 'Gate not found'; END IF;
PERFORM refresh_gate_status(g.launch_id); SELECT * INTO g FROM client_gates WHERE id=_gate_id;
IF g.status='signed' THEN RETURN; END IF; IF g.status<>'ready' THEN RAISE EXCEPTION '% is not ready: open tasks remain',g.gate_name; END IF;
IF g.gate_code='gate_a' THEN allowed:=has_role(auth.uid(),'bd_manager'); ELSE allowed:=is_manager(auth.uid()) OR EXISTS(SELECT 1 FROM client_module_assignments a JOIN launch_modules m ON m.code=a.module_code WHERE a.launch_id=g.launch_id AND (a.primary_user_id=auth.uid() OR a.backup_user_id=auth.uid()) AND m.owner_role=g.signer_role AND NOT m.client_side); END IF;
IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Only the designated signer can sign this gate'; END IF;
SELECT p.* INTO pl FROM plans p JOIN client_launches l ON l.plan_id=p.id WHERE l.id=g.launch_id;
IF g.gate_code=pl.final_gate_code AND coalesce(trim(coalesce(_approval_file_path,g.approval_file_path)),'')='' AND g.client_approved_at IS NULL THEN RAISE EXCEPTION 'Upload the hotel approval file or ask the owner to Approve in North Star'; END IF;
UPDATE client_gates SET status='signed',signed_by=auth.uid(),signed_at=now(),approval_file_path=coalesce(_approval_file_path,approval_file_path),notes=coalesce(_notes,notes) WHERE id=_gate_id;
IF g.gate_code='gate_a' THEN
 INSERT INTO task_activity(task_id,user_id,action,note) SELECT t.id,auth.uid(),'gate_a_due_date_recalculated','Due date '||t.due_date||' → '||launch_due_date((now() AT TIME ZONE 'Asia/Kolkata')::date,t.week_due) FROM client_tasks t WHERE t.launch_id=g.launch_id AND t.phase='onboarding' AND coalesce(t.phase_code,(SELECT phase_code FROM launch_modules WHERE code=t.module_code),'P0')<>'P0';
 UPDATE client_tasks t SET due_date=launch_due_date((now() AT TIME ZONE 'Asia/Kolkata')::date,t.week_due) WHERE t.launch_id=g.launch_id AND t.phase='onboarding' AND coalesce(t.phase_code,(SELECT phase_code FROM launch_modules WHERE code=t.module_code),'P0')<>'P0';
END IF;
IF g.gate_code=pl.final_gate_code THEN UPDATE client_launches SET status='live' WHERE id=g.launch_id; UPDATE client_pipelines SET status='active' WHERE client_id=g.client_id AND status='onboarding'; UPDATE clients SET onboarding_status='complete' WHERE id=g.client_id; END IF;
PERFORM refresh_gate_status(g.launch_id); END $$;
DO $ddl$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.refresh_gate_status(uuid)'::regprocedure) INTO d; d:=replace(d,'AND gate_task_filter(g.rule, g.gate_code, t.week_due, g.due_week, m.gate_code)','AND CASE WHEN g.gate_code=''gate_a'' THEN coalesce(t.phase_code,m.phase_code,''P0'')=''P0'' ELSE gate_task_filter(g.rule, g.gate_code, t.week_due, g.due_week, m.gate_code) END'); EXECUTE d; END $ddl$;
DO $ddl$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.get_my_launch()'::regprocedure) INTO d;
d:=replace(d,'''plan'', p.name,','''no_launch_checklist'',l.no_launch_checklist, ''plan'', p.name,');
d:=replace(d,'''name'', g.gate_name, ''due'', g.due_date, ''status'', g.status,','''id'',g.id,''approval_method'',g.approval_method,''client_approved_at'',g.client_approved_at,''name'', g.gate_name, ''due'', g.due_date, ''status'', g.status,');
d:=replace(d,'''evidence_url'', evidence_url, ''requested'', client_approval_requested_at)','''evidence_url'', evidence_url,''action_kind'',coalesce(owner_action_kind,CASE WHEN requires_client_approval THEN ''approval'' END),''locked'',task_gate_a_locked(id), ''requested'', client_approval_requested_at)');
d:=replace(d,'status = ''waiting_client'' AND client_approved_at IS NULL','(requires_client_approval OR owner_action_kind IN(''approval'',''upload'',''input'')) AND status NOT IN(''done'',''not_applicable'') AND client_approved_at IS NULL');
EXECUTE d; END $ddl$;