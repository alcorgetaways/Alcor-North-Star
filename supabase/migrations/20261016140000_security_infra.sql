-- Rate limiting: DB-backed, service-role-only storage, checked via security-definer function.
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limits_key_created ON public.rate_limits (key, created_at);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(_key text, _max integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM rate_limits WHERE created_at < now() - interval '1 day';
  SELECT count(*) INTO n FROM rate_limits
  WHERE key = _key AND created_at > now() - make_interval(secs => _window_seconds);
  IF n >= _max THEN RETURN false; END IF;
  INSERT INTO rate_limits (key) VALUES (_key);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;

-- Admin audit log: management read-only, inserts only via security-definer function, no update/delete.
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  outcome text NOT NULL DEFAULT 'ok',
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_admin_action(_action text, _target_type text DEFAULT NULL, _target_id text DEFAULT NULL, _outcome text DEFAULT 'ok', _details jsonb DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_audit_log (actor, action, target_type, target_id, outcome, details)
  VALUES (auth.uid(), _action, _target_type, _target_id, _outcome, _details);
END $$;
REVOKE ALL ON FUNCTION public.log_admin_action(text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, text, jsonb) TO authenticated;

-- Trigger-based audit for sensitive table changes (plan change, Day 0 shift, termination notice,
-- report approve/reopen, scoring settings) that happen as direct table writes.
CREATE OR REPLACE FUNCTION public.admin_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_audit_log (actor, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    coalesce(NEW.id::text, OLD.id::text),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.admin_audit_trigger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_monthly_reports AFTER UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_trigger();
CREATE TRIGGER audit_client_launches AFTER UPDATE ON public.client_launches
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_trigger();
CREATE TRIGGER audit_app_settings AFTER UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_trigger();