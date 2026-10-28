ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS completed_at timestamptz, ADD COLUMN IF NOT EXISTS completed_by uuid;
CREATE OR REPLACE FUNCTION public.action_completion_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
      NEW.completed_at := OLD.completed_at; NEW.completed_by := OLD.completed_by;
    ELSE
      NEW.completed_at := now(); NEW.completed_by := auth.uid();
    END IF;
  ELSE
    NEW.completed_at := NULL; NEW.completed_by := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_actions_completion ON public.action_items;
CREATE TRIGGER t_actions_completion BEFORE INSERT OR UPDATE ON public.action_items FOR EACH ROW EXECUTE FUNCTION public.action_completion_stamp();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_task_reminders boolean NOT NULL DEFAULT true;
ALTER TABLE public.staff_digest_outbox ADD COLUMN IF NOT EXISTS email_skipped text;

CREATE OR REPLACE FUNCTION public._working_days_after(_d date, _n int) RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d date := _d; k int := 0;
BEGIN
  WHILE k < _n LOOP
    d := d + 1;
    IF extract(isodow FROM d) <> 7 AND NOT EXISTS (SELECT 1 FROM activity_holidays WHERE day = d) THEN k := k + 1; END IF;
  END LOOP;
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.task_digest_items(_on date) RETURNS TABLE(user_id uuid, item jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH lim AS (SELECT public._working_days_after(_on, 2) AS upto),
raw AS (
  SELECT u.uid, u.backup, 'launch'::text kind, t.id, t.name, c.id client_id, c.hotel_name, t.due_date, '/launches/'||t.launch_id link
  FROM client_tasks t JOIN clients c ON c.id=t.client_id JOIN client_launches l ON l.id=t.launch_id
  CROSS JOIN LATERAL (VALUES (t.assignee_id,false),(t.backup_id,true)) u(uid,backup)
  WHERE u.uid IS NOT NULL AND t.due_date IS NOT NULL AND t.status NOT IN ('done','not_applicable') AND NOT coalesce(t.exit_withdrawn,false)
    AND l.status IN ('active','live','offboarding') AND NOT task_gate_a_locked(t.id)
  UNION ALL
  SELECT u.uid, u.backup, 'monthly', r.id, a.name, c.id, c.hotel_name, r.due_date, '/my-tasks'
  FROM recurring_tasks r JOIN activity_items a ON a.id=r.item_id JOIN activity_plans ap ON ap.id=r.plan_id
  JOIN client_pipelines cp ON cp.id=ap.client_pipeline_id JOIN clients c ON c.id=cp.client_id
  CROSS JOIN LATERAL (VALUES (r.owner_id,false),(r.backup_id,true)) u(uid,backup)
  WHERE u.uid IS NOT NULL AND r.due_date IS NOT NULL AND r.status NOT IN ('done','closed','not_applicable','missed') AND NOT client_on_hold(c.id)
  UNION ALL
  SELECT ai.responsible_id, false, 'action', ai.id, ai.issue, c.id, c.hotel_name, ai.due_date, '/actions'
  FROM action_items ai JOIN clients c ON c.id=ai.client_id
  WHERE ai.responsible_id IS NOT NULL AND ai.due_date IS NOT NULL AND ai.status NOT IN ('completed','dropped')
)
SELECT r.uid, jsonb_build_object('kind',r.kind,'id',r.id,'name',r.name,'hotel',r.hotel_name,'due',r.due_date,'link',r.link,'backup',r.backup,
  'section', CASE WHEN r.due_date < _on THEN 'overdue' WHEN r.due_date = _on THEN 'today' ELSE 'upcoming' END,
  'days_overdue', GREATEST(_on - r.due_date, 0))
FROM raw r, lim
WHERE r.due_date <= lim.upto AND public.is_real_client(r.client_id) AND public.can_view_client_as(r.uid, r.client_id)
$$;

CREATE OR REPLACE FUNCTION public.build_task_digests(_at timestamptz) RETURNS TABLE(user_id uuid, email text, wants_email boolean, subject text, body text, items jsonb, overdue_n int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE local_at timestamp := _at AT TIME ZONE 'Asia/Kolkata'; d date := local_at::date; morning boolean := local_at::time = '11:00'::time; r record; b text; sec record;
BEGIN
  IF extract(isodow FROM local_at)=7 OR EXISTS(SELECT 1 FROM activity_holidays WHERE day=d) OR local_at::time NOT IN ('11:00'::time,'15:00'::time,'18:00'::time) THEN RETURN; END IF;
  FOR r IN SELECT x.user_id uid, p.email em, p.email_task_reminders wr,
      jsonb_agg(x.item ORDER BY x.item->>'due', x.item->>'hotel', x.item->>'name') its,
      count(*) FILTER (WHERE x.item->>'section'='overdue')::int ov,
      count(*) FILTER (WHERE x.item->>'section'='today')::int td,
      count(*) FILTER (WHERE x.item->>'section'='upcoming')::int up
    FROM task_digest_items(d) x JOIN profiles p ON p.id=x.user_id AND p.status='active'
    WHERE public.is_staff(p.id) AND NOT has_role(p.id,'client')
    GROUP BY x.user_id, p.email, p.email_task_reminders LOOP
    CONTINUE WHEN NOT morning AND r.ov = 0;
    b := '';
    FOR sec IN SELECT * FROM (VALUES ('overdue','Overdue',1),('today','Due today',2),('upcoming','Due in the next 2 working days',3)) s(k,title,o) ORDER BY o LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(r.its) v WHERE v->>'section'=sec.k) THEN
        b := b || CASE WHEN b='' THEN '' ELSE E'\n\n' END || sec.title || E'\n' ||
          (SELECT string_agg((v->>'hotel')||' · '||(v->>'name')||CASE WHEN (v->>'backup')::boolean THEN ' (as backup)' ELSE '' END
            ||' · due '||to_char((v->>'due')::date,'DD Mon')
            ||CASE WHEN (v->>'days_overdue')::int>0 THEN ' · '||(v->>'days_overdue')||' day'||CASE WHEN (v->>'days_overdue')::int=1 THEN '' ELSE 's' END||' overdue' ELSE '' END
            ||' · https://northstar.alcorgetaways.com'||(v->>'link'), E'\n' ORDER BY v->>'due', v->>'hotel', v->>'name')
           FROM jsonb_array_elements(r.its) v WHERE v->>'section'=sec.k);
      END IF;
    END LOOP;
    user_id := r.uid; email := r.em; wants_email := r.wr AND r.em IS NOT NULL; items := r.its; overdue_n := r.ov; body := b;
    subject := 'Your tasks · '||concat_ws(' · ', CASE WHEN r.ov>0 THEN r.ov||' overdue' END, CASE WHEN r.td>0 THEN r.td||' due today' END, CASE WHEN r.up>0 THEN r.up||' coming up' END)||' · '||to_char(local_at,'DD Mon HH24:MI');
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.queue_overdue_digest(_at timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; i uuid; n int := 0;
BEGIN
  FOR r IN SELECT * FROM build_task_digests(_at) LOOP
    i := NULL;
    INSERT INTO staff_digest_outbox(user_id,slot_at,to_address,subject,body,items,held,email_skipped)
    VALUES (r.user_id,_at,r.email,r.subject,r.body,r.items,true,
      CASE WHEN r.email IS NULL THEN 'no_email' WHEN NOT r.wants_email THEN 'opted_out' END)
    ON CONFLICT (user_id,slot_at) DO NOTHING RETURNING id INTO i;
    IF i IS NOT NULL THEN
      INSERT INTO notifications(user_id,title,body,link,kind) VALUES (r.user_id, r.subject, r.body, '/my-tasks', 'overdue_digest');
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public._working_days_after(date,int), public.task_digest_items(date), public.build_task_digests(timestamptz), public.queue_overdue_digest(timestamptz), public.action_completion_stamp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._working_days_after(date,int), public.task_digest_items(date), public.build_task_digests(timestamptz), public.queue_overdue_digest(timestamptz) TO service_role;