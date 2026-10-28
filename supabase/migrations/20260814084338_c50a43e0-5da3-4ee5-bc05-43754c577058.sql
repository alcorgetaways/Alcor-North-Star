
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS service_model text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS pro_hotelier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maps_url text,
  ADD COLUMN IF NOT EXISTS reservation_email text,
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS onboarding_stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS bd_owner_id uuid REFERENCES public.profiles(id);

CREATE TABLE IF NOT EXISTS public.onboarding_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  item text NOT NULL,
  pipeline_code text,
  pro_hotelier_only boolean NOT NULL DEFAULT false,
  mandatory boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_checklist_templates TO authenticated;
GRANT ALL ON public.onboarding_checklist_templates TO service_role;
ALTER TABLE public.onboarding_checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates readable by staff" ON public.onboarding_checklist_templates
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "templates managed by admin" ON public.onboarding_checklist_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.client_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.onboarding_checklist_templates(id) ON DELETE SET NULL,
  section text NOT NULL,
  item text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'not_started',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_checklist_items TO authenticated;
GRANT ALL ON public.client_checklist_items TO service_role;
ALTER TABLE public.client_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist viewable" ON public.client_checklist_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "checklist editable" ON public.client_checklist_items
  FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));
CREATE TRIGGER client_checklist_items_updated BEFORE UPDATE ON public.client_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  file_path text,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_assets TO authenticated;
GRANT ALL ON public.client_assets TO service_role;
ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets viewable" ON public.client_assets
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "assets editable" ON public.client_assets
  FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));
CREATE TRIGGER client_assets_updated BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  profile_url text,
  username text,
  access_required boolean NOT NULL DEFAULT true,
  access_received boolean NOT NULL DEFAULT false,
  access_verified boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_social_accounts TO authenticated;
GRANT ALL ON public.client_social_accounts TO service_role;
ALTER TABLE public.client_social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social viewable" ON public.client_social_accounts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "social editable" ON public.client_social_accounts
  FOR ALL TO authenticated USING (public.can_edit_client(client_id)) WITH CHECK (public.can_edit_client(client_id));
CREATE TRIGGER client_social_accounts_updated BEFORE UPDATE ON public.client_social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.onboarding_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  field text,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.onboarding_audit_log TO authenticated;
GRANT ALL ON public.onboarding_audit_log TO service_role;
ALTER TABLE public.onboarding_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit viewable" ON public.onboarding_audit_log
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.can_view_client(client_id));
CREATE POLICY "audit insertable" ON public.onboarding_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_client(client_id) AND user_id = auth.uid());

INSERT INTO public.onboarding_checklist_templates (section, item, pipeline_code, pro_hotelier_only, mandatory, sort_order) VALUES
('Client Information','Property master information captured',NULL,false,true,10),
('Client Information','Google Maps location link',NULL,false,true,20),
('Client Information','Room categories & rates recorded',NULL,false,true,30),
('Client Information','Amenities and nearby attractions',NULL,false,false,40),
('Client Information','GST details for invoicing',NULL,false,false,50),
('Documents','Signed agreement received',NULL,false,true,10),
('Documents','NOC received',NULL,false,true,20),
('Documents','Payment confirmation received',NULL,false,true,30),
('Documents','Compliance documents uploaded',NULL,false,true,40),
('Assets','HD property logo',NULL,false,true,10),
('Assets','Vector logo',NULL,false,false,20),
('Assets','High-resolution property images',NULL,false,true,30),
('Assets','Room category images',NULL,false,true,40),
('Assets','Pool / restaurant / activity images',NULL,false,false,50),
('Assets','Drone shots',NULL,false,false,60),
('Assets','Short video clips',NULL,false,false,70),
('Assets','Property walkthrough video',NULL,false,false,80),
('Access','Instagram business page access',NULL,false,true,10),
('Access','Facebook business page access',NULL,false,true,20),
('Access','YouTube channel access',NULL,false,false,30),
('Access','LinkedIn business page access',NULL,false,false,40),
('Access','Pinterest business page access',NULL,false,false,50),
('Access','Google Business Profile access verified','gbp',false,true,60),
('Access','Brand consistency check (logo, contacts, website, address)',NULL,false,true,70),
('Access','SEO description with location keywords & booking CTA',NULL,false,false,80),
('Email Setup','Domain identified',NULL,false,false,10),
('Email Setup','Business email accounts created (reservations/info/sales)',NULL,false,false,20),
('Email Setup','Mobile login configured',NULL,false,false,30),
('Email Setup','Forwarding / CRM integration configured',NULL,false,false,40),
('Integrations','IVR setup','performance_marketing',false,false,10),
('Integrations','Website form integration','performance_marketing',false,true,20),
('Integrations','WhatsApp API connection','whatsapp',false,true,30),
('Integrations','CRM lead capture','performance_marketing',false,true,40),
('Integrations','Lead notification automation','performance_marketing',false,false,50),
('WhatsApp Business','WhatsApp Business profile verified','whatsapp',false,true,10),
('WhatsApp Business','Logo, description, website, email, address set','whatsapp',false,true,20),
('WhatsApp Business','Business category set','whatsapp',false,false,30),
('WhatsApp Business','Quick replies configured','whatsapp',false,false,40),
('Pro Hotelier Chatbot','Greeting & inquiry-type flow built','whatsapp',true,true,10),
('Pro Hotelier Chatbot','FAQ responses configured','whatsapp',true,true,20),
('Pro Hotelier Chatbot','Lead capture (name / date / guests)','whatsapp',true,true,30),
('Pro Hotelier Chatbot','Transfer to sales team configured','whatsapp',true,true,40),
('Collaterals','Picture presentation PDF',NULL,false,false,10),
('Collaterals','Explore PDF',NULL,false,false,20),
('Collaterals','Property factsheet',NULL,false,true,30),
('Collaterals','Package posters',NULL,false,false,40),
('Rate Sheet','Master rate sheet (weekday/weekend, extra person, meal plans, child policy)',NULL,false,true,10),
('Rate Sheet','Rate PDF with images, inclusions & terms',NULL,false,false,20),
('Rate Sheet','Rate email template',NULL,false,false,30),
('Meta Ads Setup','Meta Business Manager','performance_marketing',false,true,10),
('Meta Ads Setup','Facebook page linked','performance_marketing',false,true,20),
('Meta Ads Setup','Instagram page linked','performance_marketing',false,true,30),
('Meta Ads Setup','Ad account access','performance_marketing',false,true,40),
('Meta Ads Setup','Business verification','performance_marketing',false,false,50),
('Meta Ads Setup','Domain verification','performance_marketing',false,false,60),
('Meta Ads Setup','Pixel installed','performance_marketing',false,true,70),
('Meta Ads Setup','Conversion API configured','performance_marketing',false,false,80),
('Google Ads Setup','Google Ads account access','performance_marketing',false,true,10),
('Google Ads Setup','Billing setup','performance_marketing',false,true,20),
('Google Ads Setup','Conversion tracking','performance_marketing',false,true,30),
('Google Ads Setup','Google Tag Manager','performance_marketing',false,false,40),
('Google Ads Setup','Analytics integration','performance_marketing',false,false,50),
('Strategy','Search campaign keyword groups agreed','performance_marketing',false,false,10),
('Strategy','Performance Max / Discovery / Display / YouTube plan','performance_marketing',false,false,20),
('Strategy','Remarketing audiences defined','performance_marketing',false,false,30),
('Strategy','Meta funnel content plan (top / middle / bottom)','performance_marketing',false,false,40),
('Pre-Launch','Pixel working','performance_marketing',false,true,10),
('Pre-Launch','Lead form working','performance_marketing',false,true,20),
('Pre-Launch','CRM capturing leads','performance_marketing',false,true,30),
('Pre-Launch','WhatsApp connected','performance_marketing',false,true,40),
('Pre-Launch','Landing page working','performance_marketing',false,true,50),
('Pre-Launch','Call tracking active','performance_marketing',false,false,60),
('Pipeline Setup','Purchased pipelines selected',NULL,false,true,10),
('Team Allocation','Pipeline manager & backup assigned for every pipeline',NULL,false,true,10),
('Team Allocation','Monthly KPI targets set',NULL,false,true,20),
('Handover','Marketing team handover (calendar, assets, reels strategy, access)',NULL,false,true,10),
('Handover','Sales team handover (rate sheet, presentation, explore PDF, scripts, SOP)',NULL,false,true,20),
('Handover','Performance team handover (ad accounts, strategy, tracking, budget, landing page)','performance_marketing',false,true,30);
