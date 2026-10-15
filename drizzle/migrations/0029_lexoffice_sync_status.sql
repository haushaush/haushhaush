CREATE TABLE public.lexoffice_sync_status (
  resource text PRIMARY KEY,
  last_synced_at timestamptz, last_success_at timestamptz, started_at timestamptz,
  last_error text, completed boolean, pages_loaded integer, fetched_count integer, total_pages integer,
  triggered_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lexoffice_sync_status TO authenticated;
GRANT ALL ON public.lexoffice_sync_status TO service_role;
ALTER TABLE public.lexoffice_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read lexoffice sync status" ON public.lexoffice_sync_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.lexoffice_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL DEFAULT 'running', trigger_type text NOT NULL DEFAULT 'manual',
  records_invoices integer NOT NULL DEFAULT 0, records_contacts integer NOT NULL DEFAULT 0,
  error_message text
);
GRANT SELECT ON public.lexoffice_sync_runs TO authenticated;
GRANT ALL ON public.lexoffice_sync_runs TO service_role;
ALTER TABLE public.lexoffice_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read lexoffice sync runs" ON public.lexoffice_sync_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));