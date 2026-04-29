-- Drop existing manual Werbeanzeigen from referenz_showcase (keep websites)
DELETE FROM public.referenz_showcase WHERE type = 'werbeanzeige';

-- Meta-imported ads
CREATE TABLE IF NOT EXISTS public.referenz_meta_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id text NOT NULL,
  meta_account_name text,
  meta_campaign_id text,
  meta_campaign_name text,
  meta_adset_id text,
  meta_adset_name text,
  meta_ad_id text NOT NULL,
  meta_ad_name text,
  meta_creative_id text,
  ad_format text,
  thumbnail_url text,
  video_url text,
  preview_url text,
  meta_metrics jsonb,
  campaign_period_start date,
  campaign_period_end date,
  metrics_last_refreshed_at timestamptz,
  custom_title text,
  custom_description text,
  custom_performance_notes text,
  custom_tags text[] DEFAULT '{}',
  filter_values jsonb DEFAULT '{}'::jsonb,
  linked_kunde_id uuid REFERENCES public.close_deals(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referenz_meta_ads_unique ON public.referenz_meta_ads(meta_ad_id);
CREATE INDEX IF NOT EXISTS referenz_meta_ads_active ON public.referenz_meta_ads(is_active);
CREATE INDEX IF NOT EXISTS referenz_meta_ads_featured ON public.referenz_meta_ads(is_featured) WHERE is_featured;
CREATE INDEX IF NOT EXISTS referenz_meta_ads_kunde ON public.referenz_meta_ads(linked_kunde_id);

ALTER TABLE public.referenz_meta_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read meta ads showcase" ON public.referenz_meta_ads
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "admins manage meta ads showcase" ON public.referenz_meta_ads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service role full access meta ads showcase" ON public.referenz_meta_ads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_referenz_meta_ads_updated_at
  BEFORE UPDATE ON public.referenz_meta_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Filter categories
CREATE TABLE IF NOT EXISTS public.showcase_filter_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applies_to text NOT NULL CHECK (applies_to IN ('werbeanzeige', 'website', 'both')),
  key text NOT NULL,
  label text NOT NULL,
  description text,
  display_order integer DEFAULT 0,
  is_required boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS showcase_filter_categories_key ON public.showcase_filter_categories(key, applies_to);

CREATE TABLE IF NOT EXISTS public.showcase_filter_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.showcase_filter_categories(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  color_hex text DEFAULT '#6B7280',
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS showcase_filter_options_unique ON public.showcase_filter_options(category_id, key);

ALTER TABLE public.showcase_filter_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_filter_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read filter categories" ON public.showcase_filter_categories
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "authenticated read filter options" ON public.showcase_filter_options
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "admins manage filter categories" ON public.showcase_filter_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage filter options" ON public.showcase_filter_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_showcase_filter_categories_updated_at
  BEFORE UPDATE ON public.showcase_filter_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults
INSERT INTO public.showcase_filter_categories (applies_to, key, label, display_order) VALUES
  ('werbeanzeige', 'branche', 'Branche', 1),
  ('werbeanzeige', 'format', 'Format', 2),
  ('werbeanzeige', 'kunde_type', 'Zielgruppe', 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.showcase_filter_options (category_id, key, label, color_hex, display_order)
SELECT c.id, opts.key, opts.label, opts.color, opts.ord
FROM public.showcase_filter_categories c
CROSS JOIN (VALUES
  ('branche', 'pkv',         'PKV',         '#0EA5E9', 1),
  ('branche', 'bu',          'BU',          '#10B981', 2),
  ('branche', 'kfz',         'KFZ',         '#F59E0B', 3),
  ('branche', 'rechtsschutz','Rechtsschutz','#8B5CF6', 4),
  ('branche', 'beihilfe',    'Beihilfe',    '#EC4899', 5),
  ('branche', 'unfall',      'Unfall',      '#EF4444', 6),
  ('branche', 'sonstige',    'Sonstige',    '#6B7280', 99),
  ('format',  'reel',        'Reel',        '#0EA5E9', 1),
  ('format',  'image',       'Bild',        '#10B981', 2),
  ('format',  'carousel',    'Carousel',    '#F59E0B', 3),
  ('format',  'video',       'Video',       '#8B5CF6', 4),
  ('format',  'story',       'Story',       '#EC4899', 5),
  ('kunde_type', 'b2c',      'B2C',         '#0EA5E9', 1),
  ('kunde_type', 'b2b',      'B2B',         '#10B981', 2)
) AS opts(cat_key, key, label, color, ord)
WHERE c.key = opts.cat_key
ON CONFLICT DO NOTHING;