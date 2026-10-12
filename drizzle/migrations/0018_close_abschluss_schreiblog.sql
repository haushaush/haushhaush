CREATE TABLE public.close_abschluss_schreiblog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  client_id uuid,
  kunde text,
  close_lead_id text,
  close_opportunity_id text,
  aktion text NOT NULL CHECK (aktion IN ('angelegt','aktualisiert','fehlgeschlagen')),
  werte jsonb NOT NULL DEFAULT '{}'::jsonb,
  fehler text
);
GRANT SELECT ON public.close_abschluss_schreiblog TO authenticated;
GRANT ALL ON public.close_abschluss_schreiblog TO service_role;
ALTER TABLE public.close_abschluss_schreiblog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lesen Schreibprotokoll" ON public.close_abschluss_schreiblog FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX ON public.close_abschluss_schreiblog (created_at DESC);