
-- Add status columns to kunde_close_deals
ALTER TABLE public.kunde_close_deals
  ADD COLUMN IF NOT EXISTS close_status_label text,
  ADD COLUMN IF NOT EXISTS status_category text DEFAULT 'won';

-- Backfill existing rows
UPDATE public.kunde_close_deals SET status_category = 'won' WHERE status_category IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_kunde_close_deals_status_category ON public.kunde_close_deals(kunde_id, status_category);

-- Add status_category to pending_close_matches
ALTER TABLE public.pending_close_matches
  ADD COLUMN IF NOT EXISTS status_category text DEFAULT 'won';

CREATE INDEX IF NOT EXISTS idx_pending_close_matches_status_category ON public.pending_close_matches(kunde_id, status_category);
