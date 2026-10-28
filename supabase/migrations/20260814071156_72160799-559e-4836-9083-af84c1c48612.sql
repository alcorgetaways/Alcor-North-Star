
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_client_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_client(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_client(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.manages_pipeline(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_report(uuid, uuid, public.report_status) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_visible(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_editable(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_client_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manages_pipeline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_report(uuid, uuid, public.report_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_visible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_editable(uuid) TO authenticated, service_role;

CREATE POLICY "client files staff read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'client-files' AND public.is_staff(auth.uid()));
CREATE POLICY "client files staff write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-files' AND public.is_staff(auth.uid()));
CREATE POLICY "client files staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'client-files' AND public.is_staff(auth.uid()));
CREATE POLICY "client files staff delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'client-files' AND public.is_manager(auth.uid()));
