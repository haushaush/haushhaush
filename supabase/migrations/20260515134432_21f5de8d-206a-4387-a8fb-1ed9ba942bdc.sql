ALTER TABLE public.branchen
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

UPDATE public.branchen SET display_name = name WHERE display_name IS NULL;
ALTER TABLE public.branchen ALTER COLUMN display_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_branchen_usage ON public.branchen(usage_count DESC);

ALTER TABLE public.unternehmen
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branche_id uuid REFERENCES public.branchen(id) ON DELETE SET NULL;

UPDATE public.unternehmen SET display_name = name WHERE display_name IS NULL;
ALTER TABLE public.unternehmen ALTER COLUMN display_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unternehmen_usage ON public.unternehmen(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_unternehmen_branche ON public.unternehmen(branche_id);

-- Seed Branchen aus close_deals (branche ist text[])
INSERT INTO public.branchen (name, display_name)
SELECT DISTINCT lower(trim(b)), trim(b)
FROM public.close_deals, unnest(branche) AS b
WHERE b IS NOT NULL AND trim(b) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.branchen (name, display_name) VALUES
  ('pkv', 'PKV'),('bu', 'BU'),('kfz', 'KFZ'),('rechtsschutz', 'Rechtsschutz'),
  ('tierkrankenversicherung', 'Tierkrankenversicherung'),
  ('wohngebaeudeversicherung', 'Wohngebäudeversicherung'),
  ('hausratversicherung', 'Hausratversicherung'),
  ('lebensversicherung', 'Lebensversicherung'),
  ('riesterrente', 'Riester-Rente'),
  ('immobilienfinanzierung', 'Immobilienfinanzierung'),
  ('investment', 'Investment'),('photovoltaik', 'Photovoltaik'),
  ('handwerk', 'Handwerk'),('aesthetische-medizin', 'Ästhetische Medizin'),
  ('coaching', 'Coaching')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.unternehmen (name, display_name)
SELECT DISTINCT lower(trim(unternehmen)), trim(unternehmen)
FROM public.close_deals
WHERE unternehmen IS NOT NULL AND trim(unternehmen) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.unternehmen (name, display_name) VALUES
  ('allianz', 'Allianz'),('signal-iduna', 'Signal Iduna'),('axa', 'AXA'),
  ('debeka', 'Debeka'),('barmenia-gothaer', 'Barmenia Gothaer'),
  ('hansemerkur', 'HanseMerkur'),('dkv', 'DKV'),('arag', 'ARAG'),
  ('huk-coburg', 'HUK Coburg'),('ergo', 'ERGO'),('zurich', 'Zurich'),
  ('generali', 'Generali'),('continentale', 'Continentale'),
  ('alte-leipziger', 'Alte Leipziger'),('wuerttembergische', 'Württembergische'),
  ('inter', 'INTER'),('barmer', 'Barmer'),('tk', 'TK')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_branche_usage(branche_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_canonical text := lower(trim(branche_name)); v_display text := trim(branche_name);
BEGIN
  IF v_canonical = '' THEN RETURN NULL; END IF;
  INSERT INTO public.branchen (name, display_name, usage_count)
  VALUES (v_canonical, v_display, 1)
  ON CONFLICT (name) DO UPDATE SET usage_count = public.branchen.usage_count + 1
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_unternehmen_usage(unt_name text, branche_id_in uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_canonical text := lower(trim(unt_name)); v_display text := trim(unt_name);
BEGIN
  IF v_canonical = '' THEN RETURN NULL; END IF;
  INSERT INTO public.unternehmen (name, display_name, branche_id, usage_count)
  VALUES (v_canonical, v_display, branche_id_in, 1)
  ON CONFLICT (name) DO UPDATE
    SET usage_count = public.unternehmen.usage_count + 1,
        branche_id = COALESCE(public.unternehmen.branche_id, EXCLUDED.branche_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_branche_usage(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_unternehmen_usage(text, uuid) TO authenticated;