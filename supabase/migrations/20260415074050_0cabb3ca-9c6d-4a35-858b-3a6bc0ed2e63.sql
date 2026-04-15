
-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);

-- Public read policy for the bucket
CREATE POLICY "Public can view company logos" ON storage.objects FOR SELECT USING (bucket_id = 'company-logos');

-- Authenticated can upload
CREATE POLICY "Authenticated can upload company logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

-- Authenticated can update
CREATE POLICY "Authenticated can update company logos" ON storage.objects FOR UPDATE USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

-- Authenticated can delete
CREATE POLICY "Authenticated can delete company logos" ON storage.objects FOR DELETE USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

-- Table
CREATE TABLE public.company_logos (
  unternehmen text PRIMARY KEY,
  logo_url text,
  bg_color text DEFAULT '#003781'
);

ALTER TABLE public.company_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company_logos" ON public.company_logos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage company_logos" ON public.company_logos FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));

-- Seed data
INSERT INTO public.company_logos (unternehmen, bg_color) VALUES
  ('Allianz', '#003781'),
  ('Hanse Merkur', '#004B2D'),
  ('Barmenia Gothaer', '#1a1a1a'),
  ('Signal Iduna', '#E20028'),
  ('AXA', '#00208C'),
  ('ARAG', '#004A99'),
  ('ERGO', '#1D1D1B'),
  ('Versicherungsmakler', '#0A3055'),
  ('Individuell', '#374151')
ON CONFLICT DO NOTHING;
