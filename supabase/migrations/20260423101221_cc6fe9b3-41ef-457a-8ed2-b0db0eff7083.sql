-- Restrict integration_settings to admins only (was admin+manager)
DROP POLICY IF EXISTS "admin_manage_integrations" ON public.integration_settings;

CREATE POLICY "admins manage integration_settings"
ON public.integration_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));