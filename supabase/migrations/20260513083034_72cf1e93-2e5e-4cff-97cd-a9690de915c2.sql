-- Branchen lookup table
CREATE TABLE IF NOT EXISTS public.branchen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.branchen (name, display_order) VALUES
  ('PKV', 10),
  ('BU', 20),
  ('KFZ', 30),
  ('Rechtsschutz', 40),
  ('Beihilfe', 50),
  ('Unfall', 60),
  ('Sonstige', 99)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.branchen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read branchen" ON public.branchen
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users insert branchen" ON public.branchen
  FOR INSERT TO authenticated WITH CHECK (true);

-- Unternehmen lookup table
CREATE TABLE IF NOT EXISTS public.unternehmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.unternehmen (name)
SELECT DISTINCT TRIM(unternehmen)
FROM public.close_deals
WHERE unternehmen IS NOT NULL AND TRIM(unternehmen) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.unternehmen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read unternehmen" ON public.unternehmen
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users insert unternehmen" ON public.unternehmen
  FOR INSERT TO authenticated WITH CHECK (true);

-- Add unternehmen column to referenz_showcase
ALTER TABLE public.referenz_showcase
  ADD COLUMN IF NOT EXISTS unternehmen TEXT;
