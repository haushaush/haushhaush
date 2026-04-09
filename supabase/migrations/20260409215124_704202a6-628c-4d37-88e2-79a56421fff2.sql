
ALTER TABLE public.close_deals
  ADD COLUMN IF NOT EXISTS notion_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS notion_url text,
  ADD COLUMN IF NOT EXISTS kundenstatus text,
  ADD COLUMN IF NOT EXISTS ampel text,
  ADD COLUMN IF NOT EXISTS ads_budget numeric,
  ADD COLUMN IF NOT EXISTS meta_kosten numeric,
  ADD COLUMN IF NOT EXISTS cash_collect_offen numeric,
  ADD COLUMN IF NOT EXISTS gesamt_saldo numeric,
  ADD COLUMN IF NOT EXISTS clv numeric,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS unternehmen text,
  ADD COLUMN IF NOT EXISTS branche text[],
  ADD COLUMN IF NOT EXISTS vor_nachname text,
  ADD COLUMN IF NOT EXISTS laufzeit_in_14t boolean DEFAULT false;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS notion_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS notion_url text,
  ADD COLUMN IF NOT EXISTS projektstatus text,
  ADD COLUMN IF NOT EXISTS typ text[],
  ADD COLUMN IF NOT EXISTS prioritaet text,
  ADD COLUMN IF NOT EXISTS laufzeit text,
  ADD COLUMN IF NOT EXISTS cash_collect numeric,
  ADD COLUMN IF NOT EXISTS offener_cash_collect numeric,
  ADD COLUMN IF NOT EXISTS aktuelle_rate numeric,
  ADD COLUMN IF NOT EXISTS rate_1 numeric,
  ADD COLUMN IF NOT EXISTS rate_2 numeric,
  ADD COLUMN IF NOT EXISTS rate_3 numeric,
  ADD COLUMN IF NOT EXISTS zahlstatus text,
  ADD COLUMN IF NOT EXISTS ads_budget numeric;

ALTER TABLE public.team
  ADD COLUMN IF NOT EXISTS notion_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS notion_url text,
  ADD COLUMN IF NOT EXISTS abteilung text[],
  ADD COLUMN IF NOT EXISTS mitarbeiter_typ text,
  ADD COLUMN IF NOT EXISTS rolle text,
  ADD COLUMN IF NOT EXISTS mitarbeiter_status text,
  ADD COLUMN IF NOT EXISTS telefonnummer text,
  ADD COLUMN IF NOT EXISTS verfuegbarkeit_h_woche numeric,
  ADD COLUMN IF NOT EXISTS einstiegsdatum date,
  ADD COLUMN IF NOT EXISTS nda_unterschrieben boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_abgeschlossen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS zugaenge text[];

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS notion_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS notion_url text,
  ADD COLUMN IF NOT EXISTS rechnungsnummer text,
  ADD COLUMN IF NOT EXISTS anteil_vc numeric,
  ADD COLUMN IF NOT EXISTS anteil_hhs numeric,
  ADD COLUMN IF NOT EXISTS zahlstatus_notion text,
  ADD COLUMN IF NOT EXISTS re_gesendet_am date,
  ADD COLUMN IF NOT EXISTS zahldatum date,
  ADD COLUMN IF NOT EXISTS projekt_typ text,
  ADD COLUMN IF NOT EXISTS art_des_projekts text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS notion_id text UNIQUE;
