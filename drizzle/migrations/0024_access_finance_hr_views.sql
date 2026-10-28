-- Prompt 8: Access page, Finance view, HR view reporting functions.
-- All read-only, security-definer, self-gated; safe to rerun.

-- Same visibility rule as can_view_client, parameterised by user (for "what this person can see").
CREATE OR REPLACE FUNCTION public.can_view_client_as(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','management','bd_manager','finance'))
    OR (SELECT client_id FROM public.profiles WHERE id = _user_id) = _client_id
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id
               AND c.parent_client_id = (SELECT client_id FROM public.profiles WHERE id = _user_id))
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.account_manager_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.client_staff_assignments a
               WHERE a.client_id = _client_id AND a.user_id = _user_id AND NOT a.excluded)
    OR EXISTS (SELECT 1 FROM public.client_module_assignments a
               WHERE a.client_id = _client_id AND (a.primary_user_id = _user_id OR a.backup_user_id = _user_id));
$$;
REVOKE ALL ON FUNCTION public.can_view_client_as(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_view_client_as(uuid, uuid) TO authenticated;

-- Access page: one row per login. Management/admin only.
CREATE OR REPLACE FUNCTION public.access_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Management only'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(t.row ORDER BY t.full_name), '[]'::jsonb)
    FROM (
      SELECT p.full_name,
        jsonb_build_object(
          'user_id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'status', p.status,
          'account_type', CASE
            WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'client')
              THEN CASE WHEN EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p.client_id AND c.is_test) THEN 'Test' ELSE 'Owner' END
            ELSE 'Staff' END,
          'roles', (SELECT coalesce(jsonb_agg(r.role::text), '[]'::jsonb) FROM public.user_roles r WHERE r.user_id = p.id),
          'department', p.department,
          'linked_clients', (
            SELECT coalesce(jsonb_agg(c.hotel_name ORDER BY c.hotel_name), '[]'::jsonb)
            FROM public.clients c
            WHERE c.id = p.client_id OR c.parent_client_id = p.client_id),
          'pipelines', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'code', pl.code, 'name', pl.name,
                     'role', CASE WHEN pm.role = 'head' THEN 'Head' ELSE 'Team' END)
                   ORDER BY pl.sort_order), '[]'::jsonb)
            FROM public.pipeline_members pm JOIN public.pipelines pl ON pl.id = pm.pipeline_id
            WHERE pm.user_id = p.id AND pm.active),
          'assigned_clients', (
            SELECT count(DISTINCT a.client_id) FROM public.client_staff_assignments a
            WHERE a.user_id = p.id AND NOT a.excluded),
          'am_clients', (SELECT count(*) FROM public.clients c WHERE c.account_manager_id = p.id AND NOT c.is_test),
          'must_change_password', coalesce(p.must_change_password, false),
          'last_sign_in_at', (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p.id),
          'joined_on', p.joined_on,
          'issues', (
            SELECT coalesce(jsonb_agg(issue), '[]'::jsonb) FROM (
              SELECT 'No email' AS issue WHERE p.email IS NULL
              UNION ALL
              SELECT 'No contract file'
              WHERE p.client_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.documents d JOIN public.clients c ON c.id = d.client_id
                WHERE (c.id = p.client_id OR c.parent_client_id = p.client_id) AND d.category = 'contract')
              UNION ALL
              SELECT 'Missing: ' || x.flag
              FROM public.clients c, lateral jsonb_array_elements_text(coalesce(c.import_flags, '[]'::jsonb)) AS x(flag)
              WHERE c.id = p.client_id AND x.flag LIKE 'missing_%'
              UNION ALL
              SELECT 'Unmatched services'
              WHERE EXISTS (
                SELECT 1 FROM public.client_launches l
                WHERE l.client_id = p.client_id AND l.import_flags::text LIKE '%unmatched%')
            ) issues)) AS row
      FROM public.profiles p
    ) t);
END;
$$;
REVOKE ALL ON FUNCTION public.access_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.access_overview() TO authenticated;

-- Read-only "what this person can see": roles, pipelines, visible clients (RLS-equivalent logic).
CREATE OR REPLACE FUNCTION public.person_access_summary(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Management only'; END IF;
  RETURN jsonb_build_object(
    'user_id', _user_id,
    'roles', (SELECT coalesce(jsonb_agg(r.role::text), '[]'::jsonb) FROM public.user_roles r WHERE r.user_id = _user_id),
    'managed_pipelines', (
      SELECT coalesce(jsonb_agg(DISTINCT pl.code), '[]'::jsonb)
      FROM public.pipelines pl
      WHERE pl.id IN (
        SELECT pm.pipeline_id FROM public.pipeline_members pm WHERE pm.user_id = _user_id AND pm.active
        UNION
        SELECT cp.pipeline_id FROM public.client_pipelines cp WHERE cp.manager_id = _user_id OR cp.backup_manager_id = _user_id)),
    'clients', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'hotel_name', c.hotel_name) ORDER BY c.hotel_name), '[]'::jsonb)
      FROM public.clients c
      WHERE public.can_view_client_as(_user_id, c.id)));
END;
$$;
REVOKE ALL ON FUNCTION public.person_access_summary(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.person_access_summary(uuid) TO authenticated;

-- Finance view: every client with launches and commercial terms, plus MRR.
CREATE OR REPLACE FUNCTION public.finance_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_commercials(auth.uid()) THEN RAISE EXCEPTION 'Commercial roles only'; END IF;
  RETURN jsonb_build_object(
    'mrr', (
      SELECT coalesce(sum(l.retainer_inr), 0)
      FROM public.client_launches l JOIN public.clients c ON c.id = l.client_id
      WHERE l.status IN ('active','live') AND NOT c.is_test),
    'clients', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'hotel_name', c.hotel_name,
        'is_test', c.is_test,
        'parent_client_id', c.parent_client_id,
        'account_manager', (SELECT p.full_name FROM public.profiles p WHERE p.id = c.account_manager_id),
        'launches', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id,
            'status', l.status,
            'plan_name', coalesce(cp.name, pl.name),
            'plan_code', pl.code,
            'is_custom', l.custom_plan_id IS NOT NULL,
            'retainer_inr', l.retainer_inr,
            'commission_direct_pct', l.commission_direct_pct,
            'commission_ota_pct', l.commission_ota_pct,
            'commission_weddings_pct', l.commission_weddings_pct,
            'commission_other_pct', l.commission_other_pct,
            'setup_fee_inr', l.setup_fee_inr,
            'deposit_inr', l.deposit_inr,
            'advance_amount', l.advance_amount,
            'payment_reference', l.payment_reference,
            'addons', (
              SELECT coalesce(jsonb_agg(a.name), '[]'::jsonb)
              FROM public.addons_catalogue a WHERE a.id = ANY(coalesce(l.snapshot_addon_ids, '{}'))),
            'contract_start', l.contract_start,
            'contract_end', l.contract_end,
            'renewal_date', l.renewal_date,
            'notice_deadline', l.notice_deadline,
            'closing_reason_code', l.closing_reason_code,
            'closed_at', l.closed_at
          ) ORDER BY l.created_at DESC), '[]'::jsonb)
          FROM public.client_launches l
          LEFT JOIN public.plans pl ON pl.id = l.plan_id
          LEFT JOIN public.custom_plans cp ON cp.id = l.custom_plan_id
          WHERE l.client_id = c.id)
      ) ORDER BY c.hotel_name), '[]'::jsonb)
      FROM public.clients c));
END;
$$;
REVOKE ALL ON FUNCTION public.finance_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.finance_overview() TO authenticated;

-- HR view: staff roster with title, joining, pipelines, workload. HR/management/admin only.
CREATE OR REPLACE FUNCTION public.hr_staff_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'HR and management only';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(t.row ORDER BY t.full_name), '[]'::jsonb)
    FROM (
      SELECT p.full_name,
        jsonb_build_object(
          'user_id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'status', p.status,
          'department', p.department,
          'joined_on', p.joined_on,
          'roles', (SELECT coalesce(jsonb_agg(r.role::text), '[]'::jsonb) FROM public.user_roles r WHERE r.user_id = p.id),
          'pipelines', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'code', pl.code, 'name', pl.name,
                     'role', CASE WHEN pm.role = 'head' THEN 'Head' ELSE 'Team' END)
                   ORDER BY pl.sort_order), '[]'::jsonb)
            FROM public.pipeline_members pm JOIN public.pipelines pl ON pl.id = pm.pipeline_id
            WHERE pm.user_id = p.id AND pm.active),
          'assigned_clients', (
            SELECT count(DISTINCT a.client_id) FROM public.client_staff_assignments a
            WHERE a.user_id = p.id AND NOT a.excluded)) AS row
      FROM public.profiles p
      WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role <> 'client')
    ) t);
END;
$$;
REVOKE ALL ON FUNCTION public.hr_staff_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.hr_staff_overview() TO authenticated;
