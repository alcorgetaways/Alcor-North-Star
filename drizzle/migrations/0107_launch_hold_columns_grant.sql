-- Non-commercial launch columns added after the column-level lock were never granted,
-- so the client page's launch list and on-hold banner were refused (403). RLS row rules unchanged.
GRANT SELECT (no_launch_checklist, on_hold_reason, on_hold_since) ON public.client_launches TO authenticated;