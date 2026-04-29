-- Reset embed-related columns on referenz_showcase
ALTER TABLE public.referenz_showcase
  DROP COLUMN IF EXISTS embed_method,
  DROP COLUMN IF EXISTS screenshot_url,
  DROP COLUMN IF EXISTS embed_blocked,
  DROP COLUMN IF EXISTS last_embed_check_at,
  DROP COLUMN IF EXISTS is_unpublished;

ALTER TABLE public.referenz_showcase
  ADD COLUMN IF NOT EXISTS fallback_image_url text;
-- website_url already exists
