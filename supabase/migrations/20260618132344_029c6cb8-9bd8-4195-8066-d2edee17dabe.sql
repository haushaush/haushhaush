
-- Admin policy on time_entries (keeps existing own_entries policy)
CREATE POLICY "admin_all_time_entries"
ON public.time_entries
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Security definer function returning all time entries enriched with user email + team name
CREATE OR REPLACE FUNCTION public.get_admin_time_entries()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  task_label text,
  client_id uuid,
  task_id uuid,
  started_at timestamptz,
  stopped_at timestamptz,
  duration_seconds integer,
  notes text,
  created_at timestamptz,
  user_email text,
  team_id uuid,
  team_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    te.id, te.user_id, te.task_label, te.client_id, te.task_id,
    te.started_at, te.stopped_at, te.duration_seconds, te.notes, te.created_at,
    u.email::text AS user_email,
    t.id AS team_id,
    t.name AS team_name
  FROM public.time_entries te
  LEFT JOIN auth.users u ON u.id = te.user_id
  LEFT JOIN public.team t ON lower(t.email) = lower(u.email)
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY te.started_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_admin_time_entries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_time_entries() TO authenticated;

-- Admin-visible view as an alternative interface
CREATE OR REPLACE VIEW public.admin_time_entries
WITH (security_invoker = off) AS
SELECT * FROM public.get_admin_time_entries();

GRANT SELECT ON public.admin_time_entries TO authenticated;
