-- Finance can save a pending monthly payment with an invoice-backed email draft,
-- then explicitly queue that draft for the existing email outbox worker.
CREATE TABLE IF NOT EXISTS public.client_payment_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.client_payments(id) ON DELETE CASCADE,
  billing_month date NOT NULL CHECK (billing_month = date_trunc('month', billing_month)::date),
  to_address text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  invoice_path text NOT NULL,
  invoice_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','sent','failed','cancelled')),
  outbox_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (client_id, billing_month),
  CHECK (invoice_path LIKE client_id::text || '/payment-invoices/%')
);

ALTER TABLE public.client_payment_email_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_payment_email_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_payment_email_drafts TO authenticated;
GRANT ALL ON public.client_payment_email_drafts TO service_role;
CREATE POLICY payment_email_drafts_read ON public.client_payment_email_drafts FOR SELECT TO authenticated
USING (
  public.can_view_client_full(client_id)
  AND (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'bd_manager') OR public.has_role(auth.uid(),'finance'))
);
CREATE TRIGGER client_payment_email_drafts_updated
BEFORE UPDATE ON public.client_payment_email_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.client_message_outbox
  ADD COLUMN IF NOT EXISTS invoice_path text,
  ADD COLUMN IF NOT EXISTS invoice_name text,
  ADD COLUMN IF NOT EXISTS payment_email_draft_id uuid REFERENCES public.client_payment_email_drafts(id);

CREATE FUNCTION public.prepare_pending_payment_email(
  _client_id uuid,
  _month date,
  _amount numeric,
  _utr text,
  _evidence_url text,
  _evidence_path text,
  _note text,
  _to text,
  _subject text,
  _body text,
  _invoice_path text,
  _invoice_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payment_row uuid; draft_id uuid; draft_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'bd_manager') OR public.has_role(auth.uid(),'finance')
  ) THEN RAISE EXCEPTION 'Finance, BD or management access required'; END IF;
  IF NOT public.can_view_client_full(_client_id) THEN RAISE EXCEPTION 'Client is outside your access scope'; END IF;
  IF _month IS NULL OR _month <> date_trunc('month',_month)::date OR coalesce(_amount,0) <= 0 THEN
    RAISE EXCEPTION 'Enter a valid billing month and positive amount';
  END IF;
  IF coalesce(trim(_to),'') !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$' THEN
    RAISE EXCEPTION 'Enter a valid client email address';
  END IF;
  IF coalesce(trim(_subject),'') = '' OR _subject ~ E'[\r\n]' OR coalesce(trim(_body),'') = '' THEN
    RAISE EXCEPTION 'Email subject and message are required';
  END IF;
  IF _invoice_path IS NULL OR _invoice_path NOT LIKE _client_id::text || '/payment-invoices/%'
     OR coalesce(trim(_invoice_name),'') = ''
     OR lower(_invoice_name) NOT LIKE '%.pdf'
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects
       WHERE bucket_id='client-files' AND name=_invoice_path
         AND lower(coalesce(metadata->>'mimetype',''))='application/pdf'
         AND coalesce((metadata->>'size')::bigint,0) <= 10485760
     ) THEN
    RAISE EXCEPTION 'Upload the invoice PDF for this hotel first';
  END IF;

  payment_row := public.save_client_payment(
    _client_id, _month, _amount, 'pending', _utr, _evidence_url, _evidence_path, _note
  );

  SELECT id, status INTO draft_id, draft_status
  FROM public.client_payment_email_drafts
  WHERE client_id=_client_id AND billing_month=_month
  FOR UPDATE;
  IF draft_status IN ('queued','sent') THEN
    RAISE EXCEPTION 'An email for this billing month is already queued or sent';
  END IF;

  INSERT INTO public.client_payment_email_drafts(
    client_id,payment_id,billing_month,to_address,subject,body,invoice_path,invoice_name,status,outbox_id,created_by,sent_at
  ) VALUES (
    _client_id,payment_row,_month,trim(_to),trim(_subject),trim(_body),_invoice_path,trim(_invoice_name),'draft',NULL,auth.uid(),NULL
  )
  ON CONFLICT(client_id,billing_month) DO UPDATE SET
    payment_id=excluded.payment_id,to_address=excluded.to_address,subject=excluded.subject,body=excluded.body,
    invoice_path=excluded.invoice_path,invoice_name=excluded.invoice_name,status='draft',outbox_id=NULL,
    created_by=auth.uid(),sent_at=NULL
  RETURNING id INTO draft_id;

  INSERT INTO public.admin_audit_log(actor,action,target_type,target_id,outcome,details)
  VALUES(auth.uid(),'payment_email_draft_saved','client_payment_email_draft',draft_id::text,'ok',
    jsonb_build_object('client_id',_client_id,'billing_month',_month));
  RETURN draft_id;
END $$;
REVOKE ALL ON FUNCTION public.prepare_pending_payment_email(uuid,date,numeric,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_pending_payment_email(uuid,date,numeric,text,text,text,text,text,text,text,text,text) TO authenticated;

CREATE FUNCTION public.queue_pending_payment_email(_draft_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.client_payment_email_drafts; outbox_row uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'bd_manager') OR public.has_role(auth.uid(),'finance')
  ) THEN RAISE EXCEPTION 'Finance, BD or management access required'; END IF;
  SELECT * INTO d FROM public.client_payment_email_drafts WHERE id=_draft_id FOR UPDATE;
  IF d.id IS NULL OR NOT public.can_view_client_full(d.client_id) THEN RAISE EXCEPTION 'Email draft is unavailable'; END IF;
  IF d.status NOT IN ('draft','failed') THEN RAISE EXCEPTION 'This email is already queued or sent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_payments p WHERE p.id=d.payment_id AND p.status='pending') THEN
    RAISE EXCEPTION 'The payment must still be pending before sending this email';
  END IF;
  INSERT INTO public.client_message_outbox(
    client_id,channel,to_address,kind,subject,body,held,invoice_path,invoice_name,payment_email_draft_id
  ) VALUES (
    d.client_id,'email',d.to_address,'payment_due_email',d.subject,d.body,false,d.invoice_path,d.invoice_name,d.id
  ) RETURNING id INTO outbox_row;
  UPDATE public.client_payment_email_drafts SET status='queued',outbox_id=outbox_row WHERE id=d.id;
  INSERT INTO public.admin_audit_log(actor,action,target_type,target_id,outcome,details)
  VALUES(auth.uid(),'payment_email_queued','client_payment_email_draft',d.id::text,'ok',
    jsonb_build_object('client_id',d.client_id,'billing_month',d.billing_month,'outbox_id',outbox_row));
  RETURN outbox_row;
END $$;
REVOKE ALL ON FUNCTION public.queue_pending_payment_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_pending_payment_email(uuid) TO authenticated;

-- If Finance records the payment as paid before the worker sends the queued
-- reminder, cancel that unsent reminder so the hotel does not receive a false notice.
CREATE FUNCTION public.cancel_paid_payment_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.client_message_outbox o
    SET held=true, failed_at=now(), error='Payment marked paid before reminder was sent'
    FROM public.client_payment_email_drafts d
    WHERE d.payment_id=NEW.id AND d.status='queued' AND o.payment_email_draft_id=d.id
      AND o.sent_at IS NULL AND o.failed_at IS NULL;
    UPDATE public.client_payment_email_drafts
    SET status='cancelled'
    WHERE payment_id=NEW.id AND status='queued';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancel_paid_payment_email
AFTER UPDATE OF status ON public.client_payments
FOR EACH ROW EXECUTE FUNCTION public.cancel_paid_payment_email();

-- Keep the previously requested UTR requirement for recording a payment as paid.
-- Existing payment rows are not rewritten by this function replacement.
CREATE OR REPLACE FUNCTION public.save_client_payment(
  _client_id uuid, _month date, _amount numeric DEFAULT NULL, _status text DEFAULT 'pending',
  _utr text DEFAULT NULL, _evidence_url text DEFAULT NULL, _evidence_path text DEFAULT NULL, _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'bd_manager') OR public.has_role(auth.uid(),'finance')
  ) THEN RAISE EXCEPTION 'Finance, BD or management access required'; END IF;
  IF NOT public.can_view_client_full(_client_id) THEN RAISE EXCEPTION 'Client is outside your access scope'; END IF;
  IF _month IS NULL OR _month <> date_trunc('month',_month)::date OR _status NOT IN ('pending','paid') THEN
    RAISE EXCEPTION 'Choose a valid billing month and status';
  END IF;
  IF _amount IS NOT NULL AND _amount < 0 THEN RAISE EXCEPTION 'Amount cannot be negative'; END IF;
  IF _status='paid' AND coalesce(trim(_utr),'')='' THEN RAISE EXCEPTION 'Enter the UTR/reference before marking a payment paid'; END IF;
  IF _evidence_url IS NOT NULL AND _evidence_url !~ '^https://' THEN RAISE EXCEPTION 'Evidence link must use HTTPS'; END IF;
  IF _evidence_path IS NOT NULL AND _evidence_path NOT LIKE _client_id::text || '/payment-evidence/%' THEN RAISE EXCEPTION 'Invalid evidence file path'; END IF;
  INSERT INTO public.client_payments(client_id,billing_month,amount_inr,status,utr_number,evidence_url,evidence_path,note,recorded_by,updated_at)
  VALUES(_client_id,_month,_amount,_status,nullif(trim(_utr),''),_evidence_url,_evidence_path,nullif(trim(_note),''),auth.uid(),now())
  ON CONFLICT(client_id,billing_month) DO UPDATE SET
    amount_inr=excluded.amount_inr,status=excluded.status,utr_number=excluded.utr_number,
    evidence_url=excluded.evidence_url,evidence_path=excluded.evidence_path,note=excluded.note,
    recorded_by=auth.uid(),updated_at=now()
  RETURNING id INTO i;
  INSERT INTO public.admin_audit_log(actor,action,target_type,target_id,outcome,details)
  VALUES(auth.uid(),'client_payment_saved','client_payments',i::text,'ok',
    jsonb_build_object('client_id',_client_id,'billing_month',_month,'status',_status));
  RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.save_client_payment(uuid,date,numeric,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_client_payment(uuid,date,numeric,text,text,text,text,text) TO authenticated;
