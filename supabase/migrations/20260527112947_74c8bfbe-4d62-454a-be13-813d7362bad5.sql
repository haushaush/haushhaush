CREATE TABLE public.meta_campaign_snapshot (
  campaign_id text PRIMARY KEY,
  campaign_name text,
  account_id text NOT NULL,
  account_name text,
  status text NOT NULL,
  daily_budget bigint,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_snap_account ON public.meta_campaign_snapshot(account_id);
CREATE INDEX idx_meta_snap_status ON public.meta_campaign_snapshot(status);

GRANT ALL ON public.meta_campaign_snapshot TO service_role;

ALTER TABLE public.meta_campaign_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view snapshot"
ON public.meta_campaign_snapshot
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));