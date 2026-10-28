CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _is_service boolean := coalesce(auth.role(),'') = 'service_role';
BEGIN
  INSERT INTO public.profiles (id, full_name, email, mobile, department, client_id)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          NEW.email,
          NEW.raw_user_meta_data->>'mobile',
          CASE WHEN _is_service THEN NEW.raw_user_meta_data->>'department' END,
          CASE WHEN _is_service THEN NULLIF(NEW.raw_user_meta_data->>'client_id','')::uuid END);

  IF public.setup_required() THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSIF _is_service THEN
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data->>'role','')::public.app_role)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  RETURN NEW;
END; $function$;

-- Profiles: self can only change full_name, mobile, photo_url
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(),'') = 'service_role' OR auth.uid() IS NULL OR public.is_manager(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'You can only update your name, mobile and photo';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_self_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS t_profiles_guard ON public.profiles;
CREATE TRIGGER t_profiles_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Reports: only managers can move to review/approved
DROP POLICY IF EXISTS "reports update" ON public.monthly_reports;
CREATE POLICY "reports update" ON public.monthly_reports FOR UPDATE TO authenticated
  USING (is_manager(auth.uid()) OR (manages_pipeline(client_pipeline_id) AND status IN ('draft','submitted')))
  WITH CHECK (is_manager(auth.uid()) OR (manages_pipeline(client_pipeline_id) AND status IN ('draft','submitted')));

-- Storage: client-files read restricted by client folder
CREATE OR REPLACE FUNCTION public.can_read_client_file(_name text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _parts text[] := storage.foldername(_name); _cid uuid;
BEGIN
  IF public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager') THEN RETURN true; END IF;
  BEGIN
    _cid := (CASE WHEN _parts[1] = 'gbp' THEN _parts[2] ELSE _parts[1] END)::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  RETURN EXISTS (SELECT 1 FROM public.client_pipelines cp WHERE cp.client_id = _cid
    AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()));
END; $$;
REVOKE EXECUTE ON FUNCTION public.can_read_client_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_client_file(text) TO authenticated;

DROP POLICY IF EXISTS "client files staff read" ON storage.objects;
CREATE POLICY "client files staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-files' AND public.can_read_client_file(name));