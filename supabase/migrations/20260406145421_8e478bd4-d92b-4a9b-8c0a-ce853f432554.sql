
CREATE TABLE public.aria_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  category TEXT NOT NULL DEFAULT 'Sonstiges',
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  file_path TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  created_by UUID,
  last_updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aria_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view knowledge" ON public.aria_knowledge
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can manage knowledge" ON public.aria_knowledge
  FOR ALL TO authenticated
  USING (is_admin_or_manager(auth.uid()))
  WITH CHECK (is_admin_or_manager(auth.uid()));

INSERT INTO storage.buckets (id, name, public) VALUES ('aria-knowledge', 'aria-knowledge', false);

CREATE POLICY "Authenticated can view aria-knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'aria-knowledge');

CREATE POLICY "Admins can upload aria-knowledge files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'aria-knowledge' AND (SELECT is_admin_or_manager(auth.uid())));

CREATE POLICY "Admins can delete aria-knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'aria-knowledge' AND (SELECT is_admin_or_manager(auth.uid())));
