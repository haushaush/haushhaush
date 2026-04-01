
-- Create employee_requests table for registration approval flow
CREATE TABLE IF NOT EXISTS public.employee_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  vorname text NOT NULL,
  nachname text NOT NULL,
  email text NOT NULL,
  telefon text,
  geburtsdatum date,
  position text,
  abteilung text,
  vertragsart text,
  startdatum date,
  ueber_mich text,
  notfall_name text,
  notfall_telefon text,
  adresse text,
  iban text,
  profilbild_url text,
  status text NOT NULL DEFAULT 'Ausstehend',
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_notiz text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

-- Admin can read all requests
CREATE POLICY "admin_read_requests" ON public.employee_requests
  FOR SELECT TO authenticated
  USING (is_admin_or_manager(auth.uid()));

-- User can read own request
CREATE POLICY "own_read_request" ON public.employee_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Anyone authenticated can insert (during registration)
CREATE POLICY "insert_request" ON public.employee_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Anon can also insert (for registration before full auth)
CREATE POLICY "anon_insert_request" ON public.employee_requests
  FOR INSERT TO anon
  WITH CHECK (true);

-- Admin can update requests (approve/reject)
CREATE POLICY "admin_update_requests" ON public.employee_requests
  FOR UPDATE TO authenticated
  USING (is_admin_or_manager(auth.uid()));

-- Create storage bucket for profile images
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Anyone can upload avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');
