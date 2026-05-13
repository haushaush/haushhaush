ALTER TABLE public.referenz_meta_ads
  ADD COLUMN IF NOT EXISTS sync_strategy TEXT,
  ADD COLUMN IF NOT EXISTS sync_details JSONB,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;