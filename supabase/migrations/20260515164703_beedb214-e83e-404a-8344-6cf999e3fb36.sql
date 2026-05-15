
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches readable by authenticated"
  ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches admin write"
  ON public.branches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "companies readable by authenticated"
  ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies admin write"
  ON public.companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.branches (name) VALUES
  ('Private Krankenversicherung'),
  ('Berufsunfähigkeitsversicherung'),
  ('Zahnzusatzversicherung'),
  ('Rechtsschutzversicherung'),
  ('Tierkrankenversicherung'),
  ('Unfallversicherung'),
  ('KFZ-Versicherung'),
  ('Wohngebäudeversicherung'),
  ('Hausratversicherung'),
  ('Lebensversicherung'),
  ('Rentenversicherung'),
  ('Haftpflichtversicherung'),
  ('Gewerbeversicherung'),
  ('Baufinanzierung'),
  ('Investment & Vermögensaufbau'),
  ('Photovoltaik'),
  ('Pflegeversicherung'),
  ('Sonstige')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.companies (name) VALUES
  ('Allianz'),
  ('Hanse Merkur'),
  ('AXA'),
  ('Barmenia Gothaer'),
  ('Versicherungsmakler'),
  ('Signal Iduna'),
  ('Individuell'),
  ('ARAG'),
  ('ERGO'),
  ('Real Estates Dubai'),
  ('Nexus 2'),
  ('Lackdoktor Ralf Reller'),
  ('Leadsharks'),
  ('Deutsches Marklerforum AG'),
  ('Private PKV Consulting'),
  ('PraeLux Gesellschaft für Investmentberatung mbH'),
  ('EWE'),
  ('Reller Automobile GmbH'),
  ('Von Buddenbrock Concepts GmbH'),
  ('Senne handels Gbr'),
  ('SolarMolar'),
  ('Mocho Versicherungsmakler'),
  ('Tecplus GmbH'),
  ('Thie GmbH'),
  ('Falkenreck & Hallau-Grüner OHG'),
  ('Udo Brass e.K.'),
  ('Wonka.Audio'),
  ('Zaunkreisel GmbH'),
  ('Skyhub PAD')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.close_deals
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

CREATE INDEX IF NOT EXISTS idx_close_deals_branch_id ON public.close_deals(branch_id);
CREATE INDEX IF NOT EXISTS idx_close_deals_company_id ON public.close_deals(company_id);
