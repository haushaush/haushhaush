-- Backfill clients.meta_account_id from kunde_meta_accounts via close_deals
WITH first_match AS (
  SELECT DISTINCT ON (cd.client_id)
    cd.client_id,
    kma.meta_account_id
  FROM kunde_meta_accounts kma
  JOIN close_deals cd ON cd.id = kma.kunde_id
  WHERE cd.client_id IS NOT NULL
  ORDER BY cd.client_id, kma.matched_at ASC
)
UPDATE clients c
SET meta_account_id = fm.meta_account_id
FROM first_match fm
WHERE c.id = fm.client_id
  AND c.meta_account_id IS NULL;

-- Backfill meta_account_ids array
WITH all_matches AS (
  SELECT
    cd.client_id,
    array_agg(DISTINCT kma.meta_account_id) AS account_ids
  FROM kunde_meta_accounts kma
  JOIN close_deals cd ON cd.id = kma.kunde_id
  WHERE cd.client_id IS NOT NULL
  GROUP BY cd.client_id
)
UPDATE clients c
SET meta_account_ids = am.account_ids
FROM all_matches am
WHERE c.id = am.client_id
  AND (c.meta_account_ids IS NULL OR array_length(c.meta_account_ids, 1) IS NULL);

-- Trigger function: keep clients in sync with new kunde_meta_accounts entries
CREATE OR REPLACE FUNCTION public.sync_meta_account_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  SELECT client_id INTO v_client_id
  FROM close_deals
  WHERE id = NEW.kunde_id;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE clients
  SET meta_account_id = NEW.meta_account_id
  WHERE id = v_client_id
    AND meta_account_id IS NULL;

  UPDATE clients
  SET meta_account_ids = ARRAY(
    SELECT DISTINCT unnest(COALESCE(meta_account_ids, ARRAY[]::TEXT[]) || ARRAY[NEW.meta_account_id])
  )
  WHERE id = v_client_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_meta_account_to_client ON kunde_meta_accounts;
CREATE TRIGGER trg_sync_meta_account_to_client
  AFTER INSERT ON kunde_meta_accounts
  FOR EACH ROW
  EXECUTE FUNCTION sync_meta_account_to_client();