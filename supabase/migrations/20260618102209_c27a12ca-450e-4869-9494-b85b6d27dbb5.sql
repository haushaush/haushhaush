ALTER TABLE public.slack_lists
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS variable_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.slack_lists
SET variable_mapping = '{"Col0B645A1WL8":"status"}'::jsonb
WHERE slack_list_id = 'F0B56EJPTEZ'
  AND (variable_mapping IS NULL OR variable_mapping = '{}'::jsonb);