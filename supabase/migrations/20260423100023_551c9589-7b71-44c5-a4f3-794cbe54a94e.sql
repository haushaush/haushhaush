-- Granulare Berechtigungs-Tabelle für Mitarbeiter-Zugriff
CREATE TABLE public.user_permissions (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_kunden BOOLEAN NOT NULL DEFAULT true,
  can_view_close BOOLEAN NOT NULL DEFAULT false,
  can_view_meta_ads BOOLEAN NOT NULL DEFAULT false,
  can_view_projekte BOOLEAN NOT NULL DEFAULT true,
  can_view_sales_kpis BOOLEAN NOT NULL DEFAULT false,
  can_view_fulfillment BOOLEAN NOT NULL DEFAULT false,
  can_view_finanzen BOOLEAN NOT NULL DEFAULT false,
  can_view_team_hr BOOLEAN NOT NULL DEFAULT false,
  can_manage_settings BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Nutzer kann eigene Berechtigungen lesen
CREATE POLICY "Users read own permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins können alle lesen
CREATE POLICY "Admins read all permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins können einfügen
CREATE POLICY "Admins insert permissions"
  ON public.user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins können aktualisieren
CREATE POLICY "Admins update permissions"
  ON public.user_permissions
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins können löschen
CREATE POLICY "Admins delete permissions"
  ON public.user_permissions
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger für updated_at
CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();