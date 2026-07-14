
-- Permissions
INSERT INTO public.app_permissions (permission_key,label,category,description,is_system) VALUES
  ('meta.billing.view','Meta Abrechnungen ansehen','Sales','Zugriff auf Meta Abrechnungen & Zahlungen',false),
  ('meta.billing.manage','Meta Abrechnungen verwalten','Sales','Sync und Verwaltung von Meta-Abrechnungen',false)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', pk FROM (VALUES ('meta.billing.view'),('meta.billing.manage')) AS v(pk)
ON CONFLICT DO NOTHING;

-- Snapshots table
CREATE TABLE IF NOT EXISTS public.meta_billing_account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id text NOT NULL UNIQUE,
  account_name text,
  currency text,
  account_status text,
  amount_spent numeric,
  balance numeric,
  spend_cap numeric,
  funding_source_details jsonb,
  business_name text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_billing_account_snapshots TO authenticated;
GRANT ALL ON public.meta_billing_account_snapshots TO service_role;

ALTER TABLE public.meta_billing_account_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_billing_snapshots_read"
ON public.meta_billing_account_snapshots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.user_has_permission(auth.uid(),'meta.billing.view'));

CREATE TRIGGER update_meta_billing_snapshots_updated_at
BEFORE UPDATE ON public.meta_billing_account_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
