CREATE TABLE public.bonus_monat_freigaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat date NOT NULL,
  mitarbeiter_id uuid NOT NULL REFERENCES public.bonus_mitarbeiter(id) ON DELETE CASCADE,
  churn_erfassung_abgeschlossen boolean NOT NULL DEFAULT false,
  churn_bestaetigt_von uuid,
  churn_bestaetigt_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (monat, mitarbeiter_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_monat_freigaben TO authenticated;
GRANT ALL ON public.bonus_monat_freigaben TO service_role;
ALTER TABLE public.bonus_monat_freigaben ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_freigaben_select" ON public.bonus_monat_freigaben FOR SELECT TO authenticated
  USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE POLICY "bonus_freigaben_manage" ON public.bonus_monat_freigaben FOR ALL TO authenticated
  USING (public.bonus_can_manage()) WITH CHECK (public.bonus_can_manage());