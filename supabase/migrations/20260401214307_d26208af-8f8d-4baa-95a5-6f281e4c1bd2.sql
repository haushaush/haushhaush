
-- Add department column to team table
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS department text DEFAULT 'Sales';

-- Create close_deals table
CREATE TABLE public.close_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_lead_id text,
  client_name text NOT NULL,
  art text DEFAULT 'PKV',
  laufzeit_monate integer,
  wert_eur numeric DEFAULT 0,
  start_datum date,
  leistungen jsonb DEFAULT '[]'::jsonb,
  deal_type text DEFAULT 'Neukunde',
  status text DEFAULT 'Aktiv',
  ampelstatus text DEFAULT 'Grün',
  zahlstatus text DEFAULT 'Offen',
  assigned_to uuid REFERENCES public.team(id),
  close_opportunity_url text,
  onepage_url text,
  meta_ad_account_id text,
  health_score integer DEFAULT 3,
  notes jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.close_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view close_deals" ON public.close_deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert close_deals" ON public.close_deals FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update close_deals" ON public.close_deals FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete close_deals" ON public.close_deals FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Create invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_nr text NOT NULL,
  client_name text,
  close_deal_id uuid REFERENCES public.close_deals(id),
  billing_entity text DEFAULT 'Viral Connect GmbH',
  line_items jsonb DEFAULT '[]'::jsonb,
  netto numeric DEFAULT 0,
  mwst_rate numeric DEFAULT 19,
  mwst_betrag numeric DEFAULT 0,
  brutto numeric DEFAULT 0,
  status text DEFAULT 'Entwurf',
  leistungsdatum date,
  faelligkeitsdatum date,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Create recurring_revenues table
CREATE TABLE public.recurring_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_deal_id uuid REFERENCES public.close_deals(id),
  client_name text NOT NULL,
  monthly_amount numeric DEFAULT 0,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_revenues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view recurring_revenues" ON public.recurring_revenues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert recurring_revenues" ON public.recurring_revenues FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update recurring_revenues" ON public.recurring_revenues FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

-- Create vertriebsakademie_progress table
CREATE TABLE public.vertriebsakademie_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid REFERENCES public.team(id) ON DELETE CASCADE NOT NULL,
  chapter text NOT NULL,
  lesson text,
  status text DEFAULT 'not_started',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vertriebsakademie_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view progress" ON public.vertriebsakademie_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage progress" ON public.vertriebsakademie_progress FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));

-- Create call_coaching table
CREATE TABLE public.call_coaching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid REFERENCES public.team(id) ON DELETE CASCADE NOT NULL,
  coach_name text,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  score integer DEFAULT 3,
  notes text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_coaching ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view coaching" ON public.call_coaching FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage coaching" ON public.call_coaching FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));

-- Create wiki_pages table
CREATE TABLE public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.wiki_pages(id),
  title text NOT NULL,
  content text DEFAULT '',
  section text DEFAULT 'SOPs',
  sort_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view wiki" ON public.wiki_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage wiki" ON public.wiki_pages FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));

-- Create app_settings table
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage settings" ON public.app_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed team members with departments
UPDATE public.team SET department = 'Sales' WHERE rolle IN ('Setter', 'Closer');
UPDATE public.team SET department = 'Management' WHERE rolle = 'Admin';
UPDATE public.team SET department = 'Fulfillment' WHERE rolle = 'Account-Manager';

-- Insert team members if they don't exist
INSERT INTO public.team (name, email, rolle, department) VALUES
  ('Noah Mrosek', 'noah@viralconnect.de', 'Admin', 'Management'),
  ('Maximilian Büsse', 'maximilian@haushhaush.de', 'Admin', 'Management'),
  ('Dennis Öztürk', 'dennis@viralconnect.de', 'Admin', 'Management'),
  ('Justin Jackstell', 'justin@viralconnect.de', 'Account-Manager', 'Customer Success'),
  ('Lilly Matejcek', 'lilly@viralconnect.de', 'Setter', 'Sales'),
  ('Lleyton Puls', 'lleyton@viralconnect.de', 'Setter', 'Sales'),
  ('Marc Hammer', 'marc@viralconnect.de', 'Setter', 'Sales'),
  ('Nico von Engelmann', 'nico@viralconnect.de', 'Setter', 'Sales'),
  ('Marcel Veit', 'marcel@viralconnect.de', 'Closer', 'Sales'),
  ('Khalifa Ben Ameur', 'khalifa@viralconnect.de', 'Account-Manager', 'Fulfillment'),
  ('Mohammed Amouzg', 'mohammed@viralconnect.de', 'Account-Manager', 'Fulfillment'),
  ('Lucian Ciocea', 'lucian@viralconnect.de', 'Account-Manager', 'Fulfillment'),
  ('Samet Karayel', 'samet@viralconnect.de', 'Account-Manager', 'Fulfillment'),
  ('Lara Peter', 'lara@viralconnect.de', 'Account-Manager', 'Fulfillment'),
  ('Antonia Götte', 'antonia@viralconnect.de', 'Setter', 'Intern')
ON CONFLICT DO NOTHING;
