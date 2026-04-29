
ALTER TABLE public.showcase_filter_categories
  ADD COLUMN IF NOT EXISTS is_auto_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_from_field text;

ALTER TABLE public.showcase_filter_options
  ADD COLUMN IF NOT EXISTS is_auto_synced boolean NOT NULL DEFAULT false;

-- Rename existing 'kunde' ad-filter category key to 'unternehmen'
UPDATE public.showcase_filter_categories
SET key = 'unternehmen'
WHERE key = 'kunde' AND applies_to = 'werbeanzeige';

-- Mark Branche + Unternehmen as auto-synced from Notion
UPDATE public.showcase_filter_categories
SET is_auto_synced = true, synced_from_field = 'close_deals.branche'
WHERE key = 'branche' AND applies_to = 'werbeanzeige';

UPDATE public.showcase_filter_categories
SET is_auto_synced = true, synced_from_field = 'close_deals.unternehmen'
WHERE key = 'unternehmen' AND applies_to = 'werbeanzeige';
