-- QA-02: KPI figures can't be negative (verified 26 Oct: 0 existing violations). social new_followers may be negative (net loss) and is left unconstrained.
ALTER TABLE public.gbp_kpi_entries ADD CONSTRAINT gbp_kpi_entries_nonneg CHECK (
  coalesce(posts,0)>=0 AND coalesce(photos,0)>=0 AND coalesce(five_star_reviews,0)>=0 AND coalesce(profile_interactions,0)>=0
  AND coalesce(chat_clicks,0)>=0 AND coalesce(calls,0)>=0 AND coalesce(website_clicks,0)>=0 AND coalesce(views,0)>=0
  AND coalesce(booking_clicks,0)>=0 AND coalesce(direction_requests,0)>=0);
ALTER TABLE public.ota_records ADD CONSTRAINT ota_records_nonneg CHECK (
  coalesce(room_nights,0)>=0 AND coalesce(revenue,0)>=0 AND coalesce(adr,0)>=0 AND coalesce(occupancy,0)>=0 AND coalesce(commission,0)>=0
  AND coalesce(cancellation_pct,0)>=0 AND coalesce(ranking,0)>=0 AND coalesce(conversion_rate,0)>=0 AND coalesce(live_channels,0)>=0
  AND coalesce(new_channels,0)>=0 AND coalesce(active_channels,0)>=0 AND coalesce(content_score,0)>=0 AND coalesce(reputation_score,0)>=0
  AND coalesce(bookings,0)>=0);
ALTER TABLE public.weekly_kpi_entries ADD CONSTRAINT weekly_kpi_entries_nonneg CHECK (
  coalesce(ad_spend,0)>=0 AND coalesce(leads,0)>=0 AND coalesce(campaigns_live,0)>=0 AND coalesce(cost_per_lead,0)>=0);
ALTER TABLE public.social_kpi_entries ADD CONSTRAINT social_kpi_entries_nonneg CHECK (
  coalesce(posts,0)>=0 AND coalesce(followers,0)>=0 AND coalesce(content_views,0)>=0 AND coalesce(profile_views,0)>=0 AND coalesce(engagement,0)>=0);

-- QA-10: one call for the Gate A lock flag of many tasks. SECURITY INVOKER: only tasks the caller can read (RLS) are returned.
CREATE OR REPLACE FUNCTION public.tasks_gate_a_locked(_tasks uuid[])
RETURNS TABLE(task_id uuid, locked boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT t.id, public.task_gate_a_locked(t.id) FROM public.client_tasks t WHERE t.id = ANY(_tasks) $$;
REVOKE ALL ON FUNCTION public.tasks_gate_a_locked(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tasks_gate_a_locked(uuid[]) TO authenticated, service_role;