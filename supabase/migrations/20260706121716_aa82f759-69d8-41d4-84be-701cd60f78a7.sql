
ALTER TABLE public.qonto_sync_status
  ADD COLUMN IF NOT EXISTS fetched_count integer,
  ADD COLUMN IF NOT EXISTS pages_loaded integer,
  ADD COLUMN IF NOT EXISTS total_pages integer,
  ADD COLUMN IF NOT EXISTS completed boolean,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;
