
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID REFERENCES public.aria_automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  steps_log JSONB DEFAULT '[]',
  error_message TEXT,
  triggered_by TEXT DEFAULT 'manual'
);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view automation runs" ON public.automation_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert automation runs" ON public.automation_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update automation runs" ON public.automation_runs
  FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid()));
