-- 1. Erweitere team-Tabelle
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE public.team ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- 2. Bestehende Mitarbeiter als „onboarded" markieren
UPDATE public.team
SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
    must_change_password = false
WHERE onboarding_completed_at IS NULL;

-- 3. team_hr_data Tabelle anlegen
CREATE TABLE IF NOT EXISTS public.team_hr_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rentenversicherungsnummer text,
  steuer_id text,
  sozialversicherungsnummer text,
  krankenkasse text,
  krankenversicherung_nummer text,
  iban text,
  bic text,
  bank_name text,
  adresse_strasse text,
  adresse_plz text,
  adresse_ort text,
  adresse_land text DEFAULT 'Deutschland',
  geburtsdatum date,
  geburtsort text,
  staatsangehoerigkeit text DEFAULT 'Deutsch',
  familienstand text,
  kinder_anzahl integer DEFAULT 0,
  steuerklasse integer,
  konfession text,
  notfallkontakt_name text,
  notfallkontakt_telefon text,
  notfallkontakt_beziehung text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.team_hr_data ENABLE ROW LEVEL SECURITY;

-- Eigene Daten lesen
CREATE POLICY "own hr data read"
ON public.team_hr_data
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Eigene Daten einfügen
CREATE POLICY "own hr data insert"
ON public.team_hr_data
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Eigene Daten aktualisieren
CREATE POLICY "own hr data update"
ON public.team_hr_data
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins lesen alle
CREATE POLICY "admins read all hr"
ON public.team_hr_data
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Buchhaltung liest alle
CREATE POLICY "buchhaltung read all hr"
ON public.team_hr_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team t
    WHERE t.id = auth.uid()
      AND (t.department = 'Buchhaltung' OR 'Buchhaltung' = ANY(t.abteilung))
  )
);

-- Trigger für updated_at
CREATE TRIGGER update_team_hr_data_updated_at
BEFORE UPDATE ON public.team_hr_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();