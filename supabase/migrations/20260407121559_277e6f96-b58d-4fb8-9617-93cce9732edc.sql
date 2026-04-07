CREATE TABLE public.ad_budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.close_deals(id) ON DELETE SET NULL,
  werbeaccount_name TEXT NOT NULL,
  name TEXT NOT NULL,
  werbebudget NUMERIC(10,2) NOT NULL,
  ausgegeben NUMERIC(10,2) DEFAULT 0,
  remaining NUMERIC(10,2) GENERATED ALWAYS AS (werbebudget - ausgegeben) STORED,
  laufzeit TEXT,
  startdatum DATE,
  campaign_ids JSONB DEFAULT '[]'::jsonb,
  account_id TEXT,
  fixes_budget BOOLEAN DEFAULT false,
  pausiert BOOLEAN DEFAULT false,
  mail_gesendet BOOLEAN DEFAULT false,
  alert BOOLEAN DEFAULT false,
  alert_200_sent_at TIMESTAMPTZ,
  alert_ueberschritten_sent_at TIMESTAMPTZ,
  invoice_ticket_created BOOLEAN DEFAULT false,
  invoice_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ad_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ad_budgets" ON public.ad_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert ad_budgets" ON public.ad_budgets FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update ad_budgets" ON public.ad_budgets FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete ad_budgets" ON public.ad_budgets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));