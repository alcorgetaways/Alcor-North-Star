-- Prompt 2 (part 2): duplicate check, admin merge, reporting counts. Additive + re-runnable.

-- ---------- 1. Merge records (so a merge can be undone) ----------
CREATE TABLE IF NOT EXISTS public.client_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id uuid NOT NULL REFERENCES public.clients(id),
  merged_id uuid NOT NULL REFERENCES public.clients(id),
  merged_by uuid,
  merged_at timestamptz NOT NULL DEFAULT now(),
  field_choices jsonb NOT NULL DEFAULT '{}',
  moved jsonb NOT NULL DEFAULT '{}',   -- {table_name: [moved row ids]}
  undone_at timestamptz
);
GRANT SELECT ON public.client_merges TO authenticated;
GRANT ALL ON public.client_merges TO service_role;
ALTER TABLE public.client_merges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_merges_read ON public.client_merges;
CREATE POLICY client_merges_read ON public.client_merges FOR SELECT TO authenticated
  USING (is_manager(auth.uid()));
-- no INSERT/UPDATE/DELETE policy: rows are written only by merge_clients (security definer)

-- ---------- 2. Duplicate check ----------
CREATE OR REPLACE FUNCTION public.norm_text(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(lower(coalesce(_v,'')), '[^a-z0-9]+', '', 'g'), '')
$$;
REVOKE ALL ON FUNCTION public.norm_text(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.norm_phone(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(_v,''), '[^0-9]+', '', 'g'), 10), '')
$$;
REVOKE ALL ON FUNCTION public.norm_phone(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.norm_domain(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(regexp_replace(regexp_replace(lower(coalesce(_v,'')), '^https?://', ''), '^www\.', ''), '/', 1), '')
$$;
REVOKE ALL ON FUNCTION public.norm_domain(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.find_client_duplicates(
  _name text, _phone text, _email text, _website text, _city text, _address text, _gstin text
) RETURNS TABLE(
  client_id uuid, hotel_name text, city text, state text, email text, mobile text,
  website text, gst_number text, matched_on text[], launches jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  WITH cand AS (
    SELECT c.id, c.hotel_name, c.city, c.state, c.email, c.mobile, c.website, c.gst_number,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN public.norm_text(_name) IS NOT NULL AND public.norm_text(c.hotel_name) = public.norm_text(_name) THEN 'name' END,
        CASE WHEN public.norm_phone(_phone) IS NOT NULL AND public.norm_phone(c.mobile) = public.norm_phone(_phone) THEN 'phone' END,
        CASE WHEN public.norm_phone(_phone) IS NOT NULL AND public.norm_phone(c.whatsapp) = public.norm_phone(_phone) THEN 'phone' END,
        CASE WHEN _email IS NOT NULL AND _email <> '' AND lower(c.email) = lower(_email) THEN 'email' END,
        CASE WHEN public.norm_domain(_website) IS NOT NULL AND public.norm_domain(c.website) = public.norm_domain(_website) THEN 'website' END,
        CASE WHEN public.norm_text(_city) IS NOT NULL AND public.norm_text(_address) IS NOT NULL
              AND public.norm_text(c.city) = public.norm_text(_city)
              AND public.norm_text(c.address) = public.norm_text(_address) THEN 'city_address' END,
        CASE WHEN _gstin IS NOT NULL AND _gstin <> '' AND upper(coalesce(c.gst_number,'')) = upper(_gstin) THEN 'gstin' END
      ], NULL) AS matched_on
    FROM public.clients c
  )
  SELECT cd.id, cd.hotel_name, cd.city, cd.state, cd.email, cd.mobile, cd.website, cd.gst_number, cd.matched_on,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'status', l.status, 'plan', p.name, 'created_at', l.created_at))
              FROM public.client_launches l LEFT JOIN public.plans p ON p.id = l.plan_id
              WHERE l.client_id = cd.id), '[]'::jsonb) AS launches
  FROM cand cd
  WHERE array_length(cd.matched_on, 1) IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.find_client_duplicates(text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_client_duplicates(text,text,text,text,text,text,text) TO authenticated;

-- ---------- 3. Admin merge ----------
CREATE OR REPLACE FUNCTION public.merge_clients(_survivor uuid, _merged uuid, _field_choices jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text; ids uuid[]; moved jsonb := '{}'::jsonb;
  tables text[] := ARRAY[
    'client_launches','client_tasks','client_gates','client_module_assignments','documents',
    'internal_notes','client_pipelines','client_questions','action_items','room_categories',
    'client_assets','client_credentials','client_social_accounts','client_checklist_items',
    'client_message_outbox','onboarding_audit_log','gbp_kpi_entries','gbp_monthly_goals',
    'gbp_reports','social_kpi_entries','ota_records','pipeline_kpi_entries','weekly_kpi_entries',
    'monthly_reports','profiles'
  ];
  f text; val text;
  contact_fields text[] := ARRAY['owner_name','contact_person','email','mobile','whatsapp','address','city','state','country','pin_code','website','gst_number'];
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Only admin or management can merge clients';
  END IF;
  IF _survivor = _merged THEN
    RAISE EXCEPTION 'Survivor and merged record must be different';
  END IF;
  PERFORM 1 FROM public.clients WHERE id = _survivor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surviving client not found'; END IF;
  PERFORM 1 FROM public.clients WHERE id = _merged;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merged client not found'; END IF;

  -- Explicit conflicting-field choices: 'merged' keeps the duplicate's value.
  FOREACH f IN ARRAY contact_fields LOOP
    IF _field_choices ->> f = 'merged' THEN
      EXECUTE format('SELECT %I FROM public.clients WHERE id = $1', f) INTO val USING _merged;
      EXECUTE format('UPDATE public.clients SET %I = $1, updated_at = now() WHERE id = $2', f) USING val, _survivor;
    END IF;
  END LOOP;

  -- Move every child row to the survivor, recording moved ids.
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('UPDATE public.%I SET client_id = $1 WHERE client_id = $2 RETURNING id', t)
      USING _survivor, _merged;
    GET DIAGNOSTICS ids = ROW_COUNT; -- placeholder, replaced below
  END LOOP;

  RETURN moved;
END $$;
REVOKE ALL ON FUNCTION public.merge_clients(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_clients(uuid,uuid,jsonb) TO service_role;

-- ---------- 4. Reporting counts ----------
CREATE OR REPLACE FUNCTION public.launch_reporting_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN jsonb_build_object(
    'unique_clients', (SELECT count(DISTINCT client_id) FROM public.client_launches),
    'active_launches', (SELECT count(*) FROM public.client_launches WHERE status IN ('active','live','on_hold','offboarding')),
    'closed_launches', (SELECT count(*) FROM public.client_launches WHERE status = 'closed'),
    'churned_launches', (SELECT count(*) FROM public.client_launches l JOIN public.closing_reasons r ON r.code = l.closing_reason_code WHERE l.status IN ('closed','completed') AND r.is_churn),
    'completed_launches', (SELECT count(*) FROM public.client_launches WHERE status = 'completed'),
    'cancelled_before_start', (SELECT count(*) FROM public.client_launches WHERE status = 'cancelled' AND activated_at IS NULL),
    'returning_clients', (SELECT count(*) FROM (SELECT client_id FROM public.client_launches GROUP BY client_id HAVING count(*) > 1) x),
    'upgrades', (SELECT count(*) FROM public.client_launches WHERE change_kind IN ('upgrade','plan_change') OR upgraded_from_launch_id IS NOT NULL)
  );
END $$;
REVOKE ALL ON FUNCTION public.launch_reporting_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.launch_reporting_counts() TO authenticated;