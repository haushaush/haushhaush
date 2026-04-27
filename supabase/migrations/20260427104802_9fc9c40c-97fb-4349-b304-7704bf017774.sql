-- OnePage Leads schema
CREATE TABLE IF NOT EXISTS public.onepage_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  page_url text,
  status text NOT NULL DEFAULT 'active',
  client_id uuid,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onepage_project_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.onepage_projects(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onepage_leads_project ON public.onepage_project_leads(project_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_onepage_projects_status ON public.onepage_projects(status);

ALTER TABLE public.onepage_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onepage_project_leads ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Authenticated can view onepage_projects" ON public.onepage_projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/managers can insert onepage_projects" ON public.onepage_projects
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins/managers can update onepage_projects" ON public.onepage_projects
  FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete onepage_projects" ON public.onepage_projects
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Leads policies
CREATE POLICY "Authenticated can view onepage_leads" ON public.onepage_project_leads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/managers can insert onepage_leads" ON public.onepage_project_leads
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins/managers can update onepage_leads" ON public.onepage_project_leads
  FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete onepage_leads" ON public.onepage_project_leads
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated-at trigger
CREATE TRIGGER trg_onepage_projects_updated_at
  BEFORE UPDATE ON public.onepage_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();