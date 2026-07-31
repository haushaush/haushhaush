ALTER TABLE public.meta_reporting_settings
  ADD COLUMN IF NOT EXISTS last_report_status text,
  ADD COLUMN IF NOT EXISTS last_report_trigger_source text,
  ADD COLUMN IF NOT EXISTS last_report_period_label text,
  ADD COLUMN IF NOT EXISTS last_report_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_report_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_report_error text,
  ADD COLUMN IF NOT EXISTS last_slack_status text,
  ADD COLUMN IF NOT EXISTS last_slack_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_slack_error text,
  ADD COLUMN IF NOT EXISTS last_email_status text,
  ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_to text,
  ADD COLUMN IF NOT EXISTS last_email_error text;