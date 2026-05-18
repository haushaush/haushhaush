-- ════════════════════════════════════════════════════════════════
-- TEIL 7: BACKFILL — close_deals.client_id & onepage_projects.client_id_fk
-- ════════════════════════════════════════════════════════════════

-- 1) Bestehende close_deals: client_id setzen wo NULL, via Name-Match
UPDATE public.close_deals cd
SET client_id = c.id
FROM public.clients c
WHERE cd.client_id IS NULL
  AND cd.client_name IS NOT NULL
  AND lower(trim(c.name)) = lower(trim(cd.client_name));

-- 2) Auto-create clients für close_deals ohne Match
INSERT INTO public.clients (name, kundenstatus, created_at)
SELECT
  trim(cd.client_name) AS name,
  'Lead'::kundenstatus AS kundenstatus,
  MIN(cd.created_at) AS created_at
FROM public.close_deals cd
WHERE cd.client_id IS NULL
  AND cd.client_name IS NOT NULL
  AND trim(cd.client_name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE lower(trim(c.name)) = lower(trim(cd.client_name))
  )
GROUP BY trim(cd.client_name);

-- 3) Nochmal client_id setzen nach Auto-Create
UPDATE public.close_deals cd
SET client_id = c.id
FROM public.clients c
WHERE cd.client_id IS NULL
  AND cd.client_name IS NOT NULL
  AND lower(trim(c.name)) = lower(trim(cd.client_name));

-- 4) onepage_projects analog
UPDATE public.onepage_projects o
SET client_id_fk = c.id
FROM public.clients c
WHERE o.client_id_fk IS NULL
  AND o.name IS NOT NULL
  AND lower(trim(c.name)) = lower(trim(o.name));

-- ════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-link new close_deals zu clients (create if missing)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_link_close_deal_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.client_name IS NULL OR trim(NEW.client_name) = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_client_id FROM public.clients
  WHERE lower(trim(name)) = lower(trim(NEW.client_name))
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (name, kundenstatus)
    VALUES (trim(NEW.client_name), 'Lead'::kundenstatus)
    RETURNING id INTO v_client_id;
  END IF;

  NEW.client_id := v_client_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_close_deal_client ON public.close_deals;
CREATE TRIGGER trg_auto_link_close_deal_client
BEFORE INSERT OR UPDATE OF client_name ON public.close_deals
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_close_deal_to_client();

-- ════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-link new onepage_projects zu clients (create if missing)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_link_onepage_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF NEW.client_id_fk IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_client_id FROM public.clients
  WHERE lower(trim(name)) = lower(trim(NEW.name))
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (name, kundenstatus)
    VALUES (trim(NEW.name), 'Lead'::kundenstatus)
    RETURNING id INTO v_client_id;
  END IF;

  NEW.client_id_fk := v_client_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_onepage_client ON public.onepage_projects;
CREATE TRIGGER trg_auto_link_onepage_client
BEFORE INSERT OR UPDATE OF name ON public.onepage_projects
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_onepage_to_client();