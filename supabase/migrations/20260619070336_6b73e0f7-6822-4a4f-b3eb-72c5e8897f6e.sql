
CREATE OR REPLACE FUNCTION public.team_with_auth_ids()
RETURNS TABLE(auth_user_id uuid, email text, name text, rolle public.team_rolle)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, t.email, t.name, t.rolle
  FROM public.team t
  JOIN auth.users u ON lower(u.email) = lower(t.email)
  WHERE public.is_admin()
  ORDER BY t.name NULLS LAST, t.email;
$$;

GRANT EXECUTE ON FUNCTION public.team_with_auth_ids() TO authenticated;
