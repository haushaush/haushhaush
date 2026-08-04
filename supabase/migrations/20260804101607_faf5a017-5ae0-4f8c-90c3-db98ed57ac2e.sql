-- ============ ENUMS ============
CREATE TYPE public.bonus_kanal AS ENUM ('email_auto','email_manuell','whatsapp_manuell');
CREATE TYPE public.bonus_cash_quelle AS ENUM ('qonto','manuell');
CREATE TYPE public.bonus_checkin_quelle AS ENUM ('close','dashboard','manuell');
CREATE TYPE public.bonus_churn_typ AS ENUM ('kuendigung_kunde','abbruch','planmaessiges_ende','kuendigung_arbeitgeber','insolvenz','ausserhalb_verantwortung');
CREATE TYPE public.bonus_monat_status AS ENUM ('offen','freigegeben');

-- ============ HELPER FUNCTIONS ============
-- Mapping auth.users -> public.team laeuft im Projekt ueber die E-Mail
-- (siehe team_with_auth_ids()/current_user_team_rolle()), da public.team
-- keine Auth-User-ID-Spalte hat.
-- WICHTIG: Wenn die E-Mail auf mehr als einen team-Eintrag passt, liefert
-- die Funktion bewusst NULL. Bei Gehaltsdaten ist "kein Zugriff" das sichere
-- Verhalten - ein zufaellig gewaehlter Treffer koennte fremde Bonusdaten
-- freigeben.
CREATE OR REPLACE FUNCTION public.bonus_my_team_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN count(*) = 1 THEN (min(t.id::text))::uuid ELSE NULL END
  FROM public.team t
  JOIN auth.users u ON lower(u.email) = lower(t.email)
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.bonus_can_manage()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.user_has_permission(auth.uid(),'hr.bonus.manage');
$$;

-- ============ bonus_mitarbeiter ============
CREATE TABLE public.bonus_mitarbeiter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  modell_start date NOT NULL,
  modell_ende date,
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bonus_mitarbeiter_team_start_uq ON public.bonus_mitarbeiter(team_id, modell_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_mitarbeiter TO authenticated;
GRANT ALL ON public.bonus_mitarbeiter TO service_role;
ALTER TABLE public.bonus_mitarbeiter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_mitarbeiter_select" ON public.bonus_mitarbeiter FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR team_id = public.bonus_my_team_id());
CREATE POLICY "bonus_mitarbeiter_write" ON public.bonus_mitarbeiter FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- Nach bonus_mitarbeiter: eigene Zeilen-Zuordnung
CREATE OR REPLACE FUNCTION public.bonus_is_own(_mitarbeiter_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bonus_mitarbeiter bm
    WHERE bm.id = _mitarbeiter_id
      AND bm.team_id IS NOT DISTINCT FROM public.bonus_my_team_id()
      AND public.bonus_my_team_id() IS NOT NULL
  );
$$;

-- ============ bonus_config ============
CREATE TABLE public.bonus_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  gueltig_ab date NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  erstellt_von uuid,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mitarbeiter_id, gueltig_ab)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_config TO authenticated;
GRANT ALL ON public.bonus_config TO service_role;
ALTER TABLE public.bonus_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_config_select" ON public.bonus_config FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_config_write" ON public.bonus_config FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_kunden_snapshot ============
CREATE TABLE public.bonus_kunden_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat date NOT NULL,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (monat, mitarbeiter_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_kunden_snapshot TO authenticated;
GRANT ALL ON public.bonus_kunden_snapshot TO service_role;
ALTER TABLE public.bonus_kunden_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_kunden_snapshot_select" ON public.bonus_kunden_snapshot FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_kunden_snapshot_write" ON public.bonus_kunden_snapshot FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_survey_tokens ============
CREATE TABLE public.bonus_survey_tokens (
  token text PRIMARY KEY,
  monat date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  kanal public.bonus_kanal NOT NULL DEFAULT 'email_auto',
  versendet_am timestamptz,
  geoeffnet_am timestamptz,
  ausgefuellt_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (monat, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_survey_tokens TO authenticated;
GRANT ALL ON public.bonus_survey_tokens TO service_role;
ALTER TABLE public.bonus_survey_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_survey_tokens_select" ON public.bonus_survey_tokens FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_survey_tokens_write" ON public.bonus_survey_tokens FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_survey_antworten ============
CREATE TABLE public.bonus_survey_antworten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE REFERENCES public.bonus_survey_tokens(token) ON DELETE CASCADE,
  f1_reaktionszeit int NOT NULL CHECK (f1_reaktionszeit BETWEEN 1 AND 5),
  f2_freundlichkeit int NOT NULL CHECK (f2_freundlichkeit BETWEEN 1 AND 5),
  f3_loesungsqualitaet int NOT NULL CHECK (f3_loesungsqualitaet BETWEEN 1 AND 5),
  f4_gesamt int NOT NULL CHECK (f4_gesamt BETWEEN 1 AND 5),
  freitext text,
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_survey_antworten TO authenticated;
GRANT ALL ON public.bonus_survey_antworten TO service_role;
ALTER TABLE public.bonus_survey_antworten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_survey_antworten_select" ON public.bonus_survey_antworten FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR EXISTS (
    SELECT 1 FROM public.bonus_survey_tokens t
    WHERE t.token = bonus_survey_antworten.token AND public.bonus_is_own(t.mitarbeiter_id)));
CREATE POLICY "bonus_survey_antworten_write" ON public.bonus_survey_antworten FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_cash_collect ============
CREATE TABLE public.bonus_cash_collect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat date NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  mitarbeiter_id uuid REFERENCES public.bonus_mitarbeiter(id) ON DELETE SET NULL,
  betrag numeric NOT NULL DEFAULT 0,
  eingang_am date,
  quelle public.bonus_cash_quelle NOT NULL DEFAULT 'manuell',
  qonto_transaction_id text,
  zugeordnet boolean NOT NULL DEFAULT false,
  zuordnung_durch uuid,
  zuordnung_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bonus_cash_collect_qonto_tx_uq ON public.bonus_cash_collect(qonto_transaction_id) WHERE qonto_transaction_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_cash_collect TO authenticated;
GRANT ALL ON public.bonus_cash_collect TO service_role;
ALTER TABLE public.bonus_cash_collect ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_cash_collect_select" ON public.bonus_cash_collect FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR (mitarbeiter_id IS NOT NULL AND public.bonus_is_own(mitarbeiter_id)));
CREATE POLICY "bonus_cash_collect_write" ON public.bonus_cash_collect FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_checkins ============
CREATE TABLE public.bonus_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  quelle public.bonus_checkin_quelle NOT NULL DEFAULT 'dashboard',
  close_activity_id text,
  datum date NOT NULL,
  stimmung text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bonus_checkins_close_activity_uq ON public.bonus_checkins(close_activity_id) WHERE close_activity_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_checkins TO authenticated;
GRANT ALL ON public.bonus_checkins TO service_role;
ALTER TABLE public.bonus_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_checkins_select" ON public.bonus_checkins FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_checkins_write" ON public.bonus_checkins FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_churn_events ============
CREATE TABLE public.bonus_churn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  typ public.bonus_churn_typ NOT NULL,
  zaehlt_als_churn boolean NOT NULL DEFAULT true,
  bemerkung text,
  festgestellt_durch uuid,
  festgestellt_am timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_churn_events TO authenticated;
GRANT ALL ON public.bonus_churn_events TO service_role;
ALTER TABLE public.bonus_churn_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_churn_events_select" ON public.bonus_churn_events FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_churn_events_write" ON public.bonus_churn_events FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_upsells ============
CREATE TABLE public.bonus_upsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  eingereicht_am date NOT NULL DEFAULT CURRENT_DATE,
  slack_message_url text,
  close_opportunity_id text,
  gebucht boolean NOT NULL DEFAULT false,
  volumen_monatlich numeric NOT NULL DEFAULT 0,
  laufzeit_monate int,
  erstlaufzeit_ende date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bonus_upsells_close_opp_uq ON public.bonus_upsells(close_opportunity_id) WHERE close_opportunity_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_upsells TO authenticated;
GRANT ALL ON public.bonus_upsells TO service_role;
ALTER TABLE public.bonus_upsells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_upsells_select" ON public.bonus_upsells FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_upsells_write" ON public.bonus_upsells FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_upsell_zahlungen ============
CREATE TABLE public.bonus_upsell_zahlungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upsell_id uuid NOT NULL REFERENCES public.bonus_upsells(id) ON DELETE CASCADE,
  monat date NOT NULL,
  betrag_eingegangen numeric NOT NULL DEFAULT 0,
  beteiligung numeric NOT NULL DEFAULT 0,
  storniert boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (upsell_id, monat)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_upsell_zahlungen TO authenticated;
GRANT ALL ON public.bonus_upsell_zahlungen TO service_role;
ALTER TABLE public.bonus_upsell_zahlungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_upsell_zahlungen_select" ON public.bonus_upsell_zahlungen FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR EXISTS (
    SELECT 1 FROM public.bonus_upsells u
    WHERE u.id = bonus_upsell_zahlungen.upsell_id AND public.bonus_is_own(u.mitarbeiter_id)));
CREATE POLICY "bonus_upsell_zahlungen_write" ON public.bonus_upsell_zahlungen FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_abwesenheit ============
CREATE TABLE public.bonus_abwesenheit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat date NOT NULL,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  fehltage_zusammenhaengend int NOT NULL DEFAULT 0,
  arbeitstage_monat int NOT NULL DEFAULT 0,
  grund text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (monat, mitarbeiter_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_abwesenheit TO authenticated;
GRANT ALL ON public.bonus_abwesenheit TO service_role;
ALTER TABLE public.bonus_abwesenheit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_abwesenheit_select" ON public.bonus_abwesenheit FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_abwesenheit_write" ON public.bonus_abwesenheit FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ bonus_monate ============
CREATE TABLE public.bonus_monate (
  monat date NOT NULL,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  p1_zufriedenheit numeric NOT NULL DEFAULT 0,
  p2_cash_niveau numeric NOT NULL DEFAULT 0,
  p3_cash_entwicklung numeric NOT NULL DEFAULT 0,
  p4_churn numeric NOT NULL DEFAULT 0,
  p5_calls numeric NOT NULL DEFAULT 0,
  punkte_gesamt numeric NOT NULL DEFAULT 0,
  bonus_eur numeric NOT NULL DEFAULT 0,
  upsell_beteiligung_eur numeric NOT NULL DEFAULT 0,
  status public.bonus_monat_status NOT NULL DEFAULT 'offen',
  freigegeben_von uuid,
  freigegeben_am timestamptz,
  berechnungsdetails jsonb NOT NULL DEFAULT '{}'::jsonb,
  funnel_ausfall boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monat, mitarbeiter_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_monate TO authenticated;
GRANT ALL ON public.bonus_monate TO service_role;
ALTER TABLE public.bonus_monate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_monate_select" ON public.bonus_monate FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_monate_write" ON public.bonus_monate FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

-- ============ updated_at TRIGGER ============
CREATE TRIGGER bonus_mitarbeiter_updated_at BEFORE UPDATE ON public.bonus_mitarbeiter FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_config_updated_at BEFORE UPDATE ON public.bonus_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_survey_tokens_updated_at BEFORE UPDATE ON public.bonus_survey_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_cash_collect_updated_at BEFORE UPDATE ON public.bonus_cash_collect FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_checkins_updated_at BEFORE UPDATE ON public.bonus_checkins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_churn_events_updated_at BEFORE UPDATE ON public.bonus_churn_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_upsells_updated_at BEFORE UPDATE ON public.bonus_upsells FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_upsell_zahlungen_updated_at BEFORE UPDATE ON public.bonus_upsell_zahlungen FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_abwesenheit_updated_at BEFORE UPDATE ON public.bonus_abwesenheit FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bonus_monate_updated_at BEFORE UPDATE ON public.bonus_monate FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PERMISSIONS ============
INSERT INTO public.app_permissions (permission_key, label, category, description, is_system)
VALUES
  ('hr.bonus.view','Bonus-Cockpit ansehen','HR','Eigenen Bonusstand einsehen', false),
  ('hr.bonus.manage','Bonus-Cockpit verwalten','HR','Alle Mitarbeiter, Freigabe, Klärliste und Konfiguration', false)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin','hr.bonus.view'), ('admin','hr.bonus.manage')
ON CONFLICT DO NOTHING;