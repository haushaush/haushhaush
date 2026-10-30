GRANT SELECT, INSERT, UPDATE ON public.meta_konto_art TO authenticated;
GRANT ALL ON public.meta_konto_art TO service_role;
ALTER TABLE public.meta_konto_art ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance read konto art" ON public.meta_konto_art FOR SELECT TO authenticated USING (public._finanzen_can_read());
CREATE POLICY "finance write konto art" ON public.meta_konto_art FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_has_permission(auth.uid(), 'finanzen.manage'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_has_permission(auth.uid(), 'finanzen.manage'));