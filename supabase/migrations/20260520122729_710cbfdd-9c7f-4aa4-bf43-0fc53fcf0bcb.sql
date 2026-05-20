CREATE TABLE IF NOT EXISTS public.close_sync_locks (
  lock_key text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  acquired_by text
);

ALTER TABLE public.close_sync_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read close_sync_locks"
ON public.close_sync_locks FOR SELECT
TO authenticated USING (true);

CREATE POLICY "authenticated manage close_sync_locks"
ON public.close_sync_locks FOR ALL
TO authenticated USING (true) WITH CHECK (true);