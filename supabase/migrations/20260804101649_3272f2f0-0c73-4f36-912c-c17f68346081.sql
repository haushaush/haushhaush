REVOKE EXECUTE ON FUNCTION public.bonus_my_team_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bonus_can_manage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bonus_is_own(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_my_team_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bonus_can_manage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bonus_is_own(uuid) TO authenticated, service_role;