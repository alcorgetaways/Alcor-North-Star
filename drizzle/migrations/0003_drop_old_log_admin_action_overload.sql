-- Remove the old authenticated-callable overload; only the service-role (actor-explicit) variant remains.
DROP FUNCTION public.log_admin_action(text, text, text, text, jsonb);