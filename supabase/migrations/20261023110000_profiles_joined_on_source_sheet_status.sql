ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS joined_on date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS source_sheet_status text;
COMMENT ON COLUMN public.profiles.joined_on IS 'Staff joining date, set by admin/management (e.g. from the reservations source sheet).';
COMMENT ON COLUMN public.profiles.source_sheet_status IS 'Status of the person in the external source sheet (e.g. "Pending creation"), set by admin/management.';

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(),'') = 'service_role' OR auth.uid() IS NULL OR public.is_manager(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.launch_roles IS DISTINCT FROM OLD.launch_roles
     OR NEW.joined_on IS DISTINCT FROM OLD.joined_on
     OR NEW.source_sheet_status IS DISTINCT FROM OLD.source_sheet_status THEN
    RAISE EXCEPTION 'You can only update your name, mobile and photo';
  END IF;
  RETURN NEW;
END;
$$;