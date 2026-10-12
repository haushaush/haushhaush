ALTER TABLE public.bonus_churn_events ADD COLUMN IF NOT EXISTS close_task_erledigt_am timestamptz;
CREATE OR REPLACE FUNCTION public.bonus_guard_churn_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _namen text;
BEGIN
  IF NEW.churn_erfassung_abgeschlossen IS TRUE AND (TG_OP = 'INSERT' OR OLD.churn_erfassung_abgeschlossen IS DISTINCT FROM TRUE) THEN
    IF EXISTS (SELECT 1 FROM public.bonus_churn_events WHERE monat = NEW.monat AND mitarbeiter_id = NEW.mitarbeiter_id AND freigabe_status = 'offen') THEN
      RAISE EXCEPTION 'Churn-Erfassung kann nicht abgeschlossen werden: Es gibt noch Sonderfälle mit offener Freigabe.';
    END IF;
    SELECT string_agg(coalesce(c.name, e.client_id::text), ', ') INTO _namen
      FROM public.bonus_churn_events e LEFT JOIN public.clients c ON c.id = e.client_id
      WHERE e.monat = NEW.monat AND e.mitarbeiter_id = NEW.mitarbeiter_id
        AND (e.kuendigungsdatum IS NULL OR nullif(btrim(coalesce(e.bemerkung,'')),'') IS NULL);
    IF _namen IS NOT NULL THEN
      RAISE EXCEPTION 'Churn-Erfassung kann nicht abgeschlossen werden: Angaben unvollständig bei %', _namen;
    END IF;
  END IF;
  RETURN NEW;
END $$;