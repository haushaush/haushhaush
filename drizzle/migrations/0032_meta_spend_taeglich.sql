CREATE TABLE public.meta_spend_taeglich (
  meta_account_id text NOT NULL,
  campaign_id text,
  campaign_name text,
  adset_id text NOT NULL,
  adset_name text,
  datum date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (adset_id, datum)
);
CREATE INDEX meta_spend_taeglich_konto_datum ON public.meta_spend_taeglich (meta_account_id, datum);
CREATE INDEX meta_spend_taeglich_kampagne_datum ON public.meta_spend_taeglich (campaign_id, datum);
GRANT SELECT ON public.meta_spend_taeglich TO authenticated;
GRANT ALL ON public.meta_spend_taeglich TO service_role;
ALTER TABLE public.meta_spend_taeglich ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read meta_spend_taeglich" ON public.meta_spend_taeglich FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage meta_spend_taeglich" ON public.meta_spend_taeglich FOR ALL TO service_role USING (true) WITH CHECK (true);