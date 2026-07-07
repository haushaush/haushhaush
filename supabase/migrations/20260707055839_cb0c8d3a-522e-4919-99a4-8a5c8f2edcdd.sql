DO $$
DECLARE
  v_url text := 'https://fqcueblsinjiclolubwv.supabase.co/functions/v1/sync-qonto';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxY3VlYmxzaW5qaWNsb2x1Ynd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMzg4MzMsImV4cCI6MjA5MDYxNDgzM30.ZvffNSqD2LiyAAInF0LVOSzABnq_HaVMb4aqfPx4OfI';
  v_secret text;
  v_cmd_daily text;
  v_cmd_3h text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'qonto_cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE NOTICE 'qonto_cron_secret not found in vault – skipping cron update';
    RETURN;
  END IF;

  v_cmd_daily := format($cmd$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer %s',
        'apikey','%s',
        'x-cron-secret','%s',
        'x-sync-trigger','auto_cron'
      ),
      body := jsonb_build_object('mode','incremental','trigger_type','auto_cron')
    ) as request_id;
  $cmd$, v_url, v_anon, v_anon, v_secret);

  v_cmd_3h := v_cmd_daily;

  PERFORM cron.unschedule('qonto-sync-daily-6am') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='qonto-sync-daily-6am');
  PERFORM cron.unschedule('qonto-sync-every-3h') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='qonto-sync-every-3h');

  PERFORM cron.schedule('qonto-sync-daily-6am', '0 6 * * *', v_cmd_daily);
  PERFORM cron.schedule('qonto-sync-every-3h', '0 9,12,15,18,21 * * *', v_cmd_3h);
END $$;