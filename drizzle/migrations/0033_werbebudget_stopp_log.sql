CREATE TABLE public.werbebudget_stopp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  kunde_name text,
  geprueft_am timestamptz NOT NULL DEFAULT now(),
  monatsbudget numeric,
  verbrauch numeric,
  objekte jsonb NOT NULL DEFAULT '[]'::jsonb,
  ausgefuehrt boolean NOT NULL DEFAULT false,
  grund text,
  fehler text
);
CREATE INDEX werbebudget_stopp_log_client_idx ON public.werbebudget_stopp_log (client_id, geprueft_am DESC);
GRANT SELECT ON public.werbebudget_stopp_log TO authenticated;
GRANT ALL ON public.werbebudget_stopp_log TO service_role;
ALTER TABLE public.werbebudget_stopp_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lesen Stopp-Protokoll" ON public.werbebudget_stopp_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));