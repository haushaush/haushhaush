ALTER TABLE public.sales_bestand ADD COLUMN IF NOT EXISTS kanal text NOT NULL DEFAULT '';
ALTER TABLE public.sales_bestand DROP CONSTRAINT IF EXISTS sales_bestand_pkey;
ALTER TABLE public.sales_bestand ADD PRIMARY KEY (datum, kanal);

CREATE TABLE public.sales_sheet_sync_laeufe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  beendet_am timestamptz,
  status text NOT NULL DEFAULT 'laeuft',
  modus text NOT NULL,
  ausloeser text NOT NULL,
  zeilen jsonb NOT NULL DEFAULT '{}'::jsonb,
  verworfen jsonb NOT NULL DEFAULT '{}'::jsonb,
  unbekannte_kanaele jsonb NOT NULL DEFAULT '[]'::jsonb,
  daten_ab date,
  fehler text
);
GRANT SELECT ON public.sales_sheet_sync_laeufe TO authenticated;
GRANT ALL ON public.sales_sheet_sync_laeufe TO service_role;
ALTER TABLE public.sales_sheet_sync_laeufe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales lesen Sheet-Laeufe" ON public.sales_sheet_sync_laeufe FOR SELECT TO authenticated
USING (user_has_permission(auth.uid(), 'sales.view') OR user_has_permission(auth.uid(), 'sales.uebersicht.view') OR is_admin());

INSERT INTO public.bonus_cron_tokens(name, token) VALUES ('sales_sheet_sync', encode(gen_random_bytes(24),'hex')) ON CONFLICT DO NOTHING;