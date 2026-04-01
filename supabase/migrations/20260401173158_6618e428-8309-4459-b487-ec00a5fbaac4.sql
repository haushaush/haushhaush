
-- Enums
CREATE TYPE public.creative_project_status AS ENUM (
  'Briefing', 'In Produktion', 'Interner Review', 'Kunde Review', 
  'Änderungen nötig', 'Freigegeben', 'Live', 'Archiviert'
);

CREATE TYPE public.creative_asset_status AS ENUM (
  'Draft', 'Interner Review', 'Feedback erhalten', 'Überarbeitung', 'Freigegeben', 'Abgelehnt'
);

CREATE TYPE public.creative_file_type AS ENUM ('image', 'video', 'carousel');

CREATE TYPE public.creative_author_type AS ENUM ('Intern', 'Kunde');

CREATE TYPE public.creative_approval_type AS ENUM ('Intern', 'Kunde');

CREATE TYPE public.creative_vertical AS ENUM ('PKV', 'BU', 'Rechtsschutz', 'Altersvorsorge', 'Sonstiges');

-- creative_projects
CREATE TABLE public.creative_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  vertical public.creative_vertical NOT NULL DEFAULT 'Sonstiges',
  status public.creative_project_status NOT NULL DEFAULT 'Briefing',
  assigned_designer TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drive_folder_url TEXT,
  meta_adset_id TEXT,
  notes TEXT,
  review_token UUID DEFAULT gen_random_uuid(),
  briefing_content TEXT,
  deliverables JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE public.creative_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view creative_projects" ON public.creative_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert creative_projects" ON public.creative_projects FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update creative_projects" ON public.creative_projects FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete creative_projects" ON public.creative_projects FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Public review access" ON public.creative_projects FOR SELECT TO anon USING (true);

-- creative_assets
CREATE TABLE public.creative_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.creative_projects(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type public.creative_file_type NOT NULL DEFAULT 'image',
  drive_file_id TEXT,
  drive_preview_url TEXT,
  version_nr INTEGER NOT NULL DEFAULT 1,
  status public.creative_asset_status NOT NULL DEFAULT 'Draft',
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view creative_assets" ON public.creative_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert creative_assets" ON public.creative_assets FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update creative_assets" ON public.creative_assets FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete creative_assets" ON public.creative_assets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Public review access assets" ON public.creative_assets FOR SELECT TO anon USING (true);

-- creative_feedback
CREATE TABLE public.creative_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID REFERENCES public.creative_assets(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  author_type public.creative_author_type NOT NULL DEFAULT 'Intern',
  comment TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.creative_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view creative_feedback" ON public.creative_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert creative_feedback" ON public.creative_feedback FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update creative_feedback" ON public.creative_feedback FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete creative_feedback" ON public.creative_feedback FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anon can insert feedback" ON public.creative_feedback FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can view feedback" ON public.creative_feedback FOR SELECT TO anon USING (true);

-- creative_approvals
CREATE TABLE public.creative_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.creative_projects(id) ON DELETE CASCADE NOT NULL,
  asset_id UUID REFERENCES public.creative_assets(id) ON DELETE CASCADE NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approval_type public.creative_approval_type NOT NULL DEFAULT 'Intern',
  signature_url TEXT
);

ALTER TABLE public.creative_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view creative_approvals" ON public.creative_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert creative_approvals" ON public.creative_approvals FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete creative_approvals" ON public.creative_approvals FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anon can insert approvals" ON public.creative_approvals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can view approvals" ON public.creative_approvals FOR SELECT TO anon USING (true);

-- Triggers
CREATE TRIGGER update_creative_projects_updated_at BEFORE UPDATE ON public.creative_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
