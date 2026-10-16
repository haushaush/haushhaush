CREATE TABLE public.close_abschluss_ausgeblendet (
  close_opportunity_id text PRIMARY KEY,
  geloescht_von uuid,
  geloescht_am timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.close_abschluss_ausgeblendet TO authenticated;
GRANT ALL ON public.close_abschluss_ausgeblendet TO service_role;
ALTER TABLE public.close_abschluss_ausgeblendet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read" ON public.close_abschluss_ausgeblendet FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager insert" ON public.close_abschluss_ausgeblendet FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "manager delete" ON public.close_abschluss_ausgeblendet FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));