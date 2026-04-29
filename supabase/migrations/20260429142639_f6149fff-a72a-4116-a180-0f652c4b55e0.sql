CREATE TABLE IF NOT EXISTS public.referenz_meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id TEXT NOT NULL,
  meta_account_name TEXT,
  meta_campaign_id TEXT NOT NULL,
  meta_campaign_name TEXT,
  meta_objective TEXT,
  meta_status TEXT,
  metrics JSONB,
  campaign_period_start DATE,
  campaign_period_end DATE,
  metrics_last_refreshed_at TIMESTAMPTZ,
  total_ads_count INTEGER DEFAULT 0,
  total_adsets_count INTEGER DEFAULT 0,
  custom_title TEXT,
  custom_description TEXT,
  custom_setup_notes TEXT,
  custom_results_summary TEXT,
  custom_tags TEXT[] DEFAULT '{}',
  filter_values JSONB DEFAULT '{}'::jsonb,
  linked_kunde_id UUID REFERENCES public.close_deals(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referenz_meta_campaigns_unique
  ON public.referenz_meta_campaigns(meta_campaign_id);
CREATE INDEX IF NOT EXISTS referenz_meta_campaigns_active
  ON public.referenz_meta_campaigns(is_active);
CREATE INDEX IF NOT EXISTS referenz_meta_campaigns_featured
  ON public.referenz_meta_campaigns(is_featured) WHERE is_featured;
CREATE INDEX IF NOT EXISTS referenz_meta_campaigns_kunde
  ON public.referenz_meta_campaigns(linked_kunde_id);
CREATE INDEX IF NOT EXISTS referenz_meta_campaigns_account
  ON public.referenz_meta_campaigns(meta_account_id);

ALTER TABLE public.referenz_meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read campaigns showcase"
  ON public.referenz_meta_campaigns
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "admins manage campaigns showcase"
  ON public.referenz_meta_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service role full access campaigns showcase"
  ON public.referenz_meta_campaigns
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_referenz_meta_campaigns_updated_at ON public.referenz_meta_campaigns;
CREATE TRIGGER update_referenz_meta_campaigns_updated_at
  BEFORE UPDATE ON public.referenz_meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.showcase_filter_categories
  DROP CONSTRAINT IF EXISTS showcase_filter_categories_applies_to_check;

ALTER TABLE public.showcase_filter_categories
  ADD CONSTRAINT showcase_filter_categories_applies_to_check
  CHECK (applies_to IN ('werbeanzeige', 'website', 'kampagne', 'both', 'all'));

UPDATE public.showcase_filter_categories
SET applies_to = 'all'
WHERE key IN ('branche', 'unternehmen', 'format', 'zielgruppe')
  AND applies_to = 'werbeanzeige';
