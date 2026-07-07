
-- 1. Table
CREATE TABLE IF NOT EXISTS public.qonto_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qonto_client_name text NOT NULL,
  qonto_client_id text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  match_type text NOT NULL DEFAULT 'unlinked',
  confidence numeric,
  is_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qonto_client_links_name_uniq UNIQUE (qonto_client_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS qonto_client_links_qonto_id_uniq
  ON public.qonto_client_links (qonto_client_id) WHERE qonto_client_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qonto_client_links TO authenticated;
GRANT ALL ON public.qonto_client_links TO service_role;

ALTER TABLE public.qonto_client_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qcl_read ON public.qonto_client_links;
CREATE POLICY qcl_read ON public.qonto_client_links FOR SELECT TO authenticated
  USING (public._finanzen_can_read());

DROP POLICY IF EXISTS qcl_write ON public.qonto_client_links;
CREATE POLICY qcl_write ON public.qonto_client_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.manage'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.manage'));

CREATE TRIGGER trg_qcl_updated_at BEFORE UPDATE ON public.qonto_client_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Auto-link function: exact name match, ambiguous stays suggested/unlinked
CREATE OR REPLACE FUNCTION public.qonto_auto_link_clients()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_auto int := 0;
  v_suggested int := 0;
  v_unlinked int := 0;
  v_ambiguous int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.manage')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Insert missing Qonto client rows (never overwrite confirmed links)
  WITH q AS (
    SELECT DISTINCT
      trim(COALESCE(NULLIF(client_name,''), raw->'client'->>'name')) AS qname,
      NULLIF(COALESCE(client_id, raw->'client'->>'id'),'') AS qid
    FROM public.qonto_client_invoices
    WHERE COALESCE(NULLIF(client_name,''), raw->'client'->>'name') IS NOT NULL
  )
  INSERT INTO public.qonto_client_links (qonto_client_name, qonto_client_id, match_type)
  SELECT qname, qid, 'unlinked'
  FROM q
  WHERE qname IS NOT NULL AND qname <> ''
  ON CONFLICT (qonto_client_name) DO UPDATE
    SET qonto_client_id = COALESCE(public.qonto_client_links.qonto_client_id, EXCLUDED.qonto_client_id);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Re-evaluate unconfirmed rows
  WITH candidates AS (
    SELECT l.id,
           l.qonto_client_name,
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
    is_confirmed = CASE WHEN c.exact_cnt = 1 THEN true ELSE false END,
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
    'auto_exact', v_auto,
    'suggested', v_suggested,
    'unlinked', v_unlinked,
    'ambiguous', v_ambiguous
  );
END; $$;

-- 3. Stats
CREATE OR REPLACE FUNCTION public.qonto_client_link_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'auto_linked', COUNT(*) FILTER (WHERE match_type='auto_exact' AND client_id IS NOT NULL),
    'manual_linked', COUNT(*) FILTER (WHERE match_type='manual' AND client_id IS NOT NULL),
    'confirmed', COUNT(*) FILTER (WHERE is_confirmed=true AND client_id IS NOT NULL),
    'suggested', COUNT(*) FILTER (WHERE match_type='suggested'),
    'ambiguous', COUNT(*) FILTER (WHERE match_type='ambiguous'),
    'unlinked', COUNT(*) FILTER (WHERE client_id IS NULL)
  ) INTO v FROM public.qonto_client_links;
  RETURN v;
END; $$;

-- 4. Rows for the table
CREATE OR REPLACE FUNCTION public.qonto_client_link_rows()
RETURNS TABLE(
  id uuid,
  qonto_client_name text,
  qonto_client_id text,
  client_id uuid,
  client_name text,
  match_type text,
  confidence numeric,
  is_confirmed boolean,
  invoice_count bigint,
  total_amount numeric,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.qonto_client_name, l.qonto_client_id, l.client_id,
    c.name AS client_name, l.match_type, l.confidence, l.is_confirmed,
    COALESCE(s.cnt, 0), COALESCE(s.sum_amt, 0), l.updated_at
  FROM public.qonto_client_links l
  LEFT JOIN public.clients c ON c.id = l.client_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(total_amount),0) AS sum_amt
    FROM public.qonto_client_invoices qi
    WHERE lower(trim(COALESCE(NULLIF(qi.client_name,''), qi.raw->'client'->>'name')))
        = lower(trim(l.qonto_client_name))
  ) s ON true
  WHERE public._finanzen_can_read()
  ORDER BY l.qonto_client_name;
$$;

-- 5. Suggestions for a single Qonto client (used for the "Verknüpfen" dialog too)
CREATE OR REPLACE FUNCTION public.qonto_client_link_suggestions(p_link_id uuid, p_limit int DEFAULT 8)
RETURNS TABLE(client_id uuid, client_name text, similarity numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT qonto_client_name INTO v_name FROM public.qonto_client_links WHERE id = p_link_id;
  IF v_name IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.name,
      CASE
        WHEN lower(trim(c.name)) = lower(trim(v_name)) THEN 1.0
        WHEN lower(regexp_replace(trim(c.name),'\s+',' ','g'))
           = lower(regexp_replace(trim(v_name),'\s+',' ','g')) THEN 0.9
        WHEN lower(c.name) LIKE '%' || lower(v_name) || '%'
          OR lower(v_name) LIKE '%' || lower(c.name) || '%' THEN 0.6
        ELSE 0.3
      END AS sim
    FROM public.clients c
    WHERE c.name IS NOT NULL
      AND (
        lower(c.name) LIKE '%' || lower(v_name) || '%'
        OR lower(v_name) LIKE '%' || lower(c.name) || '%'
        OR lower(regexp_replace(trim(c.name),'\s+',' ','g'))
         = lower(regexp_replace(trim(v_name),'\s+',' ','g'))
      )
    ORDER BY sim DESC, c.name
    LIMIT p_limit;
END; $$;
