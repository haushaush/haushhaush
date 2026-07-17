
ALTER TABLE public.user_mfa_status
  ADD COLUMN IF NOT EXISTS two_factor_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exempt_set_by uuid,
  ADD COLUMN IF NOT EXISTS exempt_set_at timestamptz;

-- Allow admins to read/upsert any user's mfa status row
DROP POLICY IF EXISTS "admins read mfa status" ON public.user_mfa_status;
CREATE POLICY "admins read mfa status" ON public.user_mfa_status
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins upsert mfa status" ON public.user_mfa_status;
CREATE POLICY "admins upsert mfa status" ON public.user_mfa_status
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
