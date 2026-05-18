ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS notion_id TEXT,
  ADD COLUMN IF NOT EXISTS notion_url TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_notion_id_key'
  ) THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_notion_id_key UNIQUE (notion_id);
  END IF;
END $$;

UPDATE public.clients c
SET notion_id = cd.notion_id, notion_url = cd.notion_url
FROM public.close_deals cd
WHERE cd.client_id = c.id
  AND c.notion_id IS NULL
  AND cd.notion_id IS NOT NULL;