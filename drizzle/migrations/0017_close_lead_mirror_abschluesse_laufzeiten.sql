CREATE TABLE public.close_lead_spiegel (
  close_lead_id text PRIMARY KEY,
  name text,
  status_id text,
  status_label text,
  marke text,
  branche text,
  sub_niche text,
  kanal text,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_created timestamptz,
  date_updated timestamptz,
  status_geaendert_am timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.close_lead_spiegel TO authenticated;
GRANT ALL ON public.close_lead_spiegel TO service_role;
ALTER TABLE public.close_lead_spiegel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read lead mirror" ON public.close_lead_spiegel FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.user_has_permission(auth.uid(), 'clients.view'));
CREATE INDEX close_lead_spiegel_status_idx ON public.close_lead_spiegel(status_label);

CREATE TABLE public.close_lead_statuswechsel (
  close_activity_id text PRIMARY KEY,
  close_lead_id text NOT NULL,
  von_label text,
  nach_label text,
  datum timestamptz,
  geaendert_von text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.close_lead_statuswechsel TO authenticated;
GRANT ALL ON public.close_lead_statuswechsel TO service_role;
ALTER TABLE public.close_lead_statuswechsel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read lead status changes" ON public.close_lead_statuswechsel FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.user_has_permission(auth.uid(), 'clients.view'));
CREATE INDEX close_lead_statuswechsel_lead_idx ON public.close_lead_statuswechsel(close_lead_id, datum DESC);

CREATE TABLE public.close_abschluesse (
  close_opportunity_id text PRIMARY KEY,
  close_lead_id text,
  lead_name text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  status_id text,
  status_label text,
  status_typ text,
  wert numeric,
  wert_periode text,
  status_geaendert_am timestamptz,
  angelegt_von text,
  angelegt_am timestamptz,
  geaendert_am timestamptz,
  abschlusswert numeric,
  setup_fee numeric,
  retainer_monat numeric,
  laufzeit_monate numeric,
  startdatum date,
  leistungen text,
  deal_typ text,
  close_typ text,
  closer text,
  setter text,
  cold_caller text,
  umsetzungszeitraum text,
  upsell jsonb NOT NULL DEFAULT '{}'::jsonb,
  kuendigungsdatum date,
  letzter_vertragstag date,
  abgangs_begruendung text,
  abgangsgrund text,
  branche text,
  sub_niche text,
  kanal text,
  marke text NOT NULL DEFAULT 'LeadSharks',
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.close_abschluesse TO authenticated;
GRANT ALL ON public.close_abschluesse TO service_role;
ALTER TABLE public.close_abschluesse ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read abschluesse" ON public.close_abschluesse FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.user_has_permission(auth.uid(), 'clients.view'));
CREATE INDEX close_abschluesse_lead_idx ON public.close_abschluesse(close_lead_id);
CREATE INDEX close_abschluesse_datum_idx ON public.close_abschluesse(status_geaendert_am DESC);

CREATE TABLE public.kunden_laufzeit_stand (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  close_lead_id text,
  kunde text,
  close_status_label text,
  close_opportunity_id text,
  startdatum date,
  laufzeit_monate numeric,
  vertragsende date,
  fehlt text[] NOT NULL DEFAULT '{}',
  notion_stand text,
  notion_fehler text,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kunden_laufzeit_stand TO authenticated;
GRANT ALL ON public.kunden_laufzeit_stand TO service_role;
ALTER TABLE public.kunden_laufzeit_stand ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read laufzeiten" ON public.kunden_laufzeit_stand FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.user_has_permission(auth.uid(), 'clients.view') OR public.user_has_permission(auth.uid(), 'clients.laufzeiten.view'));

CREATE TABLE public.close_sync_stand (
  name text PRIMARY KEY,
  letzter_erfolg timestamptz,
  letzter_voll timestamptz,
  letzter_lauf timestamptz,
  ok boolean,
  fehler text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.close_sync_stand TO authenticated;
GRANT ALL ON public.close_sync_stand TO service_role;
ALTER TABLE public.close_sync_stand ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read sync stand" ON public.close_sync_stand FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.user_has_permission(auth.uid(), 'clients.view'));