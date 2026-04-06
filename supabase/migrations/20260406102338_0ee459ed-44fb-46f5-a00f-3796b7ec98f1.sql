-- Create bug-reports storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('bug-reports', 'bug-reports', true);

-- Storage RLS: anyone authenticated can upload
CREATE POLICY "Authenticated users can upload bug reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bug-reports');

-- Storage RLS: public can read
CREATE POLICY "Public can read bug reports"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'bug-reports');

-- Create bug_reports table
CREATE TABLE public.bug_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_email TEXT,
  page_url TEXT,
  problem_type TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  browser_info TEXT,
  slack_message_ts TEXT,
  status TEXT NOT NULL DEFAULT 'Offen',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert
CREATE POLICY "Authenticated can insert bug reports"
ON public.bug_reports FOR INSERT TO authenticated
WITH CHECK (true);

-- Users can see own reports
CREATE POLICY "Users can view own bug reports"
ON public.bug_reports FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admins can see all
CREATE POLICY "Admins can view all bug reports"
ON public.bug_reports FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update
CREATE POLICY "Admins can update bug reports"
ON public.bug_reports FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));