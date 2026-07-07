
CREATE OR REPLACE FUNCTION public.get_client_qonto_finance_summary(client_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_has_link boolean;
BEGIN
  IF NOT public._finanzen_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.qonto_client_links WHERE client_id = client_uuid)
    INTO v_has_link;

  WITH links AS (
    SELECT qonto_client_id, qonto_client_name
    FROM public.qonto_client_links
    WHERE client_id = client_uuid
  ),
  inv AS (
    SELECT qci.*
    FROM public.qonto_client_invoices qci
    WHERE EXISTS (
      SELECT 1 FROM links l
      WHERE (l.qonto_client_id IS NOT NULL AND l.qonto_client_id <> '' AND l.qonto_client_id = qci.client_id)
         OR (
              (l.qonto_client_id IS NULL OR l.qonto_client_id = '')
              AND lower(regexp_replace(trim(l.qonto_client_name),'\s+',' ','g'))
                = lower(regexp_replace(trim(COALESCE(qci.client_name,'')),'\s+',' ','g'))
              AND qci.client_name IS NOT NULL AND qci.client_name <> ''
            )
    )
  )
  SELECT jsonb_build_object(
    'has_link', v_has_link,
    'open_invoice_amount',   COALESCE(SUM(total_amount) FILTER (WHERE status IN ('unpaid','overdue')), 0),
    'open_invoice_count',    COUNT(*) FILTER (WHERE status IN ('unpaid','overdue')),
    'overdue_invoice_amount',COALESCE(SUM(total_amount) FILTER (WHERE status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date < CURRENT_DATE), 0),
    'overdue_invoice_count', COUNT(*) FILTER (WHERE status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date < CURRENT_DATE),
    'paid_invoice_amount',   COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0),
    'paid_invoice_count',    COUNT(*) FILTER (WHERE status = 'paid'),
    'last_invoice_date',     MAX(issue_date)
  ) INTO v
  FROM inv;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_qonto_open_invoices(client_uuid uuid)
RETURNS TABLE(
  id uuid,
  number text,
  status text,
  total_amount numeric,
  currency text,
  issue_date date,
  due_date date,
  paid_at date,
  invoice_url text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._finanzen_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH links AS (
    SELECT qonto_client_id, qonto_client_name
    FROM public.qonto_client_links
    WHERE client_id = client_uuid
  )
  SELECT qci.id, qci.number, qci.status, qci.total_amount, qci.currency,
         qci.issue_date, qci.due_date, qci.paid_at, qci.invoice_url
  FROM public.qonto_client_invoices qci
  WHERE qci.status IN ('unpaid','overdue')
    AND EXISTS (
      SELECT 1 FROM links l
      WHERE (l.qonto_client_id IS NOT NULL AND l.qonto_client_id <> '' AND l.qonto_client_id = qci.client_id)
         OR (
              (l.qonto_client_id IS NULL OR l.qonto_client_id = '')
              AND lower(regexp_replace(trim(l.qonto_client_name),'\s+',' ','g'))
                = lower(regexp_replace(trim(COALESCE(qci.client_name,'')),'\s+',' ','g'))
              AND qci.client_name IS NOT NULL AND qci.client_name <> ''
            )
    )
  ORDER BY COALESCE(qci.due_date, qci.issue_date) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_qonto_finance_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_qonto_open_invoices(uuid) TO authenticated;
