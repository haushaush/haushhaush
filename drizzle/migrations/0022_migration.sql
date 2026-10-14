CREATE OR REPLACE FUNCTION public.clients_skip_unbekannt()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.name IS NULL OR lower(trim(NEW.name)) IN ('', 'unbekannt', 'unknown') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clients_skip_unbekannt ON public.clients;
CREATE TRIGGER trg_clients_skip_unbekannt BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.clients_skip_unbekannt();

SELECT cron.unschedule('clients-dubletten-taeglich') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='clients-dubletten-taeglich');
SELECT cron.schedule('clients-dubletten-taeglich', '30 3 * * *', $$SELECT public.merge_duplicate_clients();$$);