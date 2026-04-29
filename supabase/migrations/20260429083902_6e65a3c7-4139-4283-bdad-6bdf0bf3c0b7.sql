
-- Table
CREATE TABLE IF NOT EXISTS public.referenz_showcase (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('website', 'werbeanzeige')),
  title text NOT NULL,
  client_name text,
  branche text,
  description text,
  website_url text,
  preview_image_url text,
  video_url text,
  thumbnail_url text,
  ad_platform text,
  ad_format text,
  metrics jsonb,
  campaign_period_start date,
  campaign_period_end date,
  tags text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  display_order integer DEFAULT 0,
  linked_kunde_id uuid REFERENCES public.close_deals(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referenz_showcase_type ON public.referenz_showcase(type, is_active);
CREATE INDEX IF NOT EXISTS referenz_showcase_branche ON public.referenz_showcase(branche) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS referenz_showcase_featured ON public.referenz_showcase(is_featured) WHERE is_featured = true;

ALTER TABLE public.referenz_showcase ENABLE ROW LEVEL SECURITY;

-- Public can read a single entry (for /showcase/:id share links)
CREATE POLICY "public read active showcase" ON public.referenz_showcase
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "admins manage showcase" ON public.referenz_showcase
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service role full access showcase" ON public.referenz_showcase
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_referenz_showcase_updated_at ON public.referenz_showcase;
CREATE TRIGGER update_referenz_showcase_updated_at
  BEFORE UPDATE ON public.referenz_showcase
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('referenz-showcase', 'referenz-showcase', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read referenz showcase media" ON storage.objects
  FOR SELECT USING (bucket_id = 'referenz-showcase');

CREATE POLICY "admins upload referenz showcase media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'referenz-showcase' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update referenz showcase media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'referenz-showcase' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete referenz showcase media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'referenz-showcase' AND public.has_role(auth.uid(), 'admin'));
