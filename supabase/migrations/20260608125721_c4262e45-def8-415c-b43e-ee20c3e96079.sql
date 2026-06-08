
-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remove existing jobs if present (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-status-check-hourly') THEN
    PERFORM cron.unschedule('meta-status-check-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slack-list-sync-daily') THEN
    PERFORM cron.unschedule('slack-list-sync-daily');
  END IF;
END $$;

-- 3. Hourly Meta-Status-Check (xx:00 UTC)
SELECT cron.schedule(
  'meta-status-check-hourly',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/check-meta-campaign-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('trigger_source', 'cron')
  );
  $job$
);

-- 4. Daily Slack-List-Sync (22:59 UTC)
SELECT cron.schedule(
  'slack-list-sync-daily',
  '59 22 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-slack-list',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('list_id', 'F0B56EJPTEZ', 'trigger_source', 'cron')
  );
  $job$
);
