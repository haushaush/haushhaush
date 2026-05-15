ALTER TABLE public.referenz_meta_ads
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS effective_status TEXT,
  ADD COLUMN IF NOT EXISTS status_last_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_referenz_meta_ads_effective_status
  ON public.referenz_meta_ads(effective_status);