-- Q59/Q61: email queueing for approved owner reports and red-score alerts.
-- Everything stays HELD: owner_report rows wait for owner_emails_enabled,
-- red alerts wait for the main email_sending_enabled switch (outbox worker).
-- Nothing in this migration sends email.

ALTER TABLE public.client_message_outbox ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS client_message_outbox_dedupe_key_uq
  ON public.client_message_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;

INSERT INTO public.app_settings (key, value) VALUES ('owner_emails_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.q59_q61_on_report_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client record;
  v_score numeric;
  v_month_label text;
  v_recipient text;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT id, hotel_name, email, is_demo, is_test INTO v_client FROM public.clients WHERE id = NEW.client_id;
  IF v_client.id IS NULL OR v_client.is_demo OR v_client.is_test THEN
    RETURN NEW;
  END IF;
  v_month_label := to_char(NEW.month, 'FMMonth YYYY');

  -- Q59: last pending report of the client-month approved -> queue the combined
  -- report email to the owner's registered address. Held until the owner switch.
  IF v_client.email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.monthly_reports r
    WHERE r.client_id = NEW.client_id AND r.month = NEW.month AND r.status <> 'approved'
  ) THEN
    INSERT INTO public.client_message_outbox
      (client_id, channel, to_address, kind, subject, body, held, dedupe_key)
    VALUES (
      NEW.client_id, 'email', v_client.email, 'owner_monthly_report',
      'Your ' || v_month_label || ' report — ' || v_client.hotel_name,
      'Hello,' || E'\n\n'
        || 'Your combined ' || v_month_label || ' report for ' || v_client.hotel_name
        || ' has been approved and is ready in your North Star login (MY GROWTH):' || E'\n'
        || 'https://northstar.alcorgetaways.com/my-growth' || E'\n\n'
        || '— Alcor Getaways',
      true, 'owner_report:' || NEW.client_id || ':' || NEW.month
    ) ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  -- Q61: month's approved score turns Red -> alert pipeline staff, BD team and both
  -- founders. Held behind the main email switch; one email per person per month.
  v_score := public.approved_hotel_score(NEW.client_id, NEW.month);
  IF public.scorecard_band(v_score) = 'red' THEN
    FOR v_recipient IN
      SELECT DISTINCT lower(e) FROM (
        SELECT p.email AS e
        FROM public.client_staff_assignments a
        JOIN public.profiles p ON p.id = a.user_id
        WHERE a.client_id = NEW.client_id AND NOT a.excluded AND p.email IS NOT NULL
        UNION
        SELECT p.email
        FROM public.user_roles r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE r.role = 'bd_manager' AND p.email IS NOT NULL
        UNION SELECT 'tonny.sapra@group2001.in'
        UNION SELECT 'mohnish@group2001.in'
      ) s
    LOOP
      INSERT INTO public.client_message_outbox
        (client_id, channel, to_address, kind, subject, body, held, dedupe_key)
      VALUES (
        NEW.client_id, 'email', v_recipient, 'red_score_alert',
        'Red score alert — ' || v_client.hotel_name || ' (' || v_month_label || ')',
        'Hello,' || E'\n\n'
          || v_client.hotel_name || ' has turned Red for ' || v_month_label
          || ' (score ' || coalesce(v_score::text, 'n/a') || ').' || E'\n'
          || 'Please review the hotel in North Star and agree the recovery actions.' || E'\n\n'
          || '— Alcor North Star',
        false, 'red_alert:' || NEW.client_id || ':' || NEW.month || ':' || v_recipient
      ) ON CONFLICT (dedupe_key) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS q59_q61_report_approved ON public.monthly_reports;
CREATE TRIGGER q59_q61_report_approved
  AFTER INSERT OR UPDATE OF status ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.q59_q61_on_report_approved();