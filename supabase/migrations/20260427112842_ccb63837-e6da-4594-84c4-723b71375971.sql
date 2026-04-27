ALTER TABLE public.onepage_project_leads
  ADD COLUMN IF NOT EXISTS unternehmen text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text;