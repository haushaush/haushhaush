
CREATE TABLE public.showcase_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ad_ids TEXT[] NOT NULL,
  enrichment JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  total INT NOT NULL DEFAULT 0,
  done INT NOT NULL DEFAULT 0,
  recent JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  skipped JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE public.showcase_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own jobs"
  ON public.showcase_import_jobs FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "users can insert own jobs"
  ON public.showcase_import_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own jobs"
  ON public.showcase_import_jobs FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER showcase_import_jobs_updated_at
  BEFORE UPDATE ON public.showcase_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.showcase_import_jobs;
