CREATE TABLE public.sales_tagesdaten (
  datum date NOT NULL, kanal text NOT NULL DEFAULT '', user_name text NOT NULL DEFAULT '',
  dials numeric, eg_gebucht numeric, eg_gefuehrt numeric, zg_gebucht numeric, zg_gefuehrt numeric, abschluesse numeric, umsatz numeric,
  werte jsonb NOT NULL DEFAULT '{}'::jsonb, empfangen_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (datum, kanal, user_name)
);
CREATE TABLE public.sales_bestand (
  datum date PRIMARY KEY, bestand numeric, werte jsonb NOT NULL DEFAULT '{}'::jsonb, empfangen_am timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sales_abgaenge (
  schluessel text PRIMARY KEY, datum date, kunde text, grund text, kanal text,
  werte jsonb NOT NULL DEFAULT '{}'::jsonb, empfangen_am timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_tagesdaten, public.sales_bestand, public.sales_abgaenge TO authenticated;
GRANT ALL ON public.sales_tagesdaten, public.sales_bestand, public.sales_abgaenge TO service_role;
ALTER TABLE public.sales_tagesdaten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_bestand ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_abgaenge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales lesen Tagesdaten" ON public.sales_tagesdaten FOR SELECT TO authenticated USING (public.user_has_permission(auth.uid(), 'sales.view') OR public.user_has_permission(auth.uid(), 'sales.uebersicht.view') OR public.is_admin());
CREATE POLICY "Sales lesen Bestand" ON public.sales_bestand FOR SELECT TO authenticated USING (public.user_has_permission(auth.uid(), 'sales.view') OR public.user_has_permission(auth.uid(), 'sales.uebersicht.view') OR public.is_admin());
CREATE POLICY "Sales lesen Abgaenge" ON public.sales_abgaenge FOR SELECT TO authenticated USING (public.user_has_permission(auth.uid(), 'sales.view') OR public.user_has_permission(auth.uid(), 'sales.uebersicht.view') OR public.is_admin());