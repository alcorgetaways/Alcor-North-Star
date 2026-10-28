-- S6(b) DRAFT — NOT APPLIED. Needs Manu's approval before it is run as a migration.
-- While profiles.must_change_password is true, the base data helpers return false/null,
-- so every RLS policy and RPC built on them (can_view_client*, can_edit_client, can_view_pipeline,
-- can_read_fetched, can_view_report, can_manage_rd, get_my_launch via my_client_id, ...) denies data.
-- The forced change itself keeps working: it runs in a server function with the service role.

CREATE OR REPLACE FUNCTION public._password_ok(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT coalesce((SELECT must_change_password FROM public.profiles WHERE id = _uid), false);
$$;
REVOKE EXECUTE ON FUNCTION public._password_ok(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._password_ok(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND p.status = 'active'
      AND r.role IN ('admin','management','bd_manager','pipeline_manager','team_member'));
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._password_ok(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role IN ('admin','management') AND p.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._password_ok(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role = _role AND p.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid() AND NOT coalesce(must_change_password, false);
$$;
-- Before applying: confirm the is_staff signature/body above still matches production,
-- then run every SQL suite (test users must have must_change_password = false).
