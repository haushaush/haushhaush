
ALTER TABLE public.branchen
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

UPDATE public.branchen SET canonical_name = display_name WHERE canonical_name IS NULL;
ALTER TABLE public.branchen ALTER COLUMN canonical_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_branchen_canonical_unique
  ON public.branchen (lower(canonical_name)) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.branchen TO authenticated;
GRANT ALL ON public.branchen TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branchen' AND policyname='Authenticated update branchen') THEN
    CREATE POLICY "Authenticated update branchen" ON public.branchen
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed canonicals from BRANCHE_ALIASES
INSERT INTO public.branchen (name, display_name, canonical_name, short_name) VALUES
  ('Private Krankenversicherung','Private Krankenversicherung','Private Krankenversicherung','PKV'),
  ('Berufsunfähigkeitsversicherung','Berufsunfähigkeitsversicherung','Berufsunfähigkeitsversicherung','BU'),
  ('Tierkrankenversicherung','Tierkrankenversicherung','Tierkrankenversicherung','TKV'),
  ('Rechtsschutzversicherung','Rechtsschutzversicherung','Rechtsschutzversicherung','RS'),
  ('Unfallversicherung','Unfallversicherung','Unfallversicherung','UV'),
  ('Kinderversicherung','Kinderversicherung','Kinderversicherung','KV'),
  ('Haftpflichtversicherung','Haftpflichtversicherung','Haftpflichtversicherung','HP'),
  ('Sterbegeldversicherung','Sterbegeldversicherung','Sterbegeldversicherung','SG'),
  ('Photovoltaik','Photovoltaik','Photovoltaik','PV'),
  ('Aviation','Aviation','Aviation',NULL),
  ('KFZ-Versicherung','KFZ-Versicherung','KFZ-Versicherung','KFZ'),
  ('Wohngebäudeversicherung','Wohngebäudeversicherung','Wohngebäudeversicherung','WG'),
  ('Zahnzusatzversicherung','Zahnzusatzversicherung','Zahnzusatzversicherung','ZZ')
ON CONFLICT DO NOTHING;

INSERT INTO public.branchen (name, display_name, canonical_name)
SELECT DISTINCT trim(branche), trim(branche), trim(branche) FROM public.clients
WHERE branche IS NOT NULL AND trim(branche) <> ''
  AND lower(trim(branche)) NOT IN (SELECT lower(canonical_name) FROM public.branchen WHERE deleted_at IS NULL)
ON CONFLICT DO NOTHING;
