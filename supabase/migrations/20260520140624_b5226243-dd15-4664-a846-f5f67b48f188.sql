-- Deduplicate unternehmen entries by normalized display_name (strip trailing legal suffix).
-- Keep canonical = row with highest usage_count (tiebreak: oldest by id), merge usage_count,
-- migrate all FK references from dupes to canonical, then delete dupes.

CREATE TEMP TABLE _unt_norm AS
SELECT id, display_name, usage_count,
  lower(trim(regexp_replace(display_name, '\s+(AG|GmbH|SE|KG|OHG|mbH|GbR|UG)\.?$', '', 'i'))) AS norm
FROM public.unternehmen;

CREATE TEMP TABLE _unt_canonical AS
SELECT DISTINCT ON (norm) norm, id AS canonical_id
FROM _unt_norm
ORDER BY norm, usage_count DESC, id;

CREATE TEMP TABLE _unt_map AS
SELECT n.id AS dup_id, c.canonical_id
FROM _unt_norm n
JOIN _unt_canonical c ON c.norm = n.norm
WHERE n.id <> c.canonical_id;

-- Migrate FK references
UPDATE public.clients t SET unternehmen_id = m.canonical_id
  FROM _unt_map m WHERE t.unternehmen_id = m.dup_id;
UPDATE public.close_deals t SET unternehmen_id = m.canonical_id
  FROM _unt_map m WHERE t.unternehmen_id = m.dup_id;
UPDATE public.onepage_projects t SET unternehmen_id = m.canonical_id
  FROM _unt_map m WHERE t.unternehmen_id = m.dup_id;
UPDATE public.referenz_meta_ads t SET linked_unternehmen_id = m.canonical_id
  FROM _unt_map m WHERE t.linked_unternehmen_id = m.dup_id;
UPDATE public.referenz_meta_campaigns t SET linked_unternehmen_id = m.canonical_id
  FROM _unt_map m WHERE t.linked_unternehmen_id = m.dup_id;
UPDATE public.referenz_showcase t SET linked_unternehmen_id = m.canonical_id
  FROM _unt_map m WHERE t.linked_unternehmen_id = m.dup_id;

-- Sum usage_count into canonical
UPDATE public.unternehmen u
SET usage_count = u.usage_count + sub.extra
FROM (
  SELECT m.canonical_id, COALESCE(SUM(d.usage_count), 0) AS extra
  FROM _unt_map m JOIN public.unternehmen d ON d.id = m.dup_id
  GROUP BY m.canonical_id
) sub
WHERE u.id = sub.canonical_id;

-- Delete duplicate rows
DELETE FROM public.unternehmen WHERE id IN (SELECT dup_id FROM _unt_map);

-- Normalize the canonical row's `name` column to the lowercase normalized form so
-- the create_or_get_unternehmen UPSERT (which uses ON CONFLICT (name)) hits these rows
-- in the future instead of creating new duplicates.
UPDATE public.unternehmen u
SET name = lower(trim(regexp_replace(u.display_name, '\s+(AG|GmbH|SE|KG|OHG|mbH|GbR|UG)\.?$', '', 'i')))
WHERE u.name <> lower(trim(regexp_replace(u.display_name, '\s+(AG|GmbH|SE|KG|OHG|mbH|GbR|UG)\.?$', '', 'i')));