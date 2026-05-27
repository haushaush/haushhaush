
CREATE TABLE public.slack_item_meta_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_item_id text NOT NULL UNIQUE,
  slack_list_id text NOT NULL,
  meta_account_id text NOT NULL,
  meta_account_name text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto','manual')),
  matched_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_item_meta_item ON public.slack_item_meta_account(slack_item_id);
CREATE INDEX idx_slack_item_meta_account ON public.slack_item_meta_account(meta_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_item_meta_account TO authenticated;
GRANT ALL ON public.slack_item_meta_account TO service_role;

ALTER TABLE public.slack_item_meta_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read slack_item_meta_account" ON public.slack_item_meta_account FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert slack_item_meta_account" ON public.slack_item_meta_account FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update slack_item_meta_account" ON public.slack_item_meta_account FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete slack_item_meta_account" ON public.slack_item_meta_account FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_slack_item_meta_account_updated
  BEFORE UPDATE ON public.slack_item_meta_account
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meta_accounts_cache (
  meta_account_id text PRIMARY KEY,
  name text,
  business_name text,
  currency text,
  status text,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_accounts_cache TO authenticated;
GRANT ALL ON public.meta_accounts_cache TO service_role;

ALTER TABLE public.meta_accounts_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read meta_accounts_cache" ON public.meta_accounts_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write meta_accounts_cache" ON public.meta_accounts_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update meta_accounts_cache" ON public.meta_accounts_cache FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete meta_accounts_cache" ON public.meta_accounts_cache FOR DELETE TO authenticated USING (true);
