CREATE TABLE public.sales_provision_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  close_user_id text,
  rate numeric NOT NULL DEFAULT 0.15,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sales_provision_reps_name_key ON public.sales_provision_reps (lower(trim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_provision_reps TO authenticated;
GRANT ALL ON public.sales_provision_reps TO service_role;
ALTER TABLE public.sales_provision_reps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provision reps readable" ON public.sales_provision_reps FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'sales.provisions.view'));
CREATE POLICY "provision reps manageable" ON public.sales_provision_reps FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'sales.provisions.manage'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'sales.provisions.manage'));

CREATE TABLE public.sales_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid REFERENCES public.sales_provision_reps(id) ON DELETE SET NULL,
  rep_name text,
  qonto_invoice_id text,
  invoice_number text,
  client_name text,
  amount_net numeric NOT NULL DEFAULT 0,
  created_date date,
  invoice_sent_date date,
  payment_date date,
  status text NOT NULL DEFAULT 'ausstehend',
  rate numeric NOT NULL DEFAULT 0.15,
  commission_amount numeric NOT NULL DEFAULT 0,
  is_payable boolean NOT NULL DEFAULT false,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at date,
  close_lead_id text,
  close_activity_id text,
  source text NOT NULL DEFAULT 'qonto',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sales_provisions_invoice_key ON public.sales_provisions (qonto_invoice_id) WHERE qonto_invoice_id IS NOT NULL;
CREATE INDEX sales_provisions_rep_idx ON public.sales_provisions (rep_id);
CREATE INDEX sales_provisions_status_idx ON public.sales_provisions (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_provisions TO authenticated;
GRANT ALL ON public.sales_provisions TO service_role;
ALTER TABLE public.sales_provisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provisions readable" ON public.sales_provisions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'sales.provisions.view'));
CREATE POLICY "provisions manageable" ON public.sales_provisions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'sales.provisions.manage'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'sales.provisions.manage'));

CREATE TRIGGER sales_provision_reps_updated_at BEFORE UPDATE ON public.sales_provision_reps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER sales_provisions_updated_at BEFORE UPDATE ON public.sales_provisions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();