-- P0-P9 launch phases: the single launch structure
CREATE TABLE IF NOT EXISTS public.launch_phases (
  code text PRIMARY KEY,
  name text NOT NULL,
  pipeline_code text,
  sort_order integer NOT NULL
);
GRANT SELECT ON public.launch_phases TO authenticated;
GRANT ALL ON public.launch_phases TO service_role;
ALTER TABLE public.launch_phases ENABLE ROW LEVEL SECURITY;
DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='launch_phases' AND policyname='phases_read') THEN
    CREATE POLICY phases_read ON public.launch_phases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
  END IF;
END $pol$;

INSERT INTO public.launch_phases (code, name, pipeline_code, sort_order) VALUES
  ('P0','Core Onboarding',NULL,0),
  ('P1','GMB SEO','gbp',1),
  ('P2','Social','social_media',2),
  ('P3','Performance','performance_marketing',3),
  ('P4','Email & B2B','email_marketing',4),
  ('P5','WhatsApp','whatsapp',5),
  ('P6','Influencer','influencer',6),
  ('P7','OTA & Rate Strategy','ota',7),
  ('P8','Sales & Reservations','reservations_desk',8),
  ('P9','Corporate Comms','corporate_comms',9)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, pipeline_code = EXCLUDED.pipeline_code, sort_order = EXCLUDED.sort_order;

-- Map each launch module to a phase and pipeline
ALTER TABLE public.launch_modules ADD COLUMN IF NOT EXISTS phase_code text REFERENCES public.launch_phases(code);
ALTER TABLE public.launch_modules ADD COLUMN IF NOT EXISTS pipeline_code text;
UPDATE public.launch_modules m SET phase_code = v.ph, pipeline_code = v.pp
FROM (VALUES
  ('AM','P0',NULL::text),('BD','P0',NULL),('FIN','P0',NULL),
  ('GMB','P1','gbp'),('CRE','P1','gbp'),('ORM','P1','gbp'),
  ('SMM','P2','social_media'),
  ('PM','P3','performance_marketing'),('GAD','P3','performance_marketing'),
  ('TA','P4','email_marketing'),
  ('WA','P5','whatsapp'),('FUN','P5','marketing_funnel'),
  ('INF','P6','influencer'),
  ('OTA','P7','ota'),('RV','P7','ota'),
  ('VRD','P8','reservations_desk'),('RES','P8','reservations_desk'),
  ('BRD','P9','corporate_comms')
) AS v(mc, ph, pp)
WHERE m.code = v.mc AND (m.phase_code IS DISTINCT FROM v.ph OR m.pipeline_code IS DISTINCT FROM v.pp);

-- Template-level phase/pipeline + supersession pointer (no rows deleted)
ALTER TABLE public.checklist_templates ADD COLUMN IF NOT EXISTS phase_code text;
ALTER TABLE public.checklist_templates ADD COLUMN IF NOT EXISTS pipeline_code text;
ALTER TABLE public.checklist_templates ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.checklist_templates(id);

UPDATE public.checklist_templates ct SET phase_code = m.phase_code, pipeline_code = m.pipeline_code
FROM public.launch_modules m
WHERE m.code = ct.module_code
  AND (ct.phase_code IS DISTINCT FROM m.phase_code OR ct.pipeline_code IS DISTINCT FROM m.pipeline_code);

-- Task 2 moves: funnel tasks -> Marketing Funnel Development (P5);
-- website audit / CRO / landing page tasks -> Website SEO (P1). Other BRD tasks stay Corporate Comms (P9).
UPDATE public.checklist_templates SET pipeline_code = 'marketing_funnel', phase_code = 'P5'
WHERE module_code = 'FUN' AND (pipeline_code IS DISTINCT FROM 'marketing_funnel' OR phase_code IS DISTINCT FROM 'P5');
UPDATE public.checklist_templates SET pipeline_code = 'website_seo', phase_code = 'P1'
WHERE module_code = 'BRD' AND code IN ('BRD.02','BRD.03','BRD.04','BRD.05','BRD.06','BRD.07','BRD.08','BRD.09','BRD.10','BRD.11')
  AND (pipeline_code IS DISTINCT FROM 'website_seo' OR phase_code IS DISTINCT FROM 'P1');

-- De-duplicate: one canonical template per (module, code, normalised name).
-- Canonical = the row referenced by existing client_tasks when present, else the highest-plan copy.
-- Duplicates stay in place, marked superseded and pointing at the canonical row.
WITH ref AS (
  SELECT DISTINCT template_id FROM public.client_tasks WHERE template_id IS NOT NULL
),
ranked AS (
  SELECT ct.id,
         first_value(ct.id) OVER (
           PARTITION BY ct.module_code, ct.code, lower(btrim(ct.name))
           ORDER BY (ref.template_id IS NOT NULL) DESC,
                    CASE p.code WHEN 'diamond_scale' THEN 0 WHEN 'diamond_grow' THEN 1 WHEN 'diamond_start' THEN 2 ELSE 3 END,
                    ct.sort_order, ct.id
         ) AS canonical_id
  FROM public.checklist_templates ct
  JOIN public.plans p ON p.id = ct.plan_id
  LEFT JOIN ref ON ref.template_id = ct.id
)
UPDATE public.checklist_templates ct
SET superseded_by = r.canonical_id
FROM ranked r
WHERE ct.id = r.id AND r.canonical_id <> ct.id AND ct.superseded_by IS NULL;

-- Plan tags: a canonical task applies to every plan whose roadmap contained it
CREATE TABLE IF NOT EXISTS public.checklist_template_plans (
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id),
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  PRIMARY KEY (template_id, plan_id)
);
GRANT SELECT ON public.checklist_template_plans TO authenticated;
GRANT ALL ON public.checklist_template_plans TO service_role;
ALTER TABLE public.checklist_template_plans ENABLE ROW LEVEL SECURITY;
DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='checklist_template_plans' AND policyname='ctp_read') THEN
    CREATE POLICY ctp_read ON public.checklist_template_plans FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
  END IF;
END $pol$;

INSERT INTO public.checklist_template_plans (template_id, plan_id)
SELECT DISTINCT COALESCE(ct.superseded_by, ct.id), ct.plan_id
FROM public.checklist_templates ct
ON CONFLICT (template_id, plan_id) DO NOTHING;

-- Phase on existing tasks and gates so current launches (Palm Spring) group correctly
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS phase_code text;
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS pipeline_code text;
UPDATE public.client_tasks t SET phase_code = ct.phase_code, pipeline_code = ct.pipeline_code
FROM public.checklist_templates ct
WHERE ct.id = t.template_id
  AND (t.phase_code IS DISTINCT FROM ct.phase_code OR t.pipeline_code IS DISTINCT FROM ct.pipeline_code);

ALTER TABLE public.gate_criteria ADD COLUMN IF NOT EXISTS phase_code text;
ALTER TABLE public.client_gates ADD COLUMN IF NOT EXISTS phase_code text;
WITH m(gc, ph) AS (VALUES
  ('day0','P0'),('gate_a','P0'),('gate_b','P1'),('gate_c','P1'),('gate_d','P1'),('gmb','P1'),
  ('landing_page','P1'),('smm','P2'),('ads','P3'),('ta_connect','P4'),('drip','P5'),('funnel','P5'),
  ('influencer','P6'),('ota','P7'),('rate','P7'),('desk','P8')
)
UPDATE public.gate_criteria g SET phase_code = m.ph FROM m WHERE g.gate_code = m.gc AND g.phase_code IS DISTINCT FROM m.ph;
WITH m(gc, ph) AS (VALUES
  ('day0','P0'),('gate_a','P0'),('gate_b','P1'),('gate_c','P1'),('gate_d','P1'),('gmb','P1'),
  ('landing_page','P1'),('smm','P2'),('ads','P3'),('ta_connect','P4'),('drip','P5'),('funnel','P5'),
  ('influencer','P6'),('ota','P7'),('rate','P7'),('desk','P8')
)
UPDATE public.client_gates g SET phase_code = m.ph FROM m WHERE g.gate_code = m.gc AND g.phase_code IS DISTINCT FROM m.ph;