
ALTER TABLE public.close_leads ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.close_leads ADD COLUMN IF NOT EXISTS custom_fields jsonb;
CREATE INDEX IF NOT EXISTS idx_close_leads_client ON public.close_leads(client_id);
