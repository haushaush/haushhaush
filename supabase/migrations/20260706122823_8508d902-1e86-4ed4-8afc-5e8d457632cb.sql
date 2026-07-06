CREATE OR REPLACE FUNCTION public.get_qonto_invoice_metrics(
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_overdue boolean DEFAULT false,
  p_client text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_status text := NULLIF(p_status, 'all');
  v_client text := NULLIF(p_client, 'all');
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH filtered AS (
    SELECT *
    FROM public.qonto_client_invoices qci
    WHERE (p_start IS NULL OR qci.issue_date >= p_start)
      AND (p_end IS NULL OR qci.issue_date <= p_end)
      AND (v_status IS NULL OR qci.status = v_status)
      AND (NOT COALESCE(p_overdue, false) OR (qci.status = 'unpaid' AND qci.due_date IS NOT NULL AND qci.due_date < CURRENT_DATE))
      AND (v_client IS NULL OR COALESCE(qci.client_name, '') = v_client)
      AND (
        v_search IS NULL
        OR qci.number ILIKE '%' || v_search || '%'
        OR qci.client_name ILIKE '%' || v_search || '%'
      )
  )
  SELECT jsonb_build_object(
    'filtered_count', COUNT(*),
    'open_count', COUNT(*) FILTER (WHERE status = 'unpaid'),
    'overdue_count', COUNT(*) FILTER (WHERE status = 'unpaid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE),
    'paid_count', COUNT(*) FILTER (WHERE status = 'paid'),
    'total_amount', COALESCE(SUM(total_amount), 0),
    'open_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'unpaid'), 0),
    'overdue_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'unpaid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE), 0),
    'paid_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0),
    'cash_collected', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)
  ) INTO v
  FROM filtered;

  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_qonto_invoice_clients()
RETURNS TABLE(client_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT qci.client_name
  FROM public.qonto_client_invoices qci
  WHERE public._finanzen_can_read()
    AND qci.client_name IS NOT NULL
    AND trim(qci.client_name) <> ''
  ORDER BY qci.client_name;
$function$;

CREATE INDEX IF NOT EXISTS idx_qonto_client_invoices_issue_date ON public.qonto_client_invoices(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_qonto_client_invoices_status ON public.qonto_client_invoices(status);
CREATE INDEX IF NOT EXISTS idx_qonto_client_invoices_due_unpaid ON public.qonto_client_invoices(due_date) WHERE status = 'unpaid';
CREATE INDEX IF NOT EXISTS idx_qonto_client_invoices_client_name ON public.qonto_client_invoices(client_name);