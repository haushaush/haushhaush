ALTER TABLE public.slack_lists ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'aufgaben';
UPDATE public.slack_lists SET context = 'vorquali' WHERE slack_list_id = 'F0B56EJPTEZ';