-- Allow trusted direct-DB roles (no JWT claims) and the service role to change the flag;
-- still blocks anon/authenticated PostgREST users from clearing their own flag.
CREATE OR REPLACE FUNCTION public.protect_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND auth.role() IS NOT NULL
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'must_change_password can only be changed by the server';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_must_change_password() FROM anon, authenticated;