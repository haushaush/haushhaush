
CREATE TABLE public.meta_campaign_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_item_id text NOT NULL,
  slack_list_id text NOT NULL,
  meta_account_id text,
  meta_campaign_id text,
  meta_campaign_name text,
  event_time timestamptz,
  actor_name text,
  old_value text,
  new_value text,
  slack_status_before text,
  slack_status_after text,
  trigger_source text CHECK (trigger_source IN ('cron','manual')),
  webhook_success boolean,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meta_log_item ON public.meta_campaign_status_log(slack_item_id);
CREATE INDEX idx_meta_log_time ON public.meta_campaign_status_log(created_at DESC);

GRANT SELECT ON public.meta_campaign_status_log TO authenticated;
GRANT ALL ON public.meta_campaign_status_log TO service_role;
ALTER TABLE public.meta_campaign_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read log" ON public.meta_campaign_status_log
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.meta_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  trigger_source text CHECK (trigger_source IN ('cron','manual')),
  accounts_checked integer,
  events_found integer,
  items_matched integer,
  updates_sent integer,
  errors integer,
  duration_ms integer,
  error_details jsonb
);
CREATE INDEX idx_meta_runs_time ON public.meta_check_runs(triggered_at DESC);

GRANT SELECT ON public.meta_check_runs TO authenticated;
GRANT ALL ON public.meta_check_runs TO service_role;
ALTER TABLE public.meta_check_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read runs" ON public.meta_check_runs
  FOR SELECT TO authenticated USING (true);
