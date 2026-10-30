-- Day 0 requirements follow each signed plan's roadmap and agreement.
-- Diamond plans require a signed NOC; the GMB SEO plan does not.
UPDATE public.plans
SET day0_requires_noc = CASE code
  WHEN 'diamond_start' THEN true
  WHEN 'diamond_grow' THEN true
  WHEN 'diamond_scale' THEN true
  WHEN 'gmb_seo' THEN false
  ELSE day0_requires_noc
END
WHERE code IN ('diamond_start', 'diamond_grow', 'diamond_scale', 'gmb_seo');

-- Payment UTR/reference is required for all new Day 0 confirmations.
-- Existing screenshot paths remain stored and viewable, but cannot replace the UTR.
CREATE OR REPLACE FUNCTION public._day0_missing(l public.client_launches)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pl public.plans;
  since timestamptz;
  m text[] := '{}';
BEGIN
  SELECT * INTO pl FROM public.plans WHERE id = l.plan_id;
  since := CASE WHEN l.change_kind IN ('upgrade','relaunch') THEN l.created_at ELSE '-infinity'::timestamptz END;

  IF NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE client_id = l.client_id
      AND doc_type ILIKE 'Agreement%'
      AND status IN ('uploaded','verified')
      AND greatest(created_at, updated_at) >= since
  ) THEN
    m := array_append(m, CASE WHEN since > '-infinity' THEN 'a new signed agreement for this plan' ELSE 'signed agreement' END);
  END IF;

  IF coalesce(pl.day0_requires_noc, false) AND NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE client_id = l.client_id
      AND doc_type ILIKE 'NOC%'
      AND status IN ('uploaded','verified')
      AND greatest(created_at, updated_at) >= since
  ) THEN
    m := array_append(m, 'signed NOC');
  END IF;

  IF coalesce(l.advance_amount, 0) <= 0 THEN
    m := array_append(m, 'advance amount');
  END IF;
  IF l.advance_received_at IS NULL THEN
    m := array_append(m, 'advance payment date');
  END IF;
  IF coalesce(trim(l.payment_reference), '') = '' THEN
    m := array_append(m, 'payment UTR/reference');
  END IF;

  RETURN m;
END;
$$;
