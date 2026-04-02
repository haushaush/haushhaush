
CREATE TABLE IF NOT EXISTS public.qonto_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  qonto_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER,
  amount_currency TEXT DEFAULT 'EUR',
  direction TEXT CHECK (direction IN ('debit','credit')),
  label TEXT,
  reference TEXT,
  emitted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  status TEXT,
  category TEXT,
  counterparty_name TEXT,
  attachment_ids JSONB DEFAULT '[]',
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.qonto_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_qonto" ON public.qonto_transactions
  FOR ALL USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "authenticated_view_qonto" ON public.qonto_transactions
  FOR SELECT TO authenticated USING (true);
