-- Tighten OnePage RLS to admins only

-- onepage_projects
DROP POLICY IF EXISTS "Authenticated can view onepage_projects" ON public.onepage_projects;
DROP POLICY IF EXISTS "Admins/managers can insert onepage_projects" ON public.onepage_projects;
DROP POLICY IF EXISTS "Admins/managers can update onepage_projects" ON public.onepage_projects;
DROP POLICY IF EXISTS "Admins can delete onepage_projects" ON public.onepage_projects;

CREATE POLICY "Admins can view onepage_projects"
  ON public.onepage_projects FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert onepage_projects"
  ON public.onepage_projects FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update onepage_projects"
  ON public.onepage_projects FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete onepage_projects"
  ON public.onepage_projects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- onepage_project_leads
DROP POLICY IF EXISTS "Authenticated can view onepage_leads" ON public.onepage_project_leads;
DROP POLICY IF EXISTS "Admins/managers can insert onepage_leads" ON public.onepage_project_leads;
DROP POLICY IF EXISTS "Admins/managers can update onepage_leads" ON public.onepage_project_leads;
DROP POLICY IF EXISTS "Admins can delete onepage_leads" ON public.onepage_project_leads;

CREATE POLICY "Admins can view onepage_leads"
  ON public.onepage_project_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert onepage_leads"
  ON public.onepage_project_leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update onepage_leads"
  ON public.onepage_project_leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete onepage_leads"
  ON public.onepage_project_leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- onepage_webhook_logs (admins only)
DROP POLICY IF EXISTS "Authenticated can view onepage_webhook_logs" ON public.onepage_webhook_logs;
DROP POLICY IF EXISTS "Admins/managers can insert onepage_webhook_logs" ON public.onepage_webhook_logs;
DROP POLICY IF EXISTS "Admins/managers can update onepage_webhook_logs" ON public.onepage_webhook_logs;
DROP POLICY IF EXISTS "Admins can delete onepage_webhook_logs" ON public.onepage_webhook_logs;

CREATE POLICY "Admins can view onepage_webhook_logs"
  ON public.onepage_webhook_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete onepage_webhook_logs"
  ON public.onepage_webhook_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));