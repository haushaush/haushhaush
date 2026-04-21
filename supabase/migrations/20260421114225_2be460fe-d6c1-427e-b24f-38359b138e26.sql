CREATE TABLE IF NOT EXISTS public.close_leads (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  status_label TEXT,
  status_id TEXT,
  description TEXT,
  url TEXT,
  contacts JSONB DEFAULT '[]'::jsonb,
  custom JSONB DEFAULT '{}'::jsonb,
  addresses JSONB DEFAULT '[]'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.close_opportunities (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  lead_name TEXT,
  status_label TEXT,
  status_type TEXT,
  pipeline_id TEXT,
  pipeline_name TEXT,
  value NUMERIC,
  value_formatted TEXT,
  value_currency TEXT,
  value_period TEXT,
  note TEXT,
  confidence INTEGER,
  date_won TIMESTAMPTZ,
  date_lost TIMESTAMPTZ,
  raw JSONB DEFAULT '{}'::jsonb,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_close_leads_updated ON public.close_leads (date_updated DESC);
CREATE INDEX IF NOT EXISTS idx_close_opps_updated ON public.close_opportunities (date_updated DESC);
CREATE INDEX IF NOT EXISTS idx_close_opps_lead ON public.close_opportunities (lead_id);
CREATE INDEX IF NOT EXISTS idx_close_opps_status ON public.close_opportunities (status_type);

ALTER TABLE public.close_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.close_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view close_leads" ON public.close_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/managers can insert close_leads" ON public.close_leads
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins/managers can update close_leads" ON public.close_leads
  FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete close_leads" ON public.close_leads
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view close_opps" ON public.close_opportunities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/managers can insert close_opps" ON public.close_opportunities
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins/managers can update close_opps" ON public.close_opportunities
  FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete close_opps" ON public.close_opportunities
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));