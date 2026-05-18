ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS vor_nachname TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS laufzeit_in_14t BOOLEAN,
  ADD COLUMN IF NOT EXISTS gesamt_saldo NUMERIC,
  ADD COLUMN IF NOT EXISTS ads_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS cash_collect_offen NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_kosten NUMERIC,
  ADD COLUMN IF NOT EXISTS crm_kosten NUMERIC,
  ADD COLUMN IF NOT EXISTS superchat_kosten NUMERIC,
  ADD COLUMN IF NOT EXISTS website_kosten NUMERIC;

UPDATE public.clients
SET website_url = website
WHERE website_url IS NULL
  AND website IS NOT NULL
  AND trim(website) != '';