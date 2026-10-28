ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Only the service role (server functions) may change the flag; a flagged user
-- cannot clear it through their own profile UPDATE.
CREATE OR REPLACE FUNCTION public.protect_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'must_change_password can only be changed by the server';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_must_change_password() FROM anon, authenticated;

DROP TRIGGER IF EXISTS protect_must_change_password ON public.profiles;
CREATE TRIGGER protect_must_change_password
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_must_change_password();