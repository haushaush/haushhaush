
-- Replace partial unique indexes with real unique constraints so ON CONFLICT works.
DROP INDEX IF EXISTS public.meta_payment_receipts_transaction_id_uniq;
DROP INDEX IF EXISTS public.meta_payment_receipts_gmail_id_uniq;

ALTER TABLE public.meta_payment_receipts
  ADD CONSTRAINT meta_payment_receipts_transaction_id_key UNIQUE (transaction_id);

ALTER TABLE public.meta_payment_receipts
  ADD CONSTRAINT meta_payment_receipts_gmail_id_key UNIQUE (gmail_id);
