
CREATE TABLE IF NOT EXISTS public.meta_billing_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_invoice_id TEXT NOT NULL,
  meta_business_id TEXT,
  meta_account_id TEXT,
  account_name TEXT,
  billing_period TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC,
  currency TEXT,
  status TEXT,
  status_mapped TEXT,
  payment_method TEXT,
  payment_reference TEXT,
  document_url TEXT,
  entity TEXT,
  account_breakdown JSONB,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meta_billing_invoices_meta_invoice_id_key UNIQUE (meta_invoice_id)
);

GRANT SELECT ON public.meta_billing_invoices TO authenticated;
GRANT ALL ON public.meta_billing_invoices TO service_role;

ALTER TABLE public.meta_billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_billing_invoices_read" ON public.meta_billing_invoices
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'meta.billing.view'));

CREATE TRIGGER update_meta_billing_invoices_updated_at
BEFORE UPDATE ON public.meta_billing_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_meta_billing_invoices_account ON public.meta_billing_invoices(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_billing_invoices_status ON public.meta_billing_invoices(status_mapped);
CREATE INDEX IF NOT EXISTS idx_meta_billing_invoices_date ON public.meta_billing_invoices(invoice_date);
