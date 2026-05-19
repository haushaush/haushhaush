
-- unternehmen: normalize
UPDATE public.unternehmen
SET name = REGEXP_REPLACE(TRIM(name), '\s+', ' ', 'g'),
    display_name = REGEXP_REPLACE(TRIM(COALESCE(display_name, name)), '\s+', ' ', 'g');

-- unternehmen: repoint clients to oldest row
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY LOWER(name) ORDER BY created_at ASC, id ASC) AS keep_id
  FROM public.unternehmen
)
UPDATE public.clients c
SET unternehmen_id = r.keep_id
FROM ranked r
WHERE c.unternehmen_id = r.id AND r.rn > 1;

-- unternehmen: delete dupes
DELETE FROM public.unternehmen WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at ASC, id ASC) AS rn
    FROM public.unternehmen
  ) sub WHERE rn > 1
);

ALTER TABLE public.unternehmen DROP CONSTRAINT IF EXISTS unternehmen_name_key;
DROP INDEX IF EXISTS public.unternehmen_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS unternehmen_name_lower_unique ON public.unternehmen (LOWER(name));

-- branchen: normalize + dedupe (no client repoint, clients.branche_id is canonical text)
UPDATE public.branchen
SET name = REGEXP_REPLACE(TRIM(name), '\s+', ' ', 'g'),
    display_name = REGEXP_REPLACE(TRIM(COALESCE(display_name, name)), '\s+', ' ', 'g');

DELETE FROM public.branchen WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at ASC, id ASC) AS rn
    FROM public.branchen
  ) sub WHERE rn > 1
);

ALTER TABLE public.branchen DROP CONSTRAINT IF EXISTS branchen_name_key;
DROP INDEX IF EXISTS public.branchen_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS branchen_name_lower_unique ON public.branchen (LOWER(name));
