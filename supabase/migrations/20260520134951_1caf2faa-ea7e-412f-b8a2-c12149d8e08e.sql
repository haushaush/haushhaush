
-- Phase 4: Zentralisierung auf clients als Master-Tabelle
-- Fügt überall fehlende client_id-Spalten hinzu und backfillt sie

-- 1) kunde_meta_accounts: neue client_id-Spalte
ALTER TABLE public.kunde_meta_accounts
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

UPDATE public.kunde_meta_accounts kma
SET client_id = cd.client_id
FROM public.close_deals cd
WHERE kma.kunde_id = cd.id
  AND kma.client_id IS NULL
  AND cd.client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kunde_meta_accounts_client ON public.kunde_meta_accounts(client_id);

-- 2) kunde_close_deals: neue client_id-Spalte
ALTER TABLE public.kunde_close_deals
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

UPDATE public.kunde_close_deals kcd
SET client_id = cd.client_id
FROM public.close_deals cd
WHERE kcd.kunde_id = cd.id
  AND kcd.client_id IS NULL
  AND cd.client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kunde_close_deals_client ON public.kunde_close_deals(client_id);

-- 3) referenz_meta_ads: fehlende linked_client_id über close_deals nachziehen
UPDATE public.referenz_meta_ads rma
SET linked_client_id = cd.client_id
FROM public.close_deals cd
WHERE rma.linked_kunde_id = cd.id
  AND rma.linked_client_id IS NULL
  AND cd.client_id IS NOT NULL;

-- 4) referenz_showcase: Backfill linked_client_id via close_deals (über linked_kunde_id)
UPDATE public.referenz_showcase rs
SET linked_client_id = cd.client_id
FROM public.close_deals cd
WHERE rs.linked_kunde_id = cd.id
  AND rs.linked_client_id IS NULL
  AND cd.client_id IS NOT NULL;

-- Zusätzlich Name-Match für showcase ohne linked_kunde_id
UPDATE public.referenz_showcase rs
SET linked_client_id = c.id
FROM public.clients c
WHERE rs.linked_client_id IS NULL
  AND rs.client_name IS NOT NULL
  AND trim(rs.client_name) <> ''
  AND lower(trim(c.name)) = lower(trim(rs.client_name))
  AND c.deleted_at IS NULL;

-- 5) onepage_projects: client_id aus client_id_fk übernehmen
UPDATE public.onepage_projects
SET client_id = client_id_fk
WHERE client_id IS NULL
  AND client_id_fk IS NOT NULL;

-- 6) projects: Name-Match auf clients.name
UPDATE public.projects p
SET client_id = c.id
FROM public.clients c
WHERE p.client_id IS NULL
  AND p.name IS NOT NULL
  AND trim(p.name) <> ''
  AND lower(trim(c.name)) = lower(trim(p.name))
  AND c.deleted_at IS NULL;

-- 7) Trigger: Auto-sync client_id in kunde_meta_accounts bei INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.sync_kunde_meta_account_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.kunde_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id
    FROM public.close_deals
    WHERE id = NEW.kunde_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_kma_client_id ON public.kunde_meta_accounts;
CREATE TRIGGER trg_sync_kma_client_id
BEFORE INSERT OR UPDATE ON public.kunde_meta_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_kunde_meta_account_client_id();

-- 8) Trigger: Auto-sync client_id in kunde_close_deals bei INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.sync_kunde_close_deals_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.kunde_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id
    FROM public.close_deals
    WHERE id = NEW.kunde_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_kcd_client_id ON public.kunde_close_deals;
CREATE TRIGGER trg_sync_kcd_client_id
BEFORE INSERT OR UPDATE ON public.kunde_close_deals
FOR EACH ROW
EXECUTE FUNCTION public.sync_kunde_close_deals_client_id();
