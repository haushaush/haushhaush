ALTER TABLE public.bonus_kunden_aktuell ALTER COLUMN mitarbeiter_id DROP NOT NULL;
ALTER TABLE public.bonus_kunden_aktuell ALTER COLUMN close_opportunity_id DROP NOT NULL;
ALTER TABLE public.bonus_kunden_aktuell
  ADD COLUMN IF NOT EXISTS close_account text NOT NULL DEFAULT 'CLOSE_API_KEY_SALES',
  ADD COLUMN IF NOT EXISTS close_status_label text,
  ADD COLUMN IF NOT EXISTS zaehlt_fuer_betreuung boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS zuordnung_quelle text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS bonus_kunden_aktuell_account_lead_key ON public.bonus_kunden_aktuell (close_account, close_lead_id);
COMMENT ON COLUMN public.bonus_kunden_aktuell.close_opportunity_id IS 'DEPRECATED: list is lead-based (Close lead status), not opportunity-based';
COMMENT ON COLUMN public.bonus_kunden_aktuell.zuordnung_quelle IS 'How client_id was resolved: close_link, kunde_close_deals, name, neu_angelegt, manuell. Once set, never re-resolved automatically.';

CREATE TABLE public.bonus_checkin_kandidaten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_activity_id text NOT NULL UNIQUE,
  close_lead_id text NOT NULL,
  lead_name text,
  close_status_label text,
  datum date NOT NULL,
  monat date NOT NULL,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','ignoriert','uebernommen')),
  bearbeitet_von uuid,
  bearbeitet_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.bonus_checkin_kandidaten TO authenticated;
GRANT ALL ON public.bonus_checkin_kandidaten TO service_role;
ALTER TABLE public.bonus_checkin_kandidaten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kandidaten lesen" ON public.bonus_checkin_kandidaten FOR SELECT TO authenticated USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "kandidaten bearbeiten" ON public.bonus_checkin_kandidaten FOR UPDATE TO authenticated USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());
CREATE INDEX bonus_checkin_kandidaten_monat_idx ON public.bonus_checkin_kandidaten (monat, mitarbeiter_id, status);