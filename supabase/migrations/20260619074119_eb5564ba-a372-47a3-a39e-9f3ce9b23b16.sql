
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-metrics-daily-active') THEN
    PERFORM cron.unschedule('meta-ads-metrics-daily-active');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-metrics-weekly-all') THEN
    PERFORM cron.unschedule('meta-ads-metrics-weekly-all');
  END IF;
END $$;

-- Daily 00:00 UTC — only ACTIVE ads
SELECT cron.schedule(
  'meta-ads-metrics-daily-active',
  '0 0 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/meta-ads-refresh-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron-daily', 'onlyActive', true, 'datePreset', 'maximum'),
    timeout_milliseconds := 600000
  );
  $job$
);

-- Weekly Sunday 03:00 UTC — ALL ads (refresh effective_status of all)
SELECT cron.schedule(
  'meta-ads-metrics-weekly-all',
  '0 3 * * 0',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/meta-ads-refresh-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron-weekly', 'datePreset', 'maximum'),
    timeout_milliseconds := 600000
  );
  $job$
);
