
-- Helper: guard
CREATE OR REPLACE FUNCTION public._finanzen_can_read()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'finanzen.view');
$$;

-- 1. Dashboard aggregate for a range
CREATE OR REPLACE FUNCTION public.get_qonto_finance_dashboard(p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev_start date;
  v_prev_end date;
  v_days int;
  v_result jsonb;
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_days := GREATEST(1, (p_end - p_start) + 1);
  v_prev_end := p_start - 1;
  v_prev_start := v_prev_end - v_days + 1;

  WITH
  tx AS (
    SELECT amount, side, settled_at, emitted_at, label, category, cashflow_category_name, operation_type
    FROM public.qonto_transactions_new
    WHERE status = 'completed'
  ),
  tx_period AS (
    SELECT * FROM tx
    WHERE COALESCE(settled_at, emitted_at)::date BETWEEN p_start AND p_end
  ),
  tx_prev AS (
    SELECT * FROM tx
    WHERE COALESCE(settled_at, emitted_at)::date BETWEEN v_prev_start AND v_prev_end
  ),
  inv AS (
    SELECT id, status, total_amount, issue_date, due_date, paid_at, client_name
    FROM public.qonto_client_invoices
  ),
  bank AS (
    SELECT
      COALESCE(SUM(CASE WHEN side='credit' THEN ABS(amount) ELSE 0 END),0) AS inflow,
      COALESCE(SUM(CASE WHEN side='debit' THEN ABS(amount) ELSE 0 END),0) AS outflow,
      COUNT(*) FILTER (WHERE side='credit') AS n_in,
      COUNT(*) FILTER (WHERE side='debit') AS n_out,
      COALESCE(MAX(CASE WHEN side='credit' THEN ABS(amount) END),0) AS max_in,
      COALESCE(MAX(CASE WHEN side='debit' THEN ABS(amount) END),0) AS max_out
    FROM tx_period
  ),
  bank_prev AS (
    SELECT
      COALESCE(SUM(CASE WHEN side='credit' THEN ABS(amount) ELSE 0 END),0) AS inflow,
      COALESCE(SUM(CASE WHEN side='debit' THEN ABS(amount) ELSE 0 END),0) AS outflow
    FROM tx_prev
  ),
  invoices_period AS (
    SELECT
      COALESCE(SUM(CASE WHEN status='paid' THEN total_amount ELSE 0 END),0) AS paid_sum,
      COUNT(*) FILTER (WHERE status='paid') AS paid_n,
      COUNT(*) FILTER (WHERE status IN ('unpaid','draft','paid','canceled') AND issue_date BETWEEN p_start AND p_end) AS issued_n,
      COALESCE(SUM(CASE WHEN issue_date BETWEEN p_start AND p_end THEN total_amount ELSE 0 END),0) AS issued_sum,
      AVG(CASE WHEN status='paid' AND paid_at IS NOT NULL AND issue_date IS NOT NULL
               THEN (paid_at - issue_date) END) AS avg_days_to_pay
    FROM inv
    WHERE (status='paid' AND COALESCE(paid_at, issue_date) BETWEEN p_start AND p_end)
       OR (issue_date BETWEEN p_start AND p_end)
  ),
  invoices_prev AS (
    SELECT COALESCE(SUM(CASE WHEN status='paid' THEN total_amount ELSE 0 END),0) AS paid_sum
    FROM inv
    WHERE status='paid' AND COALESCE(paid_at, issue_date) BETWEEN v_prev_start AND v_prev_end
  ),
  receivables AS (
    SELECT
      COALESCE(SUM(total_amount),0) AS open_sum,
      COUNT(*) AS open_n,
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount ELSE 0 END),0) AS overdue_sum,
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_n,
      COALESCE(MAX(total_amount),0) AS largest_open,
      MIN(issue_date) AS oldest_open_issue
    FROM inv WHERE status='unpaid'
  ),
  accounts AS (
    SELECT
      COALESCE(SUM(balance),0) AS total_balance,
      COUNT(*) AS n_accounts,
      COALESCE((SELECT balance FROM public.qonto_bank_accounts WHERE is_main LIMIT 1),0) AS main_balance
    FROM public.qonto_bank_accounts
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end, 'days', v_days),
    'previous_period', jsonb_build_object('start', v_prev_start, 'end', v_prev_end),
    'accounts', (SELECT to_jsonb(accounts) FROM accounts),
    'cashflow', jsonb_build_object(
      'inflow', (SELECT inflow FROM bank),
      'outflow', (SELECT outflow FROM bank),
      'net', (SELECT inflow - outflow FROM bank),
      'inflow_count', (SELECT n_in FROM bank),
      'outflow_count', (SELECT n_out FROM bank),
      'avg_inflow', (SELECT CASE WHEN n_in>0 THEN inflow/n_in ELSE 0 END FROM bank),
      'avg_outflow', (SELECT CASE WHEN n_out>0 THEN outflow/n_out ELSE 0 END FROM bank),
      'max_inflow', (SELECT max_in FROM bank),
      'max_outflow', (SELECT max_out FROM bank),
      'prev_inflow', (SELECT inflow FROM bank_prev),
      'prev_outflow', (SELECT outflow FROM bank_prev),
      'prev_net', (SELECT inflow - outflow FROM bank_prev)
    ),
    'invoices', jsonb_build_object(
      'paid_sum', (SELECT paid_sum FROM invoices_period),
      'paid_count', (SELECT paid_n FROM invoices_period),
      'issued_sum', (SELECT issued_sum FROM invoices_period),
      'issued_count', (SELECT issued_n FROM invoices_period),
      'avg_days_to_pay', (SELECT avg_days_to_pay FROM invoices_period),
      'prev_paid_sum', (SELECT paid_sum FROM invoices_prev)
    ),
    'receivables', (SELECT to_jsonb(receivables) FROM receivables),
    'result', jsonb_build_object(
      'net', (SELECT inflow - outflow FROM bank),
      'margin', (SELECT CASE WHEN inflow>0 THEN (inflow - outflow)/inflow ELSE NULL END FROM bank)
    )
  ) INTO v_result;
  RETURN v_result;
END; $$;

-- 2. Monthly finance time series
CREATE OR REPLACE FUNCTION public.get_qonto_monthly_finance(p_months int DEFAULT 12)
RETURNS TABLE(month text, bank_in numeric, bank_out numeric, net numeric, invoices_paid numeric, result_positive boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH months AS (
    SELECT to_char(date_trunc('month', CURRENT_DATE) - (i || ' months')::interval, 'YYYY-MM') AS m
    FROM generate_series(0, GREATEST(1,p_months)-1) i
  ),
  tx_month AS (
    SELECT to_char(COALESCE(settled_at, emitted_at), 'YYYY-MM') AS m,
           SUM(CASE WHEN side='credit' THEN ABS(amount) ELSE 0 END) AS bin,
           SUM(CASE WHEN side='debit' THEN ABS(amount) ELSE 0 END) AS bout
    FROM public.qonto_transactions_new
    WHERE status='completed' AND COALESCE(settled_at, emitted_at) IS NOT NULL
    GROUP BY 1
  ),
  inv_month AS (
    SELECT to_char(COALESCE(paid_at, issue_date), 'YYYY-MM') AS m,
           SUM(total_amount) AS paid
    FROM public.qonto_client_invoices
    WHERE status='paid' AND COALESCE(paid_at, issue_date) IS NOT NULL
    GROUP BY 1
  )
  SELECT m,
         COALESCE(tx_month.bin,0),
         COALESCE(tx_month.bout,0),
         COALESCE(tx_month.bin,0) - COALESCE(tx_month.bout,0),
         COALESCE(inv_month.paid,0),
         (COALESCE(tx_month.bin,0) - COALESCE(tx_month.bout,0)) >= 0
  FROM months
  LEFT JOIN tx_month USING(m)
  LEFT JOIN inv_month USING(m)
  ORDER BY m;
END; $$;

-- 3. Receivables aging buckets
CREATE OR REPLACE FUNCTION public.get_qonto_receivables_aging()
RETURNS TABLE(bucket text, count bigint, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH buckets AS (
    SELECT
      CASE
        WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN '0-7'
        WHEN (CURRENT_DATE - due_date) <= 7 THEN '0-7'
        WHEN (CURRENT_DATE - due_date) <= 14 THEN '8-14'
        WHEN (CURRENT_DATE - due_date) <= 30 THEN '15-30'
        WHEN (CURRENT_DATE - due_date) <= 60 THEN '31-60'
        ELSE '60+'
      END AS bkt,
      total_amount
    FROM public.qonto_client_invoices
    WHERE status='unpaid'
  ),
  agg AS (
    SELECT bkt, COUNT(*) AS c, COALESCE(SUM(total_amount),0) AS t FROM buckets GROUP BY bkt
  ),
  ordered AS (
    SELECT * FROM (VALUES ('0-7'),('8-14'),('15-30'),('31-60'),('60+')) AS b(bkt)
  )
  SELECT o.bkt, COALESCE(agg.c,0), COALESCE(agg.t,0)
  FROM ordered o LEFT JOIN agg USING(bkt)
  ORDER BY CASE o.bkt WHEN '0-7' THEN 1 WHEN '8-14' THEN 2 WHEN '15-30' THEN 3 WHEN '31-60' THEN 4 ELSE 5 END;
END; $$;

-- 4. Top customers by paid revenue in range
CREATE OR REPLACE FUNCTION public.get_qonto_top_customers(p_start date, p_end date, p_limit int DEFAULT 10)
RETURNS TABLE(client_name text, invoice_count bigint, total_paid numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT COALESCE(NULLIF(qci.client_name,''),'– unbekannt') AS cn,
         COUNT(*)::bigint,
         COALESCE(SUM(qci.total_amount),0)
  FROM public.qonto_client_invoices qci
  WHERE qci.status='paid' AND COALESCE(qci.paid_at, qci.issue_date) BETWEEN p_start AND p_end
  GROUP BY cn
  ORDER BY 3 DESC
  LIMIT p_limit;
END; $$;

-- 5. Top expenses by counterparty
CREATE OR REPLACE FUNCTION public.get_qonto_top_expenses(p_start date, p_end date, p_limit int DEFAULT 10)
RETURNS TABLE(label text, count bigint, total numeric, category text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT COALESCE(NULLIF(qtn.label,''),'– ohne Label') AS lbl,
         COUNT(*)::bigint,
         COALESCE(SUM(ABS(qtn.amount)),0),
         COALESCE(MAX(qtn.cashflow_category_name), MAX(qtn.category), '– keine Kategorie')
  FROM public.qonto_transactions_new qtn
  WHERE qtn.status='completed' AND qtn.side='debit'
    AND COALESCE(qtn.settled_at, qtn.emitted_at)::date BETWEEN p_start AND p_end
  GROUP BY lbl
  ORDER BY 3 DESC
  LIMIT p_limit;
END; $$;

-- 6. Data quality checks
CREATE OR REPLACE FUNCTION public.get_qonto_data_quality()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'accounts_count', (SELECT COUNT(*) FROM public.qonto_bank_accounts),
    'invoices_count', (SELECT COUNT(*) FROM public.qonto_client_invoices),
    'transactions_count', (SELECT COUNT(*) FROM public.qonto_transactions_new),
    'invoices_no_client', (SELECT COUNT(*) FROM public.qonto_client_invoices WHERE client_name IS NULL OR client_name=''),
    'invoices_no_due_date', (SELECT COUNT(*) FROM public.qonto_client_invoices WHERE status='unpaid' AND due_date IS NULL),
    'paid_no_paid_at', (SELECT COUNT(*) FROM public.qonto_client_invoices WHERE status='paid' AND paid_at IS NULL),
    'tx_no_category', (SELECT COUNT(*) FROM public.qonto_transactions_new WHERE cashflow_category_name IS NULL AND category IS NULL),
    'tx_no_label', (SELECT COUNT(*) FROM public.qonto_transactions_new WHERE label IS NULL OR label=''),
    'possible_duplicate_tx', (SELECT COUNT(*) FROM (
        SELECT amount, side, COALESCE(settled_at, emitted_at) AS d, label, COUNT(*) c
        FROM public.qonto_transactions_new
        GROUP BY 1,2,3,4 HAVING COUNT(*)>1
      ) x),
    'sync_status', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.qonto_sync_status s),'[]'::jsonb)
  ) INTO v;
  RETURN v;
END; $$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_qonto_finance_dashboard(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qonto_monthly_finance(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qonto_receivables_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qonto_top_customers(date,date,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qonto_top_expenses(date,date,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qonto_data_quality() TO authenticated;
