
-- Rebuild the qonto_client_id unique index as partial (ignore empty strings too)
DROP INDEX IF EXISTS public.qonto_client_links_qonto_id_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS qonto_client_links_qonto_id_uniq
  ON public.qonto_client_links (qonto_client_id)
  WHERE qonto_client_id IS NOT NULL AND qonto_client_id <> '';

-- Safety: also unique on normalized name (case-insensitive), for the name-based upsert path
CREATE UNIQUE INDEX IF NOT EXISTS qonto_client_links_name_norm_uniq
  ON public.qonto_client_links (lower(trim(qonto_client_name)))
  WHERE qonto_client_name IS NOT NULL AND trim(qonto_client_name) <> '';

-- Rewrite auto-link function: dedupe per-name, tolerate errors, never overwrite confirmed links
CREATE OR REPLACE FUNCTION public.qonto_auto_link_clients()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_errors int := 0;
  v_auto int := 0;
  v_suggested int := 0;
  v_unlinked int := 0;
  v_ambiguous int := 0;
  r record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.manage')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Collect unique Qonto customers, one row per normalized name.
  -- Pick the first non-empty qonto_client_id we see for that name.
  FOR r IN
    WITH raw_customers AS (
      SELECT
        trim(COALESCE(NULLIF(qi.client_name,''), qi.raw->'client'->>'name')) AS qname,
        NULLIF(trim(COALESCE(qi.client_id, qi.raw->'client'->>'id')), '') AS qid
      FROM public.qonto_client_invoices qi
    ),
    valid AS (
      SELECT qname, qid
      FROM raw_customers
      WHERE qname IS NOT NULL AND qname <> ''
    ),
    picked AS (
      -- one row per name, one non-empty qid at most (arbitrary but stable)
      SELECT qname, MIN(qid) AS qid
      FROM valid
      GROUP BY qname
    )
    SELECT p.qname, p.qid
    FROM picked p
    -- If the same qid maps to multiple different names, keep the alphabetically first name only,
    -- so the partial unique index on qid never collides.
    WHERE p.qid IS NULL
       OR p.qname = (
         SELECT MIN(p2.qname) FROM picked p2 WHERE p2.qid = p.qid
       )
  LOOP
    BEGIN
      INSERT INTO public.qonto_client_links (qonto_client_name, qonto_client_id, match_type)
      VALUES (r.qname, r.qid, 'unlinked')
      ON CONFLICT (qonto_client_name) DO UPDATE
        SET qonto_client_id = COALESCE(public.qonto_client_links.qonto_client_id, EXCLUDED.qonto_client_id);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      -- qonto_client_id conflict — retry without the id to at least register the name
      BEGIN
        INSERT INTO public.qonto_client_links (qonto_client_name, qonto_client_id, match_type)
        VALUES (r.qname, NULL, 'unlinked')
        ON CONFLICT (qonto_client_name) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors + 1;
      END;
    WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- Re-evaluate unconfirmed rows against public.clients
  WITH candidates AS (
    SELECT l.id,
           (SELECT COUNT(*) FROM public.clients c
             WHERE lower(trim(c.name)) = lower(trim(l.qonto_client_name))) AS exact_cnt,
           (SELECT c.id FROM public.clients c
             WHERE lower(trim(c.name)) = lower(trim(l.qonto_client_name))
             ORDER BY c.created_at ASC LIMIT 1) AS exact_id,
           (SELECT COUNT(*) FROM public.clients c
             WHERE lower(regexp_replace(trim(c.name), '\s+', ' ', 'g'))
                 = lower(regexp_replace(trim(l.qonto_client_name), '\s+', ' ', 'g'))) AS norm_cnt,
           (SELECT c.id FROM public.clients c
             WHERE lower(regexp_replace(trim(c.name), '\s+', ' ', 'g'))
                 = lower(regexp_replace(trim(l.qonto_client_name), '\s+', ' ', 'g'))
             ORDER BY c.created_at ASC LIMIT 1) AS norm_id
    FROM public.qonto_client_links l
    WHERE l.is_confirmed = false
  )
  UPDATE public.qonto_client_links l
  SET
    client_id = CASE
      WHEN c.exact_cnt = 1 THEN c.exact_id
      WHEN c.exact_cnt = 0 AND c.norm_cnt = 1 THEN c.norm_id
      ELSE NULL
    END,
    match_type = CASE
      WHEN c.exact_cnt = 1 THEN 'auto_exact'
      WHEN c.exact_cnt = 0 AND c.norm_cnt = 1 THEN 'suggested'
      WHEN c.exact_cnt > 1 OR c.norm_cnt > 1 THEN 'ambiguous'
      ELSE 'unlinked'
    END,
    confidence = CASE
      WHEN c.exact_cnt = 1 THEN 1
      WHEN c.exact_cnt = 0 AND c.norm_cnt = 1 THEN 0.8
      ELSE NULL
    END,
    is_confirmed = CASE WHEN c.exact_cnt = 1 THEN true ELSE l.is_confirmed END,
    updated_at = now()
  FROM candidates c
  WHERE c.id = l.id;

  SELECT
    COUNT(*) FILTER (WHERE match_type='auto_exact'),
    COUNT(*) FILTER (WHERE match_type='suggested'),
    COUNT(*) FILTER (WHERE match_type='unlinked'),
    COUNT(*) FILTER (WHERE match_type='ambiguous')
  INTO v_auto, v_suggested, v_unlinked, v_ambiguous
  FROM public.qonto_client_links;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'errors', v_errors,
    'auto_exact', v_auto,
    'suggested', v_suggested,
    'unlinked', v_unlinked,
    'ambiguous', v_ambiguous
  );
END; $$;
