-- Add is_public flag to showcase tables
ALTER TABLE public.referenz_showcase ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE public.referenz_meta_ads ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE public.referenz_meta_campaigns ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

UPDATE public.referenz_showcase SET is_public = true WHERE is_public IS NULL;
UPDATE public.referenz_meta_ads SET is_public = true WHERE is_public IS NULL;
UPDATE public.referenz_meta_campaigns SET is_public = true WHERE is_public IS NULL;

-- Drop old public policy that only checked is_active and recreate to require is_public
DROP POLICY IF EXISTS "public read active showcase" ON public.referenz_showcase;
CREATE POLICY "public read public showcase entries"
  ON public.referenz_showcase FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_public = true);

-- Anonymous read for meta ads
CREATE POLICY "anon read public meta ads"
  ON public.referenz_meta_ads FOR SELECT
  TO anon
  USING (is_public = true);

-- Anonymous read for meta campaigns
CREATE POLICY "anon read public meta campaigns"
  ON public.referenz_meta_campaigns FOR SELECT
  TO anon
  USING (is_public = true);