
-- ============================================================
-- Phase A (retry): Foundation + Backfill (deduplicate-safe)
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS branche_id TEXT,
  ADD COLUMN IF NOT EXISTS unternehmen_id UUID,
  ADD COLUMN IF NOT EXISTS meta_account_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_account_ids TEXT[],
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_name_lower ON public.clients(lower(name));
CREATE INDEX IF NOT EXISTS idx_clients_branche ON public.clients(branche_id);
CREATE INDEX IF NOT EXISTS idx_clients_meta_account ON public.clients(meta_account_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_clients_unternehmen') THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT fk_clients_unternehmen FOREIGN KEY (unternehmen_id)
      REFERENCES public.unternehmen(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.referenz_showcase
  ADD COLUMN IF NOT EXISTS linked_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_branche_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_unternehmen_id UUID REFERENCES public.unternehmen(id) ON DELETE SET NULL;

ALTER TABLE public.referenz_meta_ads
  ADD COLUMN IF NOT EXISTS linked_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_branche_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_unternehmen_id UUID REFERENCES public.unternehmen(id) ON DELETE SET NULL;

ALTER TABLE public.referenz_meta_campaigns
  ADD COLUMN IF NOT EXISTS linked_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_branche_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_unternehmen_id UUID REFERENCES public.unternehmen(id) ON DELETE SET NULL;

ALTER TABLE public.close_deals
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branche_id TEXT,
  ADD COLUMN IF NOT EXISTS unternehmen_id UUID REFERENCES public.unternehmen(id) ON DELETE SET NULL;

ALTER TABLE public.onepage_projects
  ADD COLUMN IF NOT EXISTS client_id_fk UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branche_id TEXT,
  ADD COLUMN IF NOT EXISTS unternehmen_id UUID REFERENCES public.unternehmen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_showcase_client ON public.referenz_showcase(linked_client_id);
CREATE INDEX IF NOT EXISTS idx_showcase_branche ON public.referenz_showcase(linked_branche_id);
CREATE INDEX IF NOT EXISTS idx_showcase_unternehmen ON public.referenz_showcase(linked_unternehmen_id);
CREATE INDEX IF NOT EXISTS idx_ads_client ON public.referenz_meta_ads(linked_client_id);
CREATE INDEX IF NOT EXISTS idx_ads_branche ON public.referenz_meta_ads(linked_branche_id);
CREATE INDEX IF NOT EXISTS idx_ads_unternehmen ON public.referenz_meta_ads(linked_unternehmen_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON public.referenz_meta_campaigns(linked_client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_branche ON public.referenz_meta_campaigns(linked_branche_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_unternehmen ON public.referenz_meta_campaigns(linked_unternehmen_id);
CREATE INDEX IF NOT EXISTS idx_close_deals_client ON public.close_deals(client_id);
CREATE INDEX IF NOT EXISTS idx_onepage_client_fk ON public.onepage_projects(client_id_fk);

-- 2.1 Unternehmen normalisiert (dedupe-safe: pro normalized name nur 1 Row)
WITH all_unternehmen AS (
  SELECT unternehmen AS raw_name FROM public.referenz_showcase
    WHERE unternehmen IS NOT NULL AND trim(unternehmen) != ''
  UNION ALL
  SELECT unternehmen FROM public.close_deals
    WHERE unternehmen IS NOT NULL AND trim(unternehmen) != ''
  UNION ALL
  SELECT filter_values->>'unternehmen' FROM public.referenz_meta_ads
    WHERE filter_values ? 'unternehmen' AND trim(filter_values->>'unternehmen') != ''
  UNION ALL
  SELECT filter_values->>'unternehmen' FROM public.referenz_meta_campaigns
    WHERE filter_values ? 'unternehmen' AND trim(filter_values->>'unternehmen') != ''
), normalized AS (
  SELECT
    lower(trim(regexp_replace(raw_name, '\s+(AG|GmbH|SE|KG|OHG|mbH)\.?$', '', 'i'))) AS name,
    trim(raw_name) AS display_name
  FROM all_unternehmen
  WHERE trim(raw_name) != ''
), aggregated AS (
  SELECT
    name,
    (array_agg(display_name ORDER BY length(display_name) DESC))[1] AS display_name,
    COUNT(*)::int AS cnt
  FROM normalized
  GROUP BY name
)
INSERT INTO public.unternehmen (name, display_name, usage_count)
SELECT name, display_name, cnt FROM aggregated
ON CONFLICT (name) DO UPDATE
  SET usage_count = public.unternehmen.usage_count + EXCLUDED.usage_count;

-- 2.2 Endkunden aus close_deals (dedupe per lower(trim(name)))
WITH candidates AS (
  SELECT
    trim(cd.client_name) AS name_trim,
    (array_agg(
      CASE
        WHEN lower(cd.art) IN ('pkv','private krankenversicherung') THEN 'pkv'
        WHEN lower(cd.art) IN ('bu','berufsunfähigkeitsversicherung') THEN 'bu'
        WHEN lower(cd.art) IN ('rs','rechtsschutz') THEN 'rs'
        WHEN lower(cd.art) IN ('zz','zahnzusatz') THEN 'zz'
        WHEN lower(cd.art) IN ('tkv','tier') THEN 'tkv'
        WHEN lower(cd.art) IN ('uv','unfall') THEN 'uv'
        ELSE NULL
      END
      ORDER BY cd.created_at
    ) FILTER (WHERE cd.art IS NOT NULL))[1] AS branche_id,
    MIN(cd.created_at) AS first_seen
  FROM public.close_deals cd
  WHERE cd.client_name IS NOT NULL AND trim(cd.client_name) != ''
  GROUP BY lower(trim(cd.client_name)), trim(cd.client_name)
), filtered AS (
  SELECT DISTINCT ON (lower(name_trim))
    name_trim, branche_id, first_seen
  FROM candidates
  ORDER BY lower(name_trim), first_seen
)
INSERT INTO public.clients (name, branche_id, kundenstatus, created_at)
SELECT f.name_trim, f.branche_id, 'Lead'::kundenstatus, f.first_seen
FROM filtered f
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients c WHERE lower(trim(c.name)) = lower(f.name_trim)
);

-- 2.3 close_deals.client_id
UPDATE public.close_deals cd
SET client_id = c.id
FROM public.clients c
WHERE lower(trim(c.name)) = lower(trim(cd.client_name))
  AND cd.client_id IS NULL
  AND cd.client_name IS NOT NULL;

-- 2.5 referenz_showcase.linked_unternehmen_id
UPDATE public.referenz_showcase s
SET linked_unternehmen_id = u.id
FROM public.unternehmen u
WHERE u.name = lower(trim(regexp_replace(s.unternehmen, '\s+(AG|GmbH|SE|KG|OHG|mbH)\.?$', '', 'i')))
  AND s.linked_unternehmen_id IS NULL
  AND s.unternehmen IS NOT NULL;

-- 2.6 referenz_meta_ads/campaigns.linked_unternehmen_id
UPDATE public.referenz_meta_ads a
SET linked_unternehmen_id = u.id
FROM public.unternehmen u
WHERE u.name = lower(trim(regexp_replace(a.filter_values->>'unternehmen', '\s+(AG|GmbH|SE|KG|OHG|mbH)\.?$', '', 'i')))
  AND a.linked_unternehmen_id IS NULL
  AND a.filter_values ? 'unternehmen'
  AND trim(a.filter_values->>'unternehmen') != '';

UPDATE public.referenz_meta_campaigns c
SET linked_unternehmen_id = u.id
FROM public.unternehmen u
WHERE u.name = lower(trim(regexp_replace(c.filter_values->>'unternehmen', '\s+(AG|GmbH|SE|KG|OHG|mbH)\.?$', '', 'i')))
  AND c.linked_unternehmen_id IS NULL
  AND c.filter_values ? 'unternehmen'
  AND trim(c.filter_values->>'unternehmen') != '';

UPDATE public.close_deals cd
SET unternehmen_id = u.id
FROM public.unternehmen u
WHERE u.name = lower(trim(regexp_replace(cd.unternehmen, '\s+(AG|GmbH|SE|KG|OHG|mbH)\.?$', '', 'i')))
  AND cd.unternehmen_id IS NULL
  AND cd.unternehmen IS NOT NULL;

-- 2.7 Branchen referenz_meta_ads (filter_values->>'branche')
UPDATE public.referenz_meta_ads SET linked_branche_id = pattern.canonical_id
FROM (VALUES
  ('pkv', ARRAY['pkv','private krankenversicherung','private kranken','krankenversicherung','private kv','beihilfe','beihilfe - pkv','beihilfe-pkv','beihilfe pkv','krankenvoll']),
  ('bu', ARRAY['bu','berufsunfähigkeit','berufsunfähigkeitsversicherung','berufsunfaehigkeit','berufsunfaehigkeitsversicherung']),
  ('zz', ARRAY['zz','zahnzusatz','zahnzusatzversicherung','zahn','zahnversicherung']),
  ('rs', ARRAY['rs','rechtsschutz','rechtsschutzversicherung']),
  ('tkv', ARRAY['tkv','tier','tierkranken','tierkrankenversicherung','tierversicherung','hundeversicherung','katzenversicherung']),
  ('uv', ARRAY['uv','unfall','unfallversicherung']),
  ('kfz', ARRAY['kfz','kfz-versicherung','kfzversicherung','auto','autoversicherung']),
  ('lebensversicherung', ARRAY['leben','lebensversicherung','lv','risikolebensversicherung','rlv']),
  ('rente', ARRAY['rente','rentenversicherung','riester','riesterrente','rürup','basisrente']),
  ('haftpflicht', ARRAY['haftpflicht','haftpflichtversicherung','phv','private haftpflicht']),
  ('wohngebaeude', ARRAY['wohngebäude','wohngebaeude','wohngebäudeversicherung','gebäudeversicherung']),
  ('hausrat', ARRAY['hausrat','hausratversicherung']),
  ('photovoltaik', ARRAY['photovoltaik','pv','solar','solaranlage']),
  ('pflege', ARRAY['pflege','pflegeversicherung','pflegetagegeld'])
) AS pattern(canonical_id, aliases)
WHERE public.referenz_meta_ads.linked_branche_id IS NULL
  AND public.referenz_meta_ads.filter_values ? 'branche'
  AND lower(trim(public.referenz_meta_ads.filter_values->>'branche')) = ANY(pattern.aliases);

UPDATE public.referenz_meta_campaigns SET linked_branche_id = pattern.canonical_id
FROM (VALUES
  ('pkv', ARRAY['pkv','private krankenversicherung','beihilfe','beihilfe - pkv','beihilfe-pkv','krankenvoll']),
  ('bu', ARRAY['bu','berufsunfähigkeitsversicherung','berufsunfähigkeit']),
  ('zz', ARRAY['zz','zahnzusatz','zahnzusatzversicherung']),
  ('rs', ARRAY['rs','rechtsschutz','rechtsschutzversicherung']),
  ('tkv', ARRAY['tkv','tier','tierkrankenversicherung']),
  ('uv', ARRAY['uv','unfall','unfallversicherung']),
  ('kfz', ARRAY['kfz','kfz-versicherung','auto','autoversicherung']),
  ('lebensversicherung', ARRAY['leben','lebensversicherung','lv']),
  ('rente', ARRAY['rente','rentenversicherung','riester']),
  ('haftpflicht', ARRAY['haftpflicht','haftpflichtversicherung','phv']),
  ('wohngebaeude', ARRAY['wohngebäude','gebäudeversicherung']),
  ('hausrat', ARRAY['hausrat','hausratversicherung'])
) AS pattern(canonical_id, aliases)
WHERE public.referenz_meta_campaigns.linked_branche_id IS NULL
  AND public.referenz_meta_campaigns.filter_values ? 'branche'
  AND lower(trim(public.referenz_meta_campaigns.filter_values->>'branche')) = ANY(pattern.aliases);

UPDATE public.referenz_showcase SET linked_branche_id = pattern.canonical_id
FROM (VALUES
  ('pkv', ARRAY['pkv','private krankenversicherung','beihilfe','beihilfe - pkv','beihilfe-pkv','krankenvoll']),
  ('bu', ARRAY['bu','berufsunfähigkeitsversicherung','berufsunfähigkeit']),
  ('zz', ARRAY['zz','zahnzusatz','zahnzusatzversicherung']),
  ('rs', ARRAY['rs','rechtsschutz','rechtsschutzversicherung']),
  ('tkv', ARRAY['tkv','tier','tierkrankenversicherung']),
  ('uv', ARRAY['uv','unfall','unfallversicherung']),
  ('kfz', ARRAY['kfz','kfz-versicherung','auto','autoversicherung']),
  ('lebensversicherung', ARRAY['leben','lebensversicherung','lv']),
  ('rente', ARRAY['rente','rentenversicherung','riester']),
  ('haftpflicht', ARRAY['haftpflicht','haftpflichtversicherung','phv']),
  ('wohngebaeude', ARRAY['wohngebäude','gebäudeversicherung']),
  ('hausrat', ARRAY['hausrat','hausratversicherung'])
) AS pattern(canonical_id, aliases)
WHERE public.referenz_showcase.linked_branche_id IS NULL
  AND lower(trim(public.referenz_showcase.branche)) = ANY(pattern.aliases);

UPDATE public.clients SET branche_id = pattern.canonical_id
FROM (VALUES
  ('pkv', ARRAY['pkv','private krankenversicherung','beihilfe','beihilfe - pkv']),
  ('bu', ARRAY['bu','berufsunfähigkeitsversicherung','berufsunfähigkeit']),
  ('zz', ARRAY['zz','zahnzusatz','zahnzusatzversicherung']),
  ('rs', ARRAY['rs','rechtsschutz','rechtsschutzversicherung']),
  ('tkv', ARRAY['tkv','tier','tierkrankenversicherung']),
  ('uv', ARRAY['uv','unfall','unfallversicherung']),
  ('kfz', ARRAY['kfz','kfz-versicherung','auto','autoversicherung']),
  ('lebensversicherung', ARRAY['leben','lebensversicherung']),
  ('rente', ARRAY['rente','rentenversicherung']),
  ('haftpflicht', ARRAY['haftpflicht','haftpflichtversicherung'])
) AS pattern(canonical_id, aliases)
WHERE public.clients.branche_id IS NULL
  AND lower(trim(public.clients.branche)) = ANY(pattern.aliases);

UPDATE public.close_deals SET branche_id = pattern.canonical_id
FROM (VALUES
  ('pkv', ARRAY['pkv','private krankenversicherung']),
  ('bu', ARRAY['bu','berufsunfähigkeitsversicherung']),
  ('zz', ARRAY['zz','zahnzusatz','zahnzusatzversicherung']),
  ('rs', ARRAY['rs','rechtsschutz']),
  ('tkv', ARRAY['tkv','tier']),
  ('uv', ARRAY['uv','unfall']),
  ('kfz', ARRAY['kfz','auto'])
) AS pattern(canonical_id, aliases)
WHERE public.close_deals.branche_id IS NULL
  AND lower(trim(public.close_deals.art)) = ANY(pattern.aliases);

-- 2.8 Auto-Match ads.linked_client_id via meta_account_id
UPDATE public.referenz_meta_ads a
SET linked_client_id = c.id
FROM public.clients c
WHERE a.linked_client_id IS NULL
  AND a.meta_account_id IS NOT NULL
  AND (
    c.meta_account_id = a.meta_account_id
    OR a.meta_account_id = ANY(c.meta_account_ids)
  );

-- 2.9 onepage_projects.client_id_fk
UPDATE public.onepage_projects o
SET client_id_fk = o.client_id
FROM public.clients c
WHERE o.client_id_fk IS NULL
  AND o.client_id IS NOT NULL
  AND c.id = o.client_id;

-- 3. RPCs
CREATE OR REPLACE FUNCTION public.create_or_get_unternehmen(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_display TEXT;
  v_id UUID;
BEGIN
  v_display := trim(p_name);
  IF v_display = '' THEN RETURN NULL; END IF;
  v_normalized := lower(trim(regexp_replace(v_display, '\s+(AG|GmbH|SE|KG|OHG|mbH)\.?$', '', 'i')));

  INSERT INTO public.unternehmen (name, display_name, usage_count)
  VALUES (v_normalized, v_display, 1)
  ON CONFLICT (name) DO UPDATE
    SET usage_count = public.unternehmen.usage_count + 1
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_client_by_meta_account(p_account_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.clients
  WHERE meta_account_id = p_account_id
     OR p_account_id = ANY(meta_account_ids)
  LIMIT 1;
  RETURN v_id;
END;
$$;
