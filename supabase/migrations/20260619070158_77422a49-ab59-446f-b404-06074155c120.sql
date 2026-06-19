
CREATE TABLE IF NOT EXISTS public.drive_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_item_id text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('folder','file')),
  item_name text,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user','role')),
  grantee_user_id uuid,
  grantee_role public.team_rolle,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (grantee_type = 'user' AND grantee_user_id IS NOT NULL AND grantee_role IS NULL) OR
    (grantee_type = 'role' AND grantee_role IS NOT NULL AND grantee_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_drive_perm_item ON public.drive_permissions(drive_item_id);
CREATE INDEX IF NOT EXISTS idx_drive_perm_user ON public.drive_permissions(grantee_user_id);
CREATE INDEX IF NOT EXISTS idx_drive_perm_role ON public.drive_permissions(grantee_role);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_permissions TO authenticated;
GRANT ALL ON public.drive_permissions TO service_role;

ALTER TABLE public.drive_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_team_rolle()
RETURNS public.team_rolle
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.rolle
  FROM public.team t
  JOIN auth.users u ON lower(u.email) = lower(t.email)
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Admins manage drive_permissions" ON public.drive_permissions;
CREATE POLICY "Admins manage drive_permissions"
ON public.drive_permissions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users see own drive_permissions" ON public.drive_permissions;
CREATE POLICY "Users see own drive_permissions"
ON public.drive_permissions
FOR SELECT
TO authenticated
USING (
  grantee_user_id = auth.uid()
  OR (grantee_type = 'role' AND grantee_role = public.current_user_team_rolle())
);

CREATE OR REPLACE FUNCTION public.user_can_see_item(p_user_id uuid, p_item_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.team_rolle;
BEGIN
  IF public.has_role(p_user_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  SELECT t.rolle INTO v_role
  FROM public.team t
  JOIN auth.users u ON lower(u.email) = lower(t.email)
  WHERE u.id = p_user_id
  LIMIT 1;

  RETURN EXISTS (
    SELECT 1 FROM public.drive_permissions dp
    WHERE dp.drive_item_id = p_item_id
      AND (
        dp.grantee_user_id = p_user_id
        OR (dp.grantee_type = 'role' AND dp.grantee_role = v_role)
      )
  );
END;
$$;
