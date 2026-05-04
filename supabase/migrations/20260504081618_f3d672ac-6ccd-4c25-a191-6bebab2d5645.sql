CREATE TABLE IF NOT EXISTS public.kunde_close_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES public.close_deals(id) ON DELETE CASCADE,
  close_opportunity_id text NOT NULL,
  close_lead_id text NOT NULL,
  close_lead_name text,
  opportunity_value numeric,
  opportunity_currency text DEFAULT 'EUR',
  date_won timestamptz,
  match_type text NOT NULL CHECK (match_type IN ('auto_email', 'auto_name', 'auto_company', 'manual', 'rejected')),
  match_confidence numeric,
  match_reason text,
  matched_at timestamptz DEFAULT now(),
  UNIQUE(kunde_id, close_opportunity_id)
);

CREATE INDEX idx_kunde_close_deals_kunde ON public.kunde_close_deals(kunde_id);
CREATE INDEX idx_kunde_close_deals_lead ON public.kunde_close_deals(close_lead_id);

ALTER TABLE public.kunde_close_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read kunde_close_deals" ON public.kunde_close_deals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage kunde_close_deals" ON public.kunde_close_deals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));