
-- 1) Rename legacy table to preserve data
ALTER TABLE IF EXISTS public.user_permissions RENAME TO user_permissions_legacy;

-- 2) app_permissions catalog
CREATE TABLE IF NOT EXISTS public.app_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  category text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_permissions TO authenticated;
GRANT ALL ON public.app_permissions TO service_role;
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_permissions readable by authenticated"
  ON public.app_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_permissions admin manage"
  ON public.app_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3) role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission_key text NOT NULL REFERENCES public.app_permissions(permission_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions readable by authenticated"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions admin manage"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) user_permissions (new, generic)
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.app_permissions(permission_key) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_permissions self read"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_permissions admin manage"
  ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) user_access_status
CREATE TABLE public.user_access_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_access_status TO authenticated;
GRANT ALL ON public.user_access_status TO service_role;
ALTER TABLE public.user_access_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_access_status self or admin read"
  ON public.user_access_status FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_access_status admin manage"
  ON public.user_access_status FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_user_access_status_updated_at
  BEFORE UPDATE ON public.user_access_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- prevent admin self-deactivation
CREATE OR REPLACE FUNCTION public.prevent_admin_self_deactivation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = false
     AND NEW.user_id = auth.uid()
     AND public.has_role(NEW.user_id,'admin') THEN
    RAISE EXCEPTION 'Admins können sich nicht selbst deaktivieren';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_user_access_status_no_self_deact
  BEFORE INSERT OR UPDATE ON public.user_access_status
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_self_deactivation();

-- 6) Seed catalog
INSERT INTO public.app_permissions (permission_key,label,category,description,is_system) VALUES
  ('dashboard.view','Dashboard ansehen','Dashboard','Zugriff auf die Übersichtsseite',true),
  ('sales.view','Sales Bereich','Sales','Allgemeiner Sales-Zugriff',true),
  ('sales.kpis.view','Sales KPIs & Leaderboard','Sales',NULL,false),
  ('sales.close.view','Close Bereich','Sales',NULL,false),
  ('sales.meta.view','Meta Ads (Sales)','Sales',NULL,false),
  ('sales.referenzen.view','Referenzen','Sales',NULL,false),
  ('clients.view','Kunden ansehen','Kunden',NULL,true),
  ('clients.edit','Kunden bearbeiten','Kunden',NULL,false),
  ('clients.laufzeiten.view','Kunden-Laufzeiten','Kunden',NULL,false),
  ('projects.view','Projekte ansehen','Projekte',NULL,true),
  ('projects.edit','Projekte bearbeiten','Projekte',NULL,false),
  ('tasks.view','Aufgaben ansehen','Projekte',NULL,true),
  ('finanzen.view','Finanzen','Finanzen',NULL,false),
  ('team.view','Team & HR','Team',NULL,false),
  ('team.edit','Team & HR bearbeiten','Team',NULL,false),
  ('team.permissions.manage','Team-Berechtigungen verwalten','Team',NULL,false),
  ('time_tracking.view','Eigene Zeiterfassung','Team',NULL,true),
  ('time_tracking.admin.view','Time Tracking Admin-Konsole','Team',NULL,false),
  ('integrationen.view','Integrationen','Tools',NULL,false),
  ('slack.view','Slack','Tools',NULL,false),
  ('settings.view','Einstellungen','System',NULL,true),
  ('drive.view','Google Drive','Drive',NULL,true),
  ('drive.manage_permissions','Drive-Freigaben verwalten','Drive',NULL,false),
  ('admin.users.manage','Benutzer verwalten','Admin',NULL,false),
  ('admin.permissions.manage','Berechtigungen verwalten','Admin',NULL,false)
ON CONFLICT (permission_key) DO NOTHING;

-- admin: all
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', permission_key FROM public.app_permissions
ON CONFLICT DO NOTHING;

-- mitarbeiter: basic
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('mitarbeiter','dashboard.view'),
  ('mitarbeiter','clients.view'),
  ('mitarbeiter','projects.view'),
  ('mitarbeiter','tasks.view'),
  ('mitarbeiter','drive.view'),
  ('mitarbeiter','settings.view'),
  ('mitarbeiter','time_tracking.view')
ON CONFLICT DO NOTHING;

-- 7) Permission resolver
CREATE OR REPLACE FUNCTION public.user_has_permission(target_user_id uuid, requested_permission_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active boolean;
  v_override boolean;
BEGIN
  IF target_user_id IS NULL OR requested_permission_key IS NULL THEN RETURN false; END IF;

  IF public.has_role(target_user_id,'admin') THEN
    RETURN true;
  END IF;

  SELECT is_active INTO v_active FROM public.user_access_status WHERE user_id = target_user_id;
  IF v_active IS NOT NULL AND v_active = false THEN RETURN false; END IF;

  SELECT granted INTO v_override
  FROM public.user_permissions
  WHERE user_id = target_user_id AND permission_key = requested_permission_key;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role::text
    WHERE ur.user_id = target_user_id
      AND rp.permission_key = requested_permission_key
  );
END;
$$;

-- 8) Effective permissions view-function
CREATE OR REPLACE FUNCTION public.get_effective_user_permissions(target_user_id uuid)
RETURNS TABLE (
  permission_key text,
  label text,
  category text,
  description text,
  role_granted boolean,
  user_override boolean,
  effective_granted boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH
  active AS (
    SELECT COALESCE((SELECT is_active FROM public.user_access_status WHERE user_id = target_user_id), true) AS is_active
  ),
  is_admin AS (
    SELECT public.has_role(target_user_id,'admin') AS v
  ),
  role_grants AS (
    SELECT DISTINCT rp.permission_key
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = target_user_id
  ),
  overrides AS (
    SELECT permission_key, granted FROM public.user_permissions WHERE user_id = target_user_id
  )
  SELECT
    ap.permission_key,
    ap.label,
    ap.category,
    ap.description,
    (rg.permission_key IS NOT NULL) AS role_granted,
    o.granted AS user_override,
    CASE
      WHEN (SELECT v FROM is_admin) THEN true
      WHEN NOT (SELECT is_active FROM active) THEN false
      WHEN o.granted IS NOT NULL THEN o.granted
      ELSE rg.permission_key IS NOT NULL
    END AS effective_granted
  FROM public.app_permissions ap
  LEFT JOIN role_grants rg ON rg.permission_key = ap.permission_key
  LEFT JOIN overrides o ON o.permission_key = ap.permission_key
  ORDER BY ap.category, ap.label;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid,text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_user_permissions(uuid) TO authenticated, service_role;
