ALTER TABLE public.close_opportunities DROP COLUMN IF EXISTS raw;
ALTER TABLE public.close_activities DROP COLUMN IF EXISTS raw_data;
ALTER TABLE public.close_link ADD COLUMN IF NOT EXISTS last_activities_synced_at TIMESTAMPTZ;
ALTER TABLE public.close_link ADD COLUMN IF NOT EXISTS last_opps_synced_at TIMESTAMPTZ;