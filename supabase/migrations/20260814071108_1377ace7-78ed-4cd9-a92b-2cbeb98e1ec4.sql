
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','management','bd_manager','pipeline_manager','team_member','client');
CREATE TYPE public.doc_status AS ENUM ('pending','uploaded','verified','rejected');
CREATE TYPE public.report_status AS ENUM ('draft','submitted','review','approved');
CREATE TYPE public.action_status AS ENUM ('not_started','in_progress','completed','delayed');
CREATE TYPE public.action_priority AS ENUM ('critical','high','medium','low');

-- UPDATED AT
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name text NOT NULL,
  owner_name text,
  contact_person text,
  email text,
  mobile text,
  whatsapp text,
  address text,
  city text,
  state text,
  country text DEFAULT 'India',
  pin_code text,
  number_of_rooms integer,
  property_type text,
  website text,
  gbp_url text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  linkedin_url text,
  extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  gbp_access_provided boolean NOT NULL DEFAULT false,
  gbp_access_status text NOT NULL DEFAULT 'pending',
  gbp_access_email text NOT NULL DEFAULT 'mohnish@group2001.in',
  payment_status text NOT NULL DEFAULT 'pending',
  payment_amount numeric,
  payment_date date,
  payment_mode text,
  transaction_id text,
  payment_screenshot_path text,
  description text,
  location_note text,
  nearest_airport text,
  nearest_railway text,
  tourist_attractions text,
  usp text,
  target_customer text,
  check_in text,
  check_out text,
  in_room_amenities text[] NOT NULL DEFAULT '{}',
  property_amenities text[] NOT NULL DEFAULT '{}',
  policy_cancellation text,
  policy_child text,
  policy_extra_bed text,
  policy_checkin text,
  policy_checkout text,
  policy_pet text,
  policy_other text,
  onboarding_status text NOT NULL DEFAULT 'in_progress',
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  mobile text,
  department text,
  photo_url text,
  status text NOT NULL DEFAULT 'active',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','management'));
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('admin','management','bd_manager','pipeline_manager','team_member'));
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

-- PIPELINES
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text,
  default_weight numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  backup_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date date,
  status text NOT NULL DEFAULT 'active',
  monthly_target text,
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, pipeline_id)
);

CREATE OR REPLACE FUNCTION public.can_view_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager(auth.uid())
      OR public.has_role(auth.uid(),'bd_manager')
      OR public.my_client_id() = _client_id
      OR EXISTS (SELECT 1 FROM public.client_pipelines cp
                 WHERE cp.client_id = _client_id
                   AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.can_edit_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager');
$$;

CREATE OR REPLACE FUNCTION public.manages_pipeline(_client_pipeline_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_pipelines cp WHERE cp.id = _client_pipeline_id
    AND (cp.manager_id = auth.uid() OR cp.backup_manager_id = auth.uid()));
$$;

-- ROOM CATEGORIES
CREATE TABLE public.room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  number_of_rooms integer,
  rack_rate numeric,
  selling_rate numeric,
  photos text[] NOT NULL DEFAULT '{}',
  amenities text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- DOCUMENTS
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'compliance',
  doc_type text NOT NULL,
  file_path text,
  status public.doc_status NOT NULL DEFAULT 'pending',
  mandatory boolean NOT NULL DEFAULT false,
  expiry_date date,
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CREDENTIALS
CREATE TABLE public.client_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  username text,
  password_cipher text,
  access_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.credential_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.client_credentials(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- KPI LIBRARY
CREATE TABLE public.kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  kpi_type text NOT NULL DEFAULT 'number',
  unit text,
  platform text,
  direction text NOT NULL DEFAULT 'higher_better',
  default_target numeric,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  kpi_definition_id uuid NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  month date,
  target numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_pipeline_id, kpi_definition_id, month)
);

-- MONTHLY REPORTS
CREATE TABLE public.monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_pipeline_id uuid NOT NULL REFERENCES public.client_pipelines(id) ON DELETE CASCADE,
  month date NOT NULL,
  status public.report_status NOT NULL DEFAULT 'draft',
  manager_comments text,
  challenges text,
  next_month_action text,
  work_items text[] NOT NULL DEFAULT '{}',
  highlights text[] NOT NULL DEFAULT '{}',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_pipeline_id, month)
);

CREATE OR REPLACE FUNCTION public.can_view_report(_client_id uuid, _client_pipeline_id uuid, _status public.report_status)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.my_client_id() = _client_id THEN _status = 'approved'
    ELSE public.can_view_client(_client_id)
  END;
$$;

CREATE TABLE public.kpi_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  kpi_definition_id uuid NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  target numeric,
  actual numeric,
  text_value text,
  achievement_pct numeric GENERATED ALWAYS AS (
    CASE WHEN target IS NOT NULL AND target > 0 AND actual IS NOT NULL
      THEN round((actual / target) * 100, 2) END) STORED,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, kpi_definition_id)
);

CREATE TABLE public.ota_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  ota_name text NOT NULL,
  room_nights numeric,
  revenue numeric,
  adr numeric,
  occupancy numeric,
  commission numeric,
  cancellation_pct numeric,
  ranking numeric,
  conversion_rate numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nap_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  name_ok boolean NOT NULL DEFAULT false,
  address_ok boolean NOT NULL DEFAULT false,
  phone_ok boolean NOT NULL DEFAULT false,
  website_ok boolean NOT NULL DEFAULT false,
  consistency_pct numeric,
  audit_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id)
);

-- INTERNAL NOTES
CREATE TABLE public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ACTION TRACKER
CREATE TABLE public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  issue text NOT NULL,
  action_required text,
  responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority public.action_priority NOT NULL DEFAULT 'medium',
  due_date date,
  status public.action_status NOT NULL DEFAULT 'not_started',
  comments text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  kind text NOT NULL DEFAULT 'info',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.profiles, public.user_roles,
  public.pipelines, public.client_pipelines, public.room_categories, public.documents,
  public.client_credentials, public.credential_access_log, public.kpi_definitions,
  public.client_kpi_targets, public.monthly_reports, public.kpi_entries, public.ota_records,
  public.nap_audits, public.internal_notes, public.action_items, public.notifications TO authenticated;
GRANT ALL ON public.clients, public.profiles, public.user_roles,
  public.pipelines, public.client_pipelines, public.room_categories, public.documents,
  public.client_credentials, public.credential_access_log, public.kpi_definitions,
  public.client_kpi_targets, public.monthly_reports, public.kpi_entries, public.ota_records,
  public.nap_audits, public.internal_notes, public.action_items, public.notifications TO service_role;

-- RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_kpi_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nap_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles staff read" ON public.profiles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles admin write" ON public.profiles FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- user_roles
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "roles staff read" ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "roles admin write" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- pipelines
CREATE POLICY "pipelines read" ON public.pipelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "pipelines admin write" ON public.pipelines FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- clients
CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated USING (public.can_view_client(id));
CREATE POLICY "clients write" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.can_edit_client(id));
CREATE POLICY "clients update" ON public.clients FOR UPDATE TO authenticated USING (public.can_edit_client(id)) WITH CHECK (public.can_edit_client(id));
CREATE POLICY "clients delete" ON public.clients FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

-- client_pipelines
CREATE POLICY "cp read" ON public.client_pipelines FOR SELECT TO authenticated USING (public.can_view_client(client_id));
CREATE POLICY "cp write" ON public.client_pipelines FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));

-- room categories
CREATE POLICY "rooms read" ON public.room_categories FOR SELECT TO authenticated USING (public.can_view_client(client_id));
CREATE POLICY "rooms write" ON public.room_categories FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));

-- documents (staff only)
CREATE POLICY "docs read" ON public.documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "docs write" ON public.documents FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));

-- credentials (managers/BD only, never clients)
CREATE POLICY "cred read" ON public.client_credentials FOR SELECT TO authenticated USING (public.can_edit_client(client_id));
CREATE POLICY "cred write" ON public.client_credentials FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));
CREATE POLICY "cred log read" ON public.credential_access_log FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "cred log write" ON public.credential_access_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- kpi definitions
CREATE POLICY "kpidef read" ON public.kpi_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpidef write" ON public.kpi_definitions FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- targets
CREATE POLICY "targets read" ON public.client_kpi_targets FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_pipelines cp WHERE cp.id = client_pipeline_id AND public.can_view_client(cp.client_id)));
CREATE POLICY "targets write" ON public.client_kpi_targets FOR ALL TO authenticated USING (
  public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id))
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));

-- monthly reports
CREATE POLICY "reports read" ON public.monthly_reports FOR SELECT TO authenticated
  USING (public.can_view_report(client_id, client_pipeline_id, status));
CREATE POLICY "reports insert" ON public.monthly_reports FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));
CREATE POLICY "reports update" ON public.monthly_reports FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()) OR (public.manages_pipeline(client_pipeline_id) AND status IN ('draft','submitted')))
  WITH CHECK (public.is_manager(auth.uid()) OR public.manages_pipeline(client_pipeline_id));
CREATE POLICY "reports delete" ON public.monthly_reports FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.report_visible(_report_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.monthly_reports r WHERE r.id = _report_id
    AND public.can_view_report(r.client_id, r.client_pipeline_id, r.status));
$$;

CREATE OR REPLACE FUNCTION public.report_editable(_report_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.monthly_reports r WHERE r.id = _report_id
    AND (public.is_manager(auth.uid()) OR public.manages_pipeline(r.client_pipeline_id)));
$$;

CREATE POLICY "entries read" ON public.kpi_entries FOR SELECT TO authenticated USING (public.report_visible(report_id));
CREATE POLICY "entries write" ON public.kpi_entries FOR ALL TO authenticated USING (public.report_editable(report_id)) WITH CHECK (public.report_editable(report_id));
CREATE POLICY "ota read" ON public.ota_records FOR SELECT TO authenticated USING (public.report_visible(report_id));
CREATE POLICY "ota write" ON public.ota_records FOR ALL TO authenticated USING (public.report_editable(report_id)) WITH CHECK (public.report_editable(report_id));
CREATE POLICY "nap read" ON public.nap_audits FOR SELECT TO authenticated USING (public.report_visible(report_id));
CREATE POLICY "nap write" ON public.nap_audits FOR ALL TO authenticated USING (public.report_editable(report_id)) WITH CHECK (public.report_editable(report_id));

-- internal notes: staff only
CREATE POLICY "notes read" ON public.internal_notes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "notes write" ON public.internal_notes FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND author_id = auth.uid());
CREATE POLICY "notes delete" ON public.internal_notes FOR DELETE TO authenticated USING (public.is_manager(auth.uid()) OR author_id = auth.uid());

-- action items: staff only
CREATE POLICY "actions read" ON public.action_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "actions write" ON public.action_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- notifications
CREATE POLICY "notif read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- TRIGGERS
CREATE TRIGGER t_clients_upd BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_cp_upd BEFORE UPDATE ON public.client_pipelines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_docs_upd BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_cred_upd BEFORE UPDATE ON public.client_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_kpidef_upd BEFORE UPDATE ON public.kpi_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_reports_upd BEFORE UPDATE ON public.monthly_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_entries_upd BEFORE UPDATE ON public.kpi_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_actions_upd BEFORE UPDATE ON public.action_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NEW USER HANDLER
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, mobile, department, client_id)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          NEW.email,
          NEW.raw_user_meta_data->>'mobile',
          NEW.raw_user_meta_data->>'department',
          NULLIF(NEW.raw_user_meta_data->>'client_id','')::uuid);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    _role := 'admin';
  ELSE
    BEGIN
      _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role','')::public.app_role, 'team_member');
    EXCEPTION WHEN others THEN _role := 'team_member';
    END;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED PIPELINES + KPI LIBRARY
INSERT INTO public.pipelines (code, name, icon, sort_order) VALUES
 ('performance_marketing','Performance Marketing','target',1),
 ('social_media','Social Media','share-2',2),
 ('gbp','Google Business Profile','map-pin',3),
 ('influencer','Influencer Marketing','sparkles',4),
 ('b2b','B2B Connect','handshake',5),
 ('whatsapp','WhatsApp Marketing','message-circle',6),
 ('ota','OTAs','globe',7);

INSERT INTO public.kpi_definitions (pipeline_id, name, kpi_type, platform, sort_order)
SELECT p.id, k.name, k.kpi_type, k.platform, k.ord
FROM public.pipelines p
JOIN (VALUES
 ('performance_marketing','Ad Spend','currency',NULL,1),
 ('performance_marketing','Impressions','number',NULL,2),
 ('performance_marketing','Clicks','number',NULL,3),
 ('performance_marketing','Leads','number',NULL,4),
 ('performance_marketing','Cost Per Lead','currency',NULL,5),
 ('performance_marketing','Bookings','number',NULL,6),
 ('performance_marketing','Revenue','currency',NULL,7),
 ('performance_marketing','ROAS','number',NULL,8),
 ('performance_marketing','Conversion Rate','percentage',NULL,9),
 ('social_media','Posts','number','Instagram',1),
 ('social_media','Reels','number','Instagram',2),
 ('social_media','Reach','number','Instagram',3),
 ('social_media','Engagement','number','Instagram',4),
 ('social_media','Followers','number','Instagram',5),
 ('social_media','Posts','number','Facebook',6),
 ('social_media','Reach','number','Facebook',7),
 ('social_media','Followers','number','Facebook',8),
 ('social_media','Videos','number','YouTube',9),
 ('social_media','Views','number','YouTube',10),
 ('social_media','Posts','number','LinkedIn',11),
 ('social_media','Leads','number',NULL,12),
 ('social_media','Enquiries','number',NULL,13),
 ('gbp','Profile Views','number',NULL,1),
 ('gbp','Search Views','number',NULL,2),
 ('gbp','Website Clicks','number',NULL,3),
 ('gbp','Phone Calls','number',NULL,4),
 ('gbp','Direction Requests','number',NULL,5),
 ('gbp','Messages','number',NULL,6),
 ('gbp','Reviews','number',NULL,7),
 ('gbp','Review Rating','rating',NULL,8),
 ('gbp','Photos Added','number',NULL,9),
 ('gbp','Posts Published','number',NULL,10),
 ('influencer','Influencers Contacted','number',NULL,1),
 ('influencer','Confirmed','number',NULL,2),
 ('influencer','Campaigns Completed','number',NULL,3),
 ('influencer','Reach','number',NULL,4),
 ('influencer','Engagement','number',NULL,5),
 ('influencer','Leads','number',NULL,6),
 ('influencer','Bookings','number',NULL,7),
 ('influencer','Revenue','currency',NULL,8),
 ('b2b','Travel Agents Contacted','number',NULL,1),
 ('b2b','Agents Added','number',NULL,2),
 ('b2b','Calls','number',NULL,3),
 ('b2b','Meetings','number',NULL,4),
 ('b2b','Follow-ups','number',NULL,5),
 ('b2b','Enquiries','number',NULL,6),
 ('b2b','Bookings','number',NULL,7),
 ('b2b','Revenue','currency',NULL,8),
 ('whatsapp','Campaigns','number',NULL,1),
 ('whatsapp','Messages Sent','number',NULL,2),
 ('whatsapp','Delivered','number',NULL,3),
 ('whatsapp','Read','number',NULL,4),
 ('whatsapp','Responses','number',NULL,5),
 ('whatsapp','Leads','number',NULL,6),
 ('whatsapp','Bookings','number',NULL,7),
 ('whatsapp','Revenue','currency',NULL,8),
 ('ota','Room Nights Sold','number',NULL,1),
 ('ota','Revenue','currency',NULL,2),
 ('ota','ADR','currency',NULL,3),
 ('ota','Occupancy','percentage',NULL,4),
 ('ota','Commission','currency',NULL,5),
 ('ota','Cancellation %','percentage',NULL,6),
 ('ota','Conversion Rate','percentage',NULL,7)
) AS k(code,name,kpi_type,platform,ord) ON k.code = p.code;
