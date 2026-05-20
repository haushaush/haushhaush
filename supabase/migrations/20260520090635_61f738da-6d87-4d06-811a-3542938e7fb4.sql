
-- Mapping clients <-> Close Lead
CREATE TABLE IF NOT EXISTS public.close_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  close_lead_id text NOT NULL,
  matched_via text NOT NULL CHECK (matched_via IN ('email','manual','name_fallback')),
  match_confidence numeric(3,2),
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id),
  UNIQUE(close_lead_id)
);
CREATE INDEX IF NOT EXISTS idx_close_link_client ON public.close_link(client_id);
CREATE INDEX IF NOT EXISTS idx_close_link_lead ON public.close_link(close_lead_id);

-- Extend existing close_opportunities
ALTER TABLE public.close_opportunities
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS value_cents bigint,
  ADD COLUMN IF NOT EXISTS user_name text;
CREATE INDEX IF NOT EXISTS idx_close_opp_client ON public.close_opportunities(client_id);
CREATE INDEX IF NOT EXISTS idx_close_opp_status ON public.close_opportunities(status_type);
CREATE INDEX IF NOT EXISTS idx_close_opp_lead ON public.close_opportunities(lead_id);

-- Activities from Close
CREATE TABLE IF NOT EXISTS public.close_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_activity_id text UNIQUE NOT NULL,
  close_lead_id text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  activity_type text,
  direction text,
  subject text,
  body_preview text,
  duration_seconds integer,
  user_name text,
  date_created timestamptz,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_close_act_lead ON public.close_activities(close_lead_id);
CREATE INDEX IF NOT EXISTS idx_close_act_client ON public.close_activities(client_id);
CREATE INDEX IF NOT EXISTS idx_close_act_date ON public.close_activities(date_created DESC);
CREATE INDEX IF NOT EXISTS idx_close_act_type ON public.close_activities(activity_type);

-- RLS
ALTER TABLE public.close_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.close_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read close_link" ON public.close_link;
CREATE POLICY "Authenticated read close_link" ON public.close_link
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin write close_link" ON public.close_link;
CREATE POLICY "Admin write close_link" ON public.close_link
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read close_activities" ON public.close_activities;
CREATE POLICY "Authenticated read close_activities" ON public.close_activities
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin write close_activities" ON public.close_activities;
CREATE POLICY "Admin write close_activities" ON public.close_activities
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
