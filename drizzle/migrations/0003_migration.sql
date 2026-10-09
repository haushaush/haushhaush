ALTER TABLE public.bonus_checkins
  ADD COLUMN IF NOT EXISTS anlass text,
  ADD COLUMN IF NOT EXISTS kampagne_nach_erwartung text,
  ADD COLUMN IF NOT EXISTS upsell_potenzial text,
  ADD COLUMN IF NOT EXISTS naechster_schritt text,
  ADD COLUMN IF NOT EXISTS offene_punkte text,
  ADD COLUMN IF NOT EXISTS naechster_checkin_faellig date,
  ADD COLUMN IF NOT EXISTS close_lead_id text,
  ADD COLUMN IF NOT EXISTS close_user_id text;

DROP INDEX IF EXISTS public.bonus_checkins_close_activity_uq;
CREATE UNIQUE INDEX IF NOT EXISTS bonus_checkins_close_activity_id_key ON public.bonus_checkins (close_activity_id);

CREATE TABLE public.bonus_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_typ text NOT NULL DEFAULT 'checkins',
  ausloeser text NOT NULL,
  monat date NOT NULL,
  mitarbeiter_id uuid REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  beendet_am timestamptz,
  ok boolean,
  gefunden integer,
  neu integer,
  aktualisiert integer,
  entfernt integer,
  nicht_zuordenbar jsonb NOT NULL DEFAULT '[]'::jsonb,
  fehler text
);
CREATE INDEX bonus_sync_log_lookup ON public.bonus_sync_log (sync_typ, monat, mitarbeiter_id, gestartet_am DESC);
ALTER TABLE public.bonus_sync_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bonus_sync_log TO authenticated;
GRANT ALL ON public.bonus_sync_log TO service_role;
CREATE POLICY "bonus_sync_log_select" ON public.bonus_sync_log FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));

-- Private token store for internal cron calls (no policies = no client access)
CREATE TABLE public.bonus_cron_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bonus_cron_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bonus_cron_tokens FROM anon, authenticated;
GRANT ALL ON public.bonus_cron_tokens TO service_role;