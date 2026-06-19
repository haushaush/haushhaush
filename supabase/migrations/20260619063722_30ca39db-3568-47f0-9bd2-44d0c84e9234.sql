
ALTER TABLE public.google_drive_connections
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_primary_drive
  ON public.google_drive_connections (is_primary) WHERE is_primary = true;

UPDATE public.google_drive_connections
   SET is_primary = true
 WHERE id = (SELECT id FROM public.google_drive_connections ORDER BY connected_at ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.google_drive_connections WHERE is_primary = true);

ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage drive connections" ON public.google_drive_connections;
CREATE POLICY "Admins manage drive connections"
  ON public.google_drive_connections
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.drive_connection_status()
RETURNS TABLE(google_email text, connected_at timestamptz, is_primary boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT google_email, connected_at, is_primary
  FROM public.google_drive_connections
  WHERE is_primary = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.drive_connection_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drive_connection_status() TO authenticated;
