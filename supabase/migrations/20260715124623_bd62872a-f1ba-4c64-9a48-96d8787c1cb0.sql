
CREATE TABLE public.meta_payment_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'meta_email',
  document_type TEXT NOT NULL DEFAULT 'payment_receipt',
  account_name TEXT,
  meta_account_id TEXT,
  meta_account_id_numeric TEXT,
  transaction_id TEXT,
  transaction_date TIMESTAMPTZ,
  amount NUMERIC(14,2),
  currency TEXT,
  payment_status TEXT,
  payment_status_label TEXT,
  period_start_raw TEXT,
  period_end_raw TEXT,
  billing_reason TEXT,
  product_type TEXT,
  payment_method TEXT,
  transaction_url TEXT,
  campaigns JSONB NOT NULL DEFAULT '[]'::jsonb,
  campaign_count INTEGER,
  gmail_id TEXT,
  gmail_thread_id TEXT,
  email_message_id TEXT,
  email_subject TEXT,
  email_received_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meta_payment_receipts_gmail_id_uniq ON public.meta_payment_receipts(gmail_id) WHERE gmail_id IS NOT NULL;
CREATE UNIQUE INDEX meta_payment_receipts_transaction_id_uniq ON public.meta_payment_receipts(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX meta_payment_receipts_account_idx ON public.meta_payment_receipts(meta_account_id);
CREATE INDEX meta_payment_receipts_transaction_date_idx ON public.meta_payment_receipts(transaction_date DESC);

GRANT SELECT ON public.meta_payment_receipts TO authenticated;
GRANT ALL ON public.meta_payment_receipts TO service_role;

ALTER TABLE public.meta_payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_payment_receipts_read_authorized"
  ON public.meta_payment_receipts FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.user_has_permission(auth.uid(), 'meta.billing.view')
    OR public.user_has_permission(auth.uid(), 'meta.billing.manage')
  );

CREATE TRIGGER update_meta_payment_receipts_updated_at
  BEFORE UPDATE ON public.meta_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
