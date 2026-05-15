CREATE TABLE IF NOT EXISTS public.website_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_highlights_usage ON public.website_highlights(usage_count DESC);

ALTER TABLE public.website_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read highlights" ON public.website_highlights
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth insert highlights" ON public.website_highlights
  FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO public.website_highlights (label, usage_count)
SELECT trim(feature) AS label, COUNT(*) AS usage_count
FROM public.referenz_showcase,
LATERAL unnest(key_features) AS feature
WHERE key_features IS NOT NULL
  AND feature IS NOT NULL
  AND trim(feature) != ''
GROUP BY trim(feature)
ON CONFLICT (label) DO UPDATE SET usage_count = EXCLUDED.usage_count;

CREATE OR REPLACE FUNCTION public.increment_highlight_usage(p_label TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID; v_trimmed TEXT := trim(p_label);
BEGIN
  IF v_trimmed = '' THEN RETURN NULL; END IF;
  INSERT INTO public.website_highlights (label, usage_count)
  VALUES (v_trimmed, 1)
  ON CONFLICT (label) DO UPDATE SET usage_count = public.website_highlights.usage_count + 1
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;