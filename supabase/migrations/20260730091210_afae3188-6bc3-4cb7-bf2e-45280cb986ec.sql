CREATE TABLE public.meta_reporting_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id text NOT NULL UNIQUE,
  meta_account_name text,
  client_id uuid,
  client_name text,
  customer_email_source text,
  reporting_email text,
  reporting_email_overridden boolean NOT NULL DEFAULT false,
  reporting_enabled boolean NOT NULL DEFAULT true,
  slack_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_report_sent_at timestamptz,
  last_slack_sent_at timestamptz,
  last_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_reporting_settings TO authenticated;
GRANT ALL ON public.meta_reporting_settings TO service_role;

ALTER TABLE public.meta_reporting_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meta reporting settings"
ON public.meta_reporting_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert meta reporting settings"
ON public.meta_reporting_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update meta reporting settings"
ON public.meta_reporting_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete meta reporting settings"
ON public.meta_reporting_settings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_meta_reporting_settings_client ON public.meta_reporting_settings(client_id);

CREATE TRIGGER update_meta_reporting_settings_updated_at
BEFORE UPDATE ON public.meta_reporting_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();