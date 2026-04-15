ALTER TABLE public.close_deals
  ADD COLUMN IF NOT EXISTS crm_kosten numeric,
  ADD COLUMN IF NOT EXISTS superchat_kosten numeric,
  ADD COLUMN IF NOT EXISTS website_kosten numeric,
  ADD COLUMN IF NOT EXISTS end_datum date,
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS projekttyp text[],
  ADD COLUMN IF NOT EXISTS laufzeit text;