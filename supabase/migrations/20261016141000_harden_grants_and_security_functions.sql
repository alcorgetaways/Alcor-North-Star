-- 1. Defence in depth: remove Supabase's default anon table grants (RLS already blocks reads).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- 2. check_rate_limit: bound inputs, service-role only (called via supabaseAdmin).
CREATE OR REPLACE FUNCTION public.check_rate_limit(_key text, _max integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF _max < 1 OR _max > 1000 OR _window_seconds < 1 OR _window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit parameters';
  END IF;
  DELETE FROM rate_limits WHERE created_at < now() - interval '1 day';
  SELECT count(*) INTO n FROM rate_limits
  WHERE key = _key AND created_at > now() - make_interval(secs => _window_seconds);
  IF n >= _max THEN RETURN false; END IF;
  INSERT INTO rate_limits (key) VALUES (_key);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- 3. log_admin_action: service-role only; actor passed explicitly (admin client has no auth.uid()).
CREATE OR REPLACE FUNCTION public.log_admin_action(_actor uuid, _action text, _target_type text DEFAULT NULL, _target_id text DEFAULT NULL, _outcome text DEFAULT 'ok', _details jsonb DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_audit_log (actor, action, target_type, target_id, outcome, details)
  VALUES (_actor, _action, _target_type, _target_id, _outcome, _details);
END $$;
REVOKE ALL ON FUNCTION public.log_admin_action(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, text, jsonb) TO service_role;