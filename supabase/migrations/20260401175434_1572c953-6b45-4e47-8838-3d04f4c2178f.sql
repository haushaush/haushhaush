
CREATE TABLE public.drive_connection (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  google_email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  root_folder_id TEXT,
  connected_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.drive_connection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own connection" ON public.drive_connection FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own connection" ON public.drive_connection FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own connection" ON public.drive_connection FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own connection" ON public.drive_connection FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.drive_folder_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client','intern','finanzen','hr','team_member')),
  entity_id UUID,
  folder_section TEXT,
  drive_folder_id TEXT NOT NULL,
  drive_folder_url TEXT,
  drive_folder_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.drive_folder_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view folder mappings" ON public.drive_folder_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can insert folder mappings" ON public.drive_folder_mappings FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update folder mappings" ON public.drive_folder_mappings FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete folder mappings" ON public.drive_folder_mappings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TABLE public.drive_pinned_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_file_id TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  drive_url TEXT,
  thumbnail_url TEXT,
  entity_type TEXT,
  entity_id UUID,
  pinned_by UUID NOT NULL,
  pinned_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.drive_pinned_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view pinned files" ON public.drive_pinned_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can pin files" ON public.drive_pinned_files FOR INSERT TO authenticated WITH CHECK (auth.uid() = pinned_by);
CREATE POLICY "Users can unpin own files" ON public.drive_pinned_files FOR DELETE TO authenticated USING (auth.uid() = pinned_by);
