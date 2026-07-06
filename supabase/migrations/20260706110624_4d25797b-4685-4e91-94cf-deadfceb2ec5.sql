
-- qonto_sync_status
CREATE TABLE public.qonto_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text UNIQUE NOT NULL,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qonto_sync_status TO authenticated;
GRANT ALL ON public.qonto_sync_status TO service_role;
ALTER TABLE public.qonto_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sync status" ON public.qonto_sync_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- qonto_bank_accounts
CREATE TABLE public.qonto_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qonto_account_id text,
  slug text,
  iban text UNIQUE,
  bic text,
  name text,
  currency text,
  balance numeric,
  balance_cents bigint,
  authorized_balance numeric,
  authorized_balance_cents bigint,
  status text,
  is_main boolean DEFAULT false,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qonto_bank_accounts TO authenticated;
GRANT ALL ON public.qonto_bank_accounts TO service_role;
ALTER TABLE public.qonto_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance viewers read accounts" ON public.qonto_bank_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.view'));

-- qonto_transactions
CREATE TABLE public.qonto_transactions_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text UNIQUE NOT NULL,
  bank_account_iban text,
  bank_account_id text,
  amount numeric,
  amount_cents bigint,
  side text,
  operation_type text,
  currency text,
  label text,
  reference text,
  status text,
  settled_at timestamptz,
  emitted_at timestamptz,
  created_at_qonto timestamptz,
  updated_at_qonto timestamptz,
  category text,
  cashflow_category_name text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qonto_transactions_new TO authenticated;
GRANT ALL ON public.qonto_transactions_new TO service_role;
ALTER TABLE public.qonto_transactions_new ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance viewers read tx" ON public.qonto_transactions_new FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.view'));

-- qonto_client_invoices
CREATE TABLE public.qonto_client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qonto_invoice_id text UNIQUE NOT NULL,
  number text,
  status text,
  invoice_url text,
  contact_email text,
  client_name text,
  client_id text,
  currency text,
  total_amount numeric,
  total_amount_cents bigint,
  subtotal_amount numeric,
  subtotal_amount_cents bigint,
  vat_amount numeric,
  vat_amount_cents bigint,
  issue_date date,
  due_date date,
  paid_at date,
  created_at_qonto timestamptz,
  updated_at_qonto timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qonto_client_invoices TO authenticated;
GRANT ALL ON public.qonto_client_invoices TO service_role;
ALTER TABLE public.qonto_client_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance viewers read invoices" ON public.qonto_client_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.view'));

-- update triggers
CREATE TRIGGER qonto_sync_status_updated_at BEFORE UPDATE ON public.qonto_sync_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER qonto_bank_accounts_updated_at BEFORE UPDATE ON public.qonto_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER qonto_transactions_new_updated_at BEFORE UPDATE ON public.qonto_transactions_new FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER qonto_client_invoices_updated_at BEFORE UPDATE ON public.qonto_client_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add finanzen.view permission if not exists
INSERT INTO public.app_permissions (permission_key, label, category, description)
VALUES ('finanzen.view','Finanzen einsehen','Finanzen','Zugriff auf den Bereich Finanzen inkl. Qonto-Daten')
ON CONFLICT (permission_key) DO NOTHING;
