ALTER TABLE public.close_link DROP CONSTRAINT IF EXISTS close_link_matched_via_check;
ALTER TABLE public.close_link ADD CONSTRAINT close_link_matched_via_check
  CHECK (matched_via IN ('email','email_variant','name_fallback','name_fuzzy','manual','auto_100'));