CREATE TABLE public.lexoffice_invoices (
  voucher_id text PRIMARY KEY,
  number text, status text, contact_id text, contact_name text,
  total_amount numeric, currency text, voucher_date date, due_date date, paid_date date,
  raw jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lexoffice_invoices TO authenticated;
GRANT ALL ON public.lexoffice_invoices TO service_role;
ALTER TABLE public.lexoffice_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY lxi_read ON public.lexoffice_invoices FOR SELECT TO authenticated USING (public._finanzen_can_read());
CREATE INDEX ON public.lexoffice_invoices (contact_id);

CREATE TABLE public.lexoffice_contacts (
  contact_id text PRIMARY KEY, name text, email text, raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lexoffice_contacts TO authenticated;
GRANT ALL ON public.lexoffice_contacts TO service_role;
ALTER TABLE public.lexoffice_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY lxc_read ON public.lexoffice_contacts FOR SELECT TO authenticated USING (public._finanzen_can_read());

CREATE TABLE public.lexoffice_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexoffice_contact_id text NOT NULL UNIQUE,
  lexoffice_contact_name text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  match_type text, confidence numeric, is_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lexoffice_client_links TO authenticated;
GRANT ALL ON public.lexoffice_client_links TO service_role;
ALTER TABLE public.lexoffice_client_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY lxl_read ON public.lexoffice_client_links FOR SELECT TO authenticated USING (public._finanzen_can_read());
CREATE POLICY lxl_write ON public.lexoffice_client_links FOR ALL TO authenticated USING (public._finanzen_can_read()) WITH CHECK (public._finanzen_can_read());

CREATE TABLE public.buchhaltung_quelle (
  marke text PRIMARY KEY,
  quelle text NOT NULL CHECK (quelle IN ('lexoffice','qonto')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buchhaltung_quelle TO authenticated;
GRANT ALL ON public.buchhaltung_quelle TO service_role;
ALTER TABLE public.buchhaltung_quelle ENABLE ROW LEVEL SECURITY;
CREATE POLICY bq_read ON public.buchhaltung_quelle FOR SELECT TO authenticated USING (true);
CREATE POLICY bq_write ON public.buchhaltung_quelle FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.buchhaltung_quelle (marke, quelle) VALUES
 ('Haush Haush','lexoffice'),('Leadsharks','lexoffice'),('AttentionX','lexoffice'),('Viral Connect','qonto');

-- Marke kommt aus Close (close_lead_spiegel via close_link); unbekannt/leer => ungeklärt (quelle NULL)
CREATE OR REPLACE FUNCTION public.client_buchhaltung_quelle(client_uuid uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('marke', s.marke, 'quelle', bq.quelle)
  FROM (SELECT 1) x
  LEFT JOIN public.close_link cl ON cl.client_id = client_uuid
  LEFT JOIN public.close_lead_spiegel s ON s.close_lead_id = cl.close_lead_id
  LEFT JOIN public.buchhaltung_quelle bq ON lower(trim(bq.marke)) = lower(trim(s.marke))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_client_finance_summary(client_uuid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q jsonb; src text; v jsonb;
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  q := public.client_buchhaltung_quelle(client_uuid);
  src := q->>'quelle';
  IF src IS NULL THEN
    RETURN jsonb_build_object('quelle', NULL, 'marke', q->>'marke', 'has_link', false);
  ELSIF src = 'qonto' THEN
    v := public.get_client_qonto_finance_summary(client_uuid);
  ELSE
    SELECT jsonb_build_object(
      'has_link', EXISTS(SELECT 1 FROM public.lexoffice_client_links WHERE client_id = client_uuid AND is_confirmed),
      'open_invoice_amount', COALESCE(SUM(i.total_amount) FILTER (WHERE i.status IN ('open','overdue')),0),
      'open_invoice_count', COUNT(*) FILTER (WHERE i.status IN ('open','overdue')),
      'overdue_invoice_amount', COALESCE(SUM(i.total_amount) FILTER (WHERE i.status IN ('open','overdue') AND i.due_date < CURRENT_DATE),0),
      'overdue_invoice_count', COUNT(*) FILTER (WHERE i.status IN ('open','overdue') AND i.due_date < CURRENT_DATE),
      'paid_invoice_amount', COALESCE(SUM(i.total_amount) FILTER (WHERE i.status IN ('paid','paidoff')),0),
      'paid_invoice_count', COUNT(*) FILTER (WHERE i.status IN ('paid','paidoff')),
      'last_invoice_date', MAX(i.voucher_date)
    ) INTO v
    FROM public.lexoffice_invoices i
    WHERE i.contact_id IN (SELECT lexoffice_contact_id FROM public.lexoffice_client_links WHERE client_id = client_uuid AND is_confirmed);
  END IF;
  RETURN v || jsonb_build_object('quelle', src, 'marke', q->>'marke');
END $$;

CREATE OR REPLACE FUNCTION public.get_client_open_invoices(client_uuid uuid)
RETURNS TABLE(id text, number text, status text, total_amount numeric, currency text, issue_date date, due_date date, paid_at date, invoice_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE src text;
BEGIN
  IF NOT public._finanzen_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  src := public.client_buchhaltung_quelle(client_uuid)->>'quelle';
  IF src = 'qonto' THEN
    RETURN QUERY SELECT o.id::text, o.number, o.status, o.total_amount, o.currency, o.issue_date, o.due_date, o.paid_at, o.invoice_url
      FROM public.get_client_qonto_open_invoices(client_uuid) o;
  ELSIF src = 'lexoffice' THEN
    RETURN QUERY SELECT i.voucher_id, i.number, i.status, i.total_amount, i.currency, i.voucher_date, i.due_date, i.paid_date,
      'https://app.lexoffice.de/permalink/invoices/view/' || i.voucher_id
      FROM public.lexoffice_invoices i
      WHERE i.status IN ('open','overdue')
        AND i.contact_id IN (SELECT lexoffice_contact_id FROM public.lexoffice_client_links WHERE client_id = client_uuid AND is_confirmed)
      ORDER BY COALESCE(i.due_date, i.voucher_date);
  END IF;
END $$;

-- Kunden mit ungeklärter Buchhaltungsquelle (keine/unbekannte Marke)
CREATE OR REPLACE FUNCTION public.buchhaltung_quelle_ungeklaert()
RETURNS TABLE(client_id uuid, client_name text, marke text, grund text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.name, s.marke,
    CASE WHEN cl.close_lead_id IS NULL THEN 'Kein Close-Lead verknüpft'
         WHEN s.marke IS NULL OR trim(s.marke) = '' THEN 'Keine Marke in Close'
         ELSE 'Unbekannte Marke' END
  FROM public.clients c
  LEFT JOIN public.close_link cl ON cl.client_id = c.id
  LEFT JOIN public.close_lead_spiegel s ON s.close_lead_id = cl.close_lead_id
  LEFT JOIN public.buchhaltung_quelle bq ON lower(trim(bq.marke)) = lower(trim(s.marke))
  WHERE public._finanzen_can_read() AND bq.quelle IS NULL
    AND c.kundenstatus IN ('In Betreuung','Pausiert','Onboarding')
  ORDER BY c.name;
$$;
