CREATE TABLE public.werbebudget_zuordnung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  meta_account_id text NOT NULL,
  untermarke text,
  typ text NOT NULL CHECK (typ IN ('kampagne','adset')),
  objekt_id text NOT NULL UNIQUE,
  kampagne_id text NOT NULL,
  objekt_name text,
  angelegt_von uuid,
  angelegt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX werbebudget_zuordnung_client_idx ON public.werbebudget_zuordnung(client_id);
CREATE INDEX werbebudget_zuordnung_kampagne_idx ON public.werbebudget_zuordnung(kampagne_id);
GRANT SELECT, INSERT, DELETE ON public.werbebudget_zuordnung TO authenticated;
GRANT ALL ON public.werbebudget_zuordnung TO service_role;
ALTER TABLE public.werbebudget_zuordnung ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance read wb zuordnung" ON public.werbebudget_zuordnung FOR SELECT TO authenticated USING (_finanzen_can_read());
CREATE POLICY "finance write wb zuordnung" ON public.werbebudget_zuordnung FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR user_has_permission(auth.uid(), 'finanzen.manage'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR user_has_permission(auth.uid(), 'finanzen.manage'));

-- Eine Kampagne gehört entweder als Ganzes einem Kunden oder wird über Anzeigengruppen aufgeteilt, nie beides.
CREATE OR REPLACE FUNCTION public.werbebudget_zuordnung_pruefen() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner text;
BEGIN
  IF NEW.typ = 'kampagne' THEN
    SELECT c.name INTO owner FROM public.werbebudget_zuordnung z JOIN public.clients c ON c.id = z.client_id WHERE z.kampagne_id = NEW.kampagne_id AND z.typ = 'adset' LIMIT 1;
    IF owner IS NOT NULL THEN RAISE EXCEPTION 'Kampagne ist bereits über Anzeigengruppen zugeordnet (u. a. an %).', owner; END IF;
  ELSE
    SELECT c.name INTO owner FROM public.werbebudget_zuordnung z JOIN public.clients c ON c.id = z.client_id WHERE z.objekt_id = NEW.kampagne_id AND z.typ = 'kampagne' LIMIT 1;
    IF owner IS NOT NULL THEN RAISE EXCEPTION 'Die Kampagne gehört bereits als Ganzes zu %.', owner; END IF;
  END IF;
  SELECT c.name INTO owner FROM public.werbebudget_zuordnung z JOIN public.clients c ON c.id = z.client_id WHERE z.objekt_id = NEW.objekt_id LIMIT 1;
  IF owner IS NOT NULL THEN RAISE EXCEPTION 'Bereits zugeordnet an %.', owner; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER werbebudget_zuordnung_pruefen BEFORE INSERT ON public.werbebudget_zuordnung FOR EACH ROW EXECUTE FUNCTION public.werbebudget_zuordnung_pruefen();

CREATE TABLE public.werbebudget_vorschlag_verworfen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kampagne_id text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  verworfen_von uuid,
  verworfen_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kampagne_id, client_id)
);
GRANT SELECT, INSERT ON public.werbebudget_vorschlag_verworfen TO authenticated;
GRANT ALL ON public.werbebudget_vorschlag_verworfen TO service_role;
ALTER TABLE public.werbebudget_vorschlag_verworfen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance read wb verworfen" ON public.werbebudget_vorschlag_verworfen FOR SELECT TO authenticated USING (_finanzen_can_read());
CREATE POLICY "finance write wb verworfen" ON public.werbebudget_vorschlag_verworfen FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR user_has_permission(auth.uid(), 'finanzen.manage'));