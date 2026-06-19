CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-close-opportunities-daily') THEN
    PERFORM cron.unschedule('sync-close-opportunities-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-close-opportunities-daily',
  '0 1 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-close-opportunities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron-daily'),
    timeout_milliseconds := 600000
  );
  $job$
);