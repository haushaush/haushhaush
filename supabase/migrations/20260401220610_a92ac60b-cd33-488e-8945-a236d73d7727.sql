
-- employment_contracts
CREATE TABLE public.employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  vertragsart text NOT NULL DEFAULT 'Festanstellung',
  gehalt_brutto numeric DEFAULT 0,
  gehalt_netto numeric DEFAULT 0,
  arbeitsstunden_pro_woche numeric DEFAULT 40,
  urlaubstage integer DEFAULT 24,
  startdatum date,
  enddatum date,
  probezeit_bis date,
  kuendigungsfrist text,
  status text DEFAULT 'Aktiv',
  drive_vertrag_url text,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can manage contracts" ON public.employment_contracts FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated can view contracts" ON public.employment_contracts FOR SELECT TO authenticated USING (true);

-- salary_payments
CREATE TABLE public.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  monat date NOT NULL,
  betrag_brutto numeric DEFAULT 0,
  betrag_netto numeric DEFAULT 0,
  status text DEFAULT 'Offen',
  ueberwiesen_am date,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can manage salary" ON public.salary_payments FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated can view salary" ON public.salary_payments FOR SELECT TO authenticated USING (true);

-- time_off_requests
CREATE TABLE public.time_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  typ text NOT NULL DEFAULT 'Urlaub',
  von date NOT NULL,
  bis date NOT NULL,
  tage numeric DEFAULT 1,
  status text DEFAULT 'Ausstehend',
  anmerkung text,
  entschieden_von uuid REFERENCES public.team(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can manage time_off" ON public.time_off_requests FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated can view time_off" ON public.time_off_requests FOR SELECT TO authenticated USING (true);

-- probewoche_candidates
CREATE TABLE public.probewoche_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  position text,
  probewoche_start date,
  probewoche_end date,
  status text DEFAULT 'Aktiv',
  bewertung integer DEFAULT 0,
  notizen text,
  slack_account text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.probewoche_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can manage probewoche" ON public.probewoche_candidates FOR ALL TO authenticated USING (is_admin_or_manager(auth.uid())) WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated can view probewoche" ON public.probewoche_candidates FOR SELECT TO authenticated USING (true);
