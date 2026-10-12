ALTER TYPE public.bonus_cash_quelle ADD VALUE IF NOT EXISTS 'lexoffice';

ALTER TABLE public.bonus_cash_collect
  ADD COLUMN IF NOT EXISTS quelle_id text,
  ADD COLUMN IF NOT EXISTS zahlung_schluessel text,
  ADD COLUMN IF NOT EXISTS rechnungsnummer text,
  ADD COLUMN IF NOT EXISTS empfaenger_name text,
  ADD COLUMN IF NOT EXISTS brutto numeric,
  ADD COLUMN IF NOT EXISTS netto_voll numeric,
  ADD COLUMN IF NOT EXISTS werbebudget_abzug numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abzug_positionen jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS klaer_grund text;
COMMENT ON COLUMN public.bonus_cash_collect.zahlung_schluessel IS 'Source-independent dedupe key (rechnung:<normalized invoice number>), so the same payment from Qonto and lexoffice counts once';
CREATE UNIQUE INDEX IF NOT EXISTS bonus_cash_collect_zahlung_uidx ON public.bonus_cash_collect(zahlung_schluessel);

CREATE TABLE public.bonus_cash_ausschluesse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  begriff text NOT NULL UNIQUE,
  aktiv boolean NOT NULL DEFAULT true,
  angelegt_von uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_cash_ausschluesse TO authenticated;
GRANT ALL ON public.bonus_cash_ausschluesse TO service_role;
ALTER TABLE public.bonus_cash_ausschluesse ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonus_cash_ausschluesse_manage ON public.bonus_cash_ausschluesse FOR ALL TO authenticated USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());

CREATE TABLE public.bonus_cash_ignorierte_empfaenger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qonto_client_name text NOT NULL UNIQUE,
  grund text,
  angelegt_von uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_cash_ignorierte_empfaenger TO authenticated;
GRANT ALL ON public.bonus_cash_ignorierte_empfaenger TO service_role;
ALTER TABLE public.bonus_cash_ignorierte_empfaenger ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonus_cash_ignoriert_manage ON public.bonus_cash_ignorierte_empfaenger FOR ALL TO authenticated USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());