INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('referenz-showcase', 'referenz-showcase', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Public read referenz-showcase" ON storage.objects;
CREATE POLICY "Public read referenz-showcase"
ON storage.objects FOR SELECT
USING (bucket_id = 'referenz-showcase');

DROP POLICY IF EXISTS "Service role write referenz-showcase" ON storage.objects;
CREATE POLICY "Service role write referenz-showcase"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'referenz-showcase');

DROP POLICY IF EXISTS "Service role update referenz-showcase" ON storage.objects;
CREATE POLICY "Service role update referenz-showcase"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'referenz-showcase');