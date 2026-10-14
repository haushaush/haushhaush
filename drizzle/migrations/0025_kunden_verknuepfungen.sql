CREATE TABLE public.kunde_externe_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  system text NOT NULL CHECK (system IN ('slack','pipedrive','superchat')),
  externe_id text NOT NULL,
  name text,
  url text,
  verknuepft_von uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, system)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kunde_externe_links TO authenticated;
GRANT ALL ON public.kunde_externe_links TO service_role;
ALTER TABLE public.kunde_externe_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read externe links" ON public.kunde_externe_links FOR SELECT TO authenticated
  USING (is_admin_or_manager(auth.uid()) OR user_has_permission(auth.uid(), 'clients.view'));
CREATE POLICY "managers write externe links" ON public.kunde_externe_links FOR ALL TO authenticated
  USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE TABLE public.kunde_link_vorschlag_verworfen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  system text NOT NULL,
  externe_id text NOT NULL,
  verworfen_von uuid,
  verworfen_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, system, externe_id)
);
GRANT SELECT, INSERT, DELETE ON public.kunde_link_vorschlag_verworfen TO authenticated;
GRANT ALL ON public.kunde_link_vorschlag_verworfen TO service_role;
ALTER TABLE public.kunde_link_vorschlag_verworfen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read verworfen" ON public.kunde_link_vorschlag_verworfen FOR SELECT TO authenticated
  USING (is_admin_or_manager(auth.uid()) OR user_has_permission(auth.uid(), 'clients.view'));
CREATE POLICY "managers write verworfen" ON public.kunde_link_vorschlag_verworfen FOR ALL TO authenticated
  USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));