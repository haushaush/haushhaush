-- Make client_id nullable so Notion imports work
ALTER TABLE public.projects ALTER COLUMN client_id DROP NOT NULL;

-- Add missing columns
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS projektname text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS branche text[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deadline date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS zahldatum date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rate_4 numeric;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rate_5 numeric;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS verknuepfte_kunden text[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS aktueller_monat text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS monat_leadanzahl text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS letztes_update timestamptz;

-- Add unique constraint on notion_id for upserts
ALTER TABLE public.projects ADD CONSTRAINT projects_notion_id_unique UNIQUE (notion_id);