
CREATE TABLE public.aria_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_config JSONB DEFAULT '{}',
  steps JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aria_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view automations" ON public.aria_automations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert automations" ON public.aria_automations FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update automations" ON public.aria_automations FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete automations" ON public.aria_automations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TABLE public.aria_automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID REFERENCES public.aria_automations(id) ON DELETE CASCADE,
  triggered_by TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  steps_executed JSONB DEFAULT '[]',
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aria_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view automation logs" ON public.aria_automation_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert automation logs" ON public.aria_automation_logs FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
