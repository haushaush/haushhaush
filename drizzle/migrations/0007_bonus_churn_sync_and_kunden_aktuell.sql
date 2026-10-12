ALTER TABLE public.bonus_churn_events
  ADD COLUMN IF NOT EXISTS close_opportunity_id text,
  ADD COLUMN IF NOT EXISTS close_lead_id text,
  ADD COLUMN IF NOT EXISTS close_status_id text,
  ADD COLUMN IF NOT EXISTS abgang_datum date,
  ADD COLUMN IF NOT EXISTS kuendigungsdatum date,
  ADD COLUMN IF NOT EXISTS letzter_vertragstag date,
  ADD COLUMN IF NOT EXISTS freigabe_status text,
  ADD COLUMN IF NOT EXISTS freigegeben_von uuid,
  ADD COLUMN IF NOT EXISTS freigegeben_am timestamptz,
  ADD COLUMN IF NOT EXISTS close_note_id text,
  ADD COLUMN IF NOT EXISTS close_task_id text,
  ADD COLUMN IF NOT EXISTS close_status_umgestellt_am timestamptz;
ALTER TABLE public.bonus_churn_events ADD CONSTRAINT bonus_churn_events_freigabe_status_chk CHECK (freigabe_status IS NULL OR freigabe_status IN ('offen','freigegeben','abgelehnt'));
CREATE UNIQUE INDEX IF NOT EXISTS bonus_churn_events_close_opp_uidx ON public.bonus_churn_events(close_opportunity_id);

CREATE TABLE public.bonus_kunden_aktuell (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  close_lead_id text NOT NULL,
  close_opportunity_id text NOT NULL UNIQUE,
  lead_name text,
  seit date,
  aktiv boolean NOT NULL DEFAULT true,
  zuletzt_gesehen_am timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_kunden_aktuell TO authenticated;
GRANT ALL ON public.bonus_kunden_aktuell TO service_role;
ALTER TABLE public.bonus_kunden_aktuell ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonus_kunden_aktuell_select ON public.bonus_kunden_aktuell FOR SELECT TO authenticated USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY bonus_kunden_aktuell_write ON public.bonus_kunden_aktuell FOR ALL TO authenticated USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

CREATE OR REPLACE FUNCTION public.bonus_guard_churn_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.churn_erfassung_abgeschlossen IS TRUE AND (TG_OP = 'INSERT' OR OLD.churn_erfassung_abgeschlossen IS DISTINCT FROM TRUE) THEN
    IF EXISTS (SELECT 1 FROM public.bonus_churn_events WHERE monat = NEW.monat AND mitarbeiter_id = NEW.mitarbeiter_id AND freigabe_status = 'offen') THEN
      RAISE EXCEPTION 'Churn-Erfassung kann nicht abgeschlossen werden: Es gibt noch Sonderfälle mit offener Freigabe.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bonus_guard_churn_confirmation BEFORE INSERT OR UPDATE ON public.bonus_monat_freigaben FOR EACH ROW EXECUTE FUNCTION public.bonus_guard_churn_confirmation();