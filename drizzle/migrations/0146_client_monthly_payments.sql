CREATE TABLE public.client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  billing_month date NOT NULL CHECK (billing_month = date_trunc('month', billing_month)::date),
  amount_inr numeric(12,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  utr_number text,
  evidence_url text,
  evidence_path text,
  note text,
  recorded_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, billing_month),
  CHECK (evidence_url IS NULL OR evidence_url ~ '^https://'),
  CHECK (evidence_path IS NULL OR evidence_path LIKE client_id::text || '/payment-evidence/%')
);
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_payments TO authenticated;
CREATE POLICY client_payments_read ON public.client_payments FOR SELECT TO authenticated
USING (public.can_view_client_full(client_id));

CREATE FUNCTION public.save_client_payment(
  _client_id uuid, _month date, _amount numeric DEFAULT NULL, _status text DEFAULT 'pending',
  _utr text DEFAULT NULL, _evidence_url text DEFAULT NULL, _evidence_path text DEFAULT NULL, _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'bd_manager') OR public.has_role(auth.uid(),'finance')) THEN
    RAISE EXCEPTION 'Finance, BD or management access required';
  END IF;
  IF NOT public.can_view_client_full(_client_id) THEN RAISE EXCEPTION 'Client is outside your access scope'; END IF;
  IF _month IS NULL OR _month <> date_trunc('month',_month)::date OR _status NOT IN ('pending','paid') THEN RAISE EXCEPTION 'Choose a valid billing month and status'; END IF;
  IF _amount IS NOT NULL AND _amount < 0 THEN RAISE EXCEPTION 'Amount cannot be negative'; END IF;
  IF _evidence_url IS NOT NULL AND _evidence_url !~ '^https://' THEN RAISE EXCEPTION 'Evidence link must use HTTPS'; END IF;
  IF _evidence_path IS NOT NULL AND _evidence_path NOT LIKE _client_id::text || '/payment-evidence/%' THEN RAISE EXCEPTION 'Invalid evidence file path'; END IF;
  INSERT INTO public.client_payments(client_id,billing_month,amount_inr,status,utr_number,evidence_url,evidence_path,note,recorded_by,updated_at)
  VALUES(_client_id,_month,_amount,_status,nullif(trim(_utr),''),_evidence_url,_evidence_path,nullif(trim(_note),''),auth.uid(),now())
  ON CONFLICT(client_id,billing_month) DO UPDATE SET amount_inr=excluded.amount_inr,status=excluded.status,utr_number=excluded.utr_number,evidence_url=excluded.evidence_url,evidence_path=excluded.evidence_path,note=excluded.note,recorded_by=auth.uid(),updated_at=now()
  RETURNING id INTO i;
  INSERT INTO public.admin_audit_log(actor,action,target_type,target_id,outcome,details)
  VALUES(auth.uid(),'client_payment_saved','client_payments',i::text,'ok',jsonb_build_object('client_id',_client_id,'billing_month',_month,'status',_status));
  RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.save_client_payment(uuid,date,numeric,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_client_payment(uuid,date,numeric,text,text,text,text,text) TO authenticated;

-- Source-backed legacy payment status: owner-confirmed paid through July 2026.
-- Dates come from the attached BD tracker; Excel Hotels & Resorts is excluded
-- because the tracker row has conflicting Active/Churned entries.
WITH source(client_id, onboarded) AS (VALUES
('f2432e31-ee4e-4ed6-ab2e-041db6e8d64a'::uuid,'2025-10-01'::date),
('133ea7ff-9454-4931-8b19-2cb9f286c257'::uuid,'2026-03-07'::date),
('54ef678f-a79a-43bf-a1b0-65dd32ecc2ff'::uuid,'2026-05-07'::date),
('fedf63b0-d68f-4edb-8033-d09840b82058'::uuid,'2026-06-19'::date),
('52e7e368-a680-4e3e-9f98-2ef4d72387c4'::uuid,'2026-06-19'::date),
('23531f2a-fcf3-48a4-8e76-bf7a3c1fdf7b'::uuid,'2026-06-25'::date),
('4ad39b54-a145-48f2-87e0-103af411beed'::uuid,'2026-07-18'::date),
('e12ce4b7-0605-44b6-bf03-3edc8f67b25b'::uuid,'2025-10-01'::date),
('7fbd8ab2-61ad-4db0-9da5-b935abfc3109'::uuid,'2026-01-15'::date),
('28a53638-7cbf-450a-aae7-cd0239bf8802'::uuid,'2026-07-01'::date),
('807a619c-aa83-4ad8-b3ca-cf2b49b164d6'::uuid,'2026-07-01'::date),
('2205f4cf-3858-4fa5-90dd-ab7eeb3cd803'::uuid,'2026-07-20'::date),
('93b34593-e029-4567-9e0a-708c792c8859'::uuid,'2026-08-18'::date),
('8b9db5a9-3080-42ec-a743-ac8e2905d9e6'::uuid,'2026-08-21'::date),
('1d3d41f1-1f75-46bb-b361-de72c614660b'::uuid,'2025-11-01'::date),
('91affdff-26c3-4b75-9c76-7c58a95cb9d7'::uuid,'2026-01-16'::date),
('6575aaf3-3d8c-483d-944e-cd0880d7df39'::uuid,'2026-03-06'::date),
('f94998e6-698e-4692-9160-852f2721f5e9'::uuid,'2026-04-23'::date),
('380bbe0e-b317-4663-9e9c-676c9c5a3e0b'::uuid,'2026-05-04'::date),
('fe47d292-b157-4bae-84d3-96537737d171'::uuid,'2026-07-15'::date),
('cbbd0bf1-6f55-479f-ba5f-8c459bb659a8'::uuid,'2025-08-01'::date)
), months AS (
  SELECT s.client_id, g::date AS billing_month FROM source s
  CROSS JOIN LATERAL generate_series(date_trunc('month',s.onboarded)::date,'2026-07-01'::date,interval '1 month') g
  WHERE s.onboarded <= '2026-07-31'
)
INSERT INTO public.client_payments(client_id,billing_month,status,note)
SELECT client_id,billing_month,'paid','Owner-confirmed paid through July 2026; evidence not supplied'
FROM months ON CONFLICT(client_id,billing_month) DO NOTHING;
