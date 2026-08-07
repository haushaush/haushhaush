CREATE TABLE public.sales_status_changes (
  id text PRIMARY KEY,
  opportunity_id text,
  lead_id text,
  pipeline_id text,
  pipeline_name text,
  old_status_id text,
  old_status_label text,
  new_status_id text,
  new_status_label text,
  new_status_type text,
  user_id text,
  user_name text,
  date_changed timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_status_changes TO authenticated;
GRANT ALL ON public.sales_status_changes TO service_role;

ALTER TABLE public.sales_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sales status changes"
ON public.sales_status_changes FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_ssc_date_changed ON public.sales_status_changes (date_changed DESC);
CREATE INDEX idx_ssc_status_date ON public.sales_status_changes (new_status_label, date_changed DESC);
CREATE INDEX idx_ssc_user_date ON public.sales_status_changes (user_id, date_changed DESC);
CREATE INDEX idx_ssc_lead_id ON public.sales_status_changes (lead_id);

CREATE TABLE public.sales_lead_status_changes (
  id text PRIMARY KEY,
  lead_id text,
  old_status_id text,
  old_status_label text,
  new_status_id text,
  new_status_label text,
  new_status_type text,
  user_id text,
  user_name text,
  date_changed timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_lead_status_changes TO authenticated;
GRANT ALL ON public.sales_lead_status_changes TO service_role;

ALTER TABLE public.sales_lead_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sales lead status changes"
ON public.sales_lead_status_changes FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_slsc_date_changed ON public.sales_lead_status_changes (date_changed DESC);
CREATE INDEX idx_slsc_status_date ON public.sales_lead_status_changes (new_status_label, date_changed DESC);
CREATE INDEX idx_slsc_user_date ON public.sales_lead_status_changes (user_id, date_changed DESC);
CREATE INDEX idx_slsc_lead_id ON public.sales_lead_status_changes (lead_id);