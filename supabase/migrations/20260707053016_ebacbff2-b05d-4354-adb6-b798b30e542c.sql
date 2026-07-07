
CREATE TABLE IF NOT EXISTS public.qonto_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger_type text NOT NULL DEFAULT 'manual',
  records_bank_accounts integer DEFAULT 0,
  records_transactions integer DEFAULT 0,
  records_invoices integer DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qonto_sync_runs TO authenticated;
GRANT ALL ON public.qonto_sync_runs TO service_role;

ALTER TABLE public.qonto_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sync runs"
  ON public.qonto_sync_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS qonto_sync_runs_started_idx ON public.qonto_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS qonto_sync_runs_trigger_status_idx ON public.qonto_sync_runs (trigger_type, status, finished_at DESC);
