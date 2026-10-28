ALTER TYPE public.action_status ADD VALUE IF NOT EXISTS 'dropped';
ALTER TABLE public.action_items ADD COLUMN evidence_url text;
ALTER TABLE public.action_items ADD COLUMN drop_reason text;
ALTER TABLE public.action_items ADD COLUMN link_ref text;
COMMENT ON COLUMN public.action_items.evidence_url IS 'Link to proof of completion (file, screenshot, report)';
COMMENT ON COLUMN public.action_items.drop_reason IS 'Required reason recorded when an action is dropped';
COMMENT ON COLUMN public.action_items.link_ref IS 'Optional link to the related KPI or red month (e.g. GBP calls, Sep 2026)';