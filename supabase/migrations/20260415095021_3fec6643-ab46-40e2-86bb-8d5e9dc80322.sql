
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS umsatz_geschr_am date,
  ADD COLUMN IF NOT EXISTS cash_collect_uebernommen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mail_gesendet boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS startdatum_abgehakt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verarbeitet boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_management boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_mitarbeiter boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verknuepfte_kunden_ids text[],
  ADD COLUMN IF NOT EXISTS verknuepfte_mitarbeiter_ids text[],
  ADD COLUMN IF NOT EXISTS verknuepfte_aufgaben_ids text[];
