
-- Enums
CREATE TYPE public.kundenstatus AS ENUM ('In Betreuung', 'Pausiert', 'Churned', 'Lead');
CREATE TYPE public.ampelstatus AS ENUM ('Grün', 'Gelb', 'Rot', 'CC');
CREATE TYPE public.finanz_typ AS ENUM ('Einnahme', 'Ausgabe');
CREATE TYPE public.team_rolle AS ENUM ('Admin', 'Account-Manager', 'Setter', 'Closer');
CREATE TYPE public.app_role AS ENUM ('admin', 'account-manager', 'setter');

-- Team table
CREATE TABLE public.team (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  rolle public.team_rolle NOT NULL DEFAULT 'Setter',
  startdatum DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  website TEXT,
  branche TEXT,
  kundenstatus public.kundenstatus NOT NULL DEFAULT 'Lead',
  ampelstatus public.ampelstatus NOT NULL DEFAULT 'Grün',
  projekttyp TEXT,
  zahlstatus TEXT,
  laufzeit TEXT,
  startdatum DATE,
  enddatum DATE,
  clv NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  projekttyp TEXT,
  ads_budget NUMERIC(12,2) DEFAULT 0,
  gesamt_saldo NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Aktiv',
  startdatum DATE,
  enddatum DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES public.team(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Offen',
  geplante_zeit NUMERIC(6,2) DEFAULT 0,
  ist_zeit NUMERIC(6,2) DEFAULT 0,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Finance table
CREATE TABLE public.finance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  betrag NUMERIC(12,2) NOT NULL DEFAULT 0,
  typ public.finanz_typ NOT NULL DEFAULT 'Einnahme',
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  zahlstatus TEXT NOT NULL DEFAULT 'Offen',
  rechnung_nr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales performance table
CREATE TABLE public.sales_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setter_id UUID REFERENCES public.team(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  calls_made INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  show_ups INTEGER DEFAULT 0,
  closes INTEGER DEFAULT 0,
  revenue_generated NUMERIC(12,2) DEFAULT 0,
  cold_mails_sent INTEGER DEFAULT 0,
  cold_mail_responses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ad performance intern table
CREATE TABLE public.ad_performance_intern (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  spend NUMERIC(12,2) DEFAULT 0,
  leads INTEGER DEFAULT 0,
  cpl NUMERIC(10,2) DEFAULT 0,
  appointments INTEGER DEFAULT 0,
  cost_per_appointment NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vorquali KPI table
CREATE TABLE public.vorquali_kpi (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setter_id UUID REFERENCES public.team(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  leads_called INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  terminquote NUMERIC(5,2) DEFAULT 0,
  no_shows INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on all tables
ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_performance_intern ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vorquali_kpi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: check if user is admin or account-manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'account-manager')
  )
$$;

-- user_roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Policies for clients
CREATE POLICY "Authenticated users can view clients" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for projects
CREATE POLICY "Authenticated users can view projects" ON public.projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for tasks
CREATE POLICY "Authenticated users can view tasks" ON public.tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete tasks" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for finance
CREATE POLICY "Authenticated users can view finance" ON public.finance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert finance" ON public.finance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update finance" ON public.finance
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete finance" ON public.finance
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for team
CREATE POLICY "Authenticated users can view team" ON public.team
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert team" ON public.team
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update team" ON public.team
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete team" ON public.team
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for sales_performance
CREATE POLICY "Authenticated users can view sales_performance" ON public.sales_performance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert sales_performance" ON public.sales_performance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update sales_performance" ON public.sales_performance
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete sales_performance" ON public.sales_performance
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for ad_performance_intern
CREATE POLICY "Authenticated users can view ad_performance_intern" ON public.ad_performance_intern
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert ad_performance_intern" ON public.ad_performance_intern
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update ad_performance_intern" ON public.ad_performance_intern
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete ad_performance_intern" ON public.ad_performance_intern
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for vorquali_kpi
CREATE POLICY "Authenticated users can view vorquali_kpi" ON public.vorquali_kpi
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert vorquali_kpi" ON public.vorquali_kpi
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update vorquali_kpi" ON public.vorquali_kpi
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete vorquali_kpi" ON public.vorquali_kpi
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_team_updated_at BEFORE UPDATE ON public.team FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_finance_updated_at BEFORE UPDATE ON public.finance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
