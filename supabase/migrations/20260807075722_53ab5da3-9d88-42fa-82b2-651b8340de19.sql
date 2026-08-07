
-- 1. TABLES
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id text PRIMARY KEY,
  name text,
  status_id text,
  status_label text,
  kanal text,
  marke text,
  branche text,
  sub_niche text,
  angle_ad_name text,
  website_vorhanden text,
  disqualifikations_grund text,
  campaign_name text,
  adset_name text,
  platform text,
  owner_id text,
  owner_name text,
  date_created timestamptz,
  date_updated timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_leads TO authenticated;
GRANT ALL ON public.sales_leads TO service_role;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read" ON public.sales_leads FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sales_leads_date_created ON public.sales_leads(date_created);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status_label ON public.sales_leads(status_label);
CREATE INDEX IF NOT EXISTS idx_sales_leads_owner_id ON public.sales_leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_kanal ON public.sales_leads(kanal);
CREATE INDEX IF NOT EXISTS idx_sales_leads_campaign_name ON public.sales_leads(campaign_name);

CREATE TABLE IF NOT EXISTS public.sales_opportunities (
  id text PRIMARY KEY,
  lead_id text,
  lead_name text,
  status_id text,
  status_label text,
  status_type text,
  pipeline_id text,
  pipeline_name text,
  value_cents bigint,
  value_currency text,
  leistungen text[],
  deal_typ text,
  setup_fee numeric,
  retainer_monat numeric,
  laufzeit int,
  close_typ text,
  cold_caller_id text,
  setter_id text,
  closer_id text,
  live_datum date,
  churn_datum date,
  churn_grund text,
  rechnungs_id text,
  note text,
  user_id text,
  user_name text,
  date_won timestamptz,
  date_lost timestamptz,
  date_created timestamptz,
  date_updated timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_opportunities TO authenticated;
GRANT ALL ON public.sales_opportunities TO service_role;
ALTER TABLE public.sales_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read" ON public.sales_opportunities FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sales_opps_date_created ON public.sales_opportunities(date_created);
CREATE INDEX IF NOT EXISTS idx_sales_opps_status_label ON public.sales_opportunities(status_label);
CREATE INDEX IF NOT EXISTS idx_sales_opps_lead_id ON public.sales_opportunities(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_user_id ON public.sales_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_closer_id ON public.sales_opportunities(closer_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_deal_typ ON public.sales_opportunities(deal_typ);

CREATE TABLE IF NOT EXISTS public.sales_calls (
  id text PRIMARY KEY,
  lead_id text,
  user_id text,
  user_name text,
  direction text,
  duration int,
  outcome_id text,
  outcome_label text,
  date_created timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_calls TO authenticated;
GRANT ALL ON public.sales_calls TO service_role;
ALTER TABLE public.sales_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read" ON public.sales_calls FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sales_calls_date_created ON public.sales_calls(date_created);
CREATE INDEX IF NOT EXISTS idx_sales_calls_user_id ON public.sales_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_calls_lead_id ON public.sales_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_calls_outcome_label ON public.sales_calls(outcome_label);

CREATE TABLE IF NOT EXISTS public.sales_custom_field_map (
  cf_id text PRIMARY KEY,
  object_type text,
  name text,
  field_type text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_custom_field_map TO authenticated;
GRANT ALL ON public.sales_custom_field_map TO service_role;
ALTER TABLE public.sales_custom_field_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read" ON public.sales_custom_field_map FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sales_cfmap_name ON public.sales_custom_field_map(object_type, name);

CREATE TABLE IF NOT EXISTS public.sales_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step text NOT NULL,
  upserted int,
  errors int,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_sync_log TO authenticated;
GRANT ALL ON public.sales_sync_log TO service_role;
ALTER TABLE public.sales_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read" ON public.sales_sync_log FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sales_sync_log_created ON public.sales_sync_log(created_at DESC);

-- 2. VIEWS
CREATE OR REPLACE VIEW public.v_sales_dials_daily
WITH (security_invoker = on) AS
SELECT
  (c.date_created AT TIME ZONE 'Europe/Berlin')::date AS tag,
  c.user_id,
  max(c.user_name) AS user_name,
  c.outcome_label,
  count(*)::bigint AS anzahl,
  (c.outcome_label IN ('An VZ gescheitert','Entscheider erreicht – EG terminiert','Entscheider erreicht – kein Termin')) AS erreicht
FROM public.sales_calls c
WHERE c.date_created IS NOT NULL
GROUP BY 1,2,4,6;
GRANT SELECT ON public.v_sales_dials_daily TO authenticated;

CREATE OR REPLACE VIEW public.v_sales_funnel_weekly
WITH (security_invoker = on) AS
SELECT
  date_trunc('week', sc.date_changed AT TIME ZONE 'Europe/Berlin')::date AS woche,
  sc.user_id,
  max(sc.user_name) AS user_name,
  sc.new_status_label,
  count(*)::bigint AS eintritte
FROM public.sales_status_changes sc
WHERE sc.pipeline_name = 'Sales' AND sc.date_changed IS NOT NULL
GROUP BY 1,2,4;
GRANT SELECT ON public.v_sales_funnel_weekly TO authenticated;

CREATE OR REPLACE VIEW public.v_sales_funnel_kanal
WITH (security_invoker = on) AS
SELECT
  date_trunc('week', sc.date_changed AT TIME ZONE 'Europe/Berlin')::date AS woche,
  sc.user_id,
  l.kanal,
  o.deal_typ,
  sc.new_status_label,
  count(*)::bigint AS eintritte
FROM public.sales_status_changes sc
LEFT JOIN public.sales_leads l ON l.id = sc.lead_id
LEFT JOIN public.sales_opportunities o ON o.id = sc.opportunity_id
WHERE sc.pipeline_name = 'Sales' AND sc.date_changed IS NOT NULL
GROUP BY 1,2,3,4,5;
GRANT SELECT ON public.v_sales_funnel_kanal TO authenticated;

CREATE OR REPLACE VIEW public.v_sales_quoten
WITH (security_invoker = on) AS
WITH funnel AS (
  SELECT
    date_trunc('week', sc.date_changed AT TIME ZONE 'Europe/Berlin')::date AS woche,
    sc.user_id,
    l.kanal,
    o.deal_typ,
    count(*) FILTER (WHERE sc.new_status_label = 'EG: Gebucht')::numeric AS eg_vereinbart,
    count(*) FILTER (WHERE sc.new_status_label = 'EG: No-Show')::numeric AS eg_no_show,
    count(*) FILTER (WHERE sc.new_status_label = 'EG: Geführt, kein ZG Terminiert')::numeric AS eg_ohne_zg,
    count(*) FILTER (WHERE sc.new_status_label = 'ZG: Gebucht')::numeric AS zg_gebucht,
    count(*) FILTER (WHERE sc.new_status_label = 'ZG: No-Show')::numeric AS zg_no_show,
    count(*) FILTER (WHERE sc.new_status_label = 'ZG: Geführt, nicht abgeschlossen')::numeric AS zg_ohne_abschluss,
    count(*) FILTER (WHERE sc.new_status_label = 'FB: Gebucht')::numeric AS fb_gebucht,
    count(*) FILTER (WHERE sc.new_status_label = 'Won')::numeric AS won,
    count(*) FILTER (WHERE sc.new_status_label = 'Unqualifiziert')::numeric AS unqualifiziert
  FROM public.sales_status_changes sc
  LEFT JOIN public.sales_leads l ON l.id = sc.lead_id
  LEFT JOIN public.sales_opportunities o ON o.id = sc.opportunity_id
  WHERE sc.pipeline_name = 'Sales' AND sc.date_changed IS NOT NULL
  GROUP BY 1,2,3,4
),
dials AS (
  SELECT
    date_trunc('week', c.date_created AT TIME ZONE 'Europe/Berlin')::date AS woche,
    c.user_id,
    count(*)::numeric AS brutto_anwahlen,
    count(*) FILTER (WHERE c.outcome_label IN ('An VZ gescheitert','Entscheider erreicht – EG terminiert','Entscheider erreicht – kein Termin'))::numeric AS erreicht
  FROM public.sales_calls c
  WHERE c.date_created IS NOT NULL
  GROUP BY 1,2
)
SELECT
  f.woche,
  f.user_id,
  f.kanal,
  f.deal_typ,
  d.brutto_anwahlen,
  d.erreicht,
  CASE WHEN COALESCE(d.brutto_anwahlen,0) > 0 THEN d.erreicht / d.brutto_anwahlen END AS erreichbarkeit_pct,
  f.eg_vereinbart,
  (f.eg_ohne_zg + f.zg_gebucht) AS eg_gefuehrt,
  CASE WHEN (f.eg_no_show + f.eg_ohne_zg + f.zg_gebucht) > 0
       THEN f.eg_no_show / (f.eg_no_show + f.eg_ohne_zg + f.zg_gebucht) END AS eg_no_show_rate,
  CASE WHEN (f.eg_ohne_zg + f.zg_gebucht) > 0
       THEN f.zg_gebucht / (f.eg_ohne_zg + f.zg_gebucht) END AS eg_zu_zg,
  (f.zg_ohne_abschluss + f.fb_gebucht + f.won) AS zg_gefuehrt,
  CASE WHEN (f.zg_no_show + f.zg_ohne_abschluss + f.fb_gebucht + f.won) > 0
       THEN f.zg_no_show / (f.zg_no_show + f.zg_ohne_abschluss + f.fb_gebucht + f.won) END AS zg_no_show_rate,
  CASE WHEN (f.zg_ohne_abschluss + f.fb_gebucht + f.won) > 0
       THEN f.won / (f.zg_ohne_abschluss + f.fb_gebucht + f.won) END AS gefuehrt_zu_abschluss,
  f.won,
  f.unqualifiziert
FROM funnel f
LEFT JOIN dials d ON d.woche = f.woche AND d.user_id = f.user_id;
GRANT SELECT ON public.v_sales_quoten TO authenticated;

CREATE OR REPLACE VIEW public.v_sales_deals
WITH (security_invoker = on) AS
SELECT
  date_trunc('month', COALESCE(o.date_won, o.date_created) AT TIME ZONE 'Europe/Berlin')::date AS monat,
  o.id,
  o.lead_id,
  o.lead_name,
  o.closer_id,
  o.setter_id,
  l.kanal,
  o.deal_typ,
  o.leistungen,
  o.laufzeit,
  o.live_datum,
  o.churn_datum,
  o.churn_grund,
  (COALESCE(o.value_cents,0)::numeric / 100.0) AS volumen
FROM public.sales_opportunities o
LEFT JOIN public.sales_leads l ON l.id = o.lead_id
WHERE o.status_type = 'won';
GRANT SELECT ON public.v_sales_deals TO authenticated;

CREATE OR REPLACE VIEW public.v_sales_economics
WITH (security_invoker = on) AS
WITH spend AS (
  SELECT
    date_trunc('week', mi.date_start)::date AS woche,
    l.kanal,
    sum(mi.spend)::numeric AS spend
  FROM public.meta_insights mi
  JOIN public.sales_leads l ON l.campaign_name = mi.campaign_name
  GROUP BY 1,2
),
leads AS (
  SELECT
    date_trunc('week', l.date_created AT TIME ZONE 'Europe/Berlin')::date AS woche,
    l.kanal,
    count(DISTINCT l.id)::numeric AS leads
  FROM public.sales_leads l
  WHERE l.date_created IS NOT NULL
  GROUP BY 1,2
),
funnel AS (
  SELECT
    date_trunc('week', sc.date_changed AT TIME ZONE 'Europe/Berlin')::date AS woche,
    l.kanal,
    count(*) FILTER (WHERE sc.new_status_label = 'EG: Gebucht')::numeric AS eg,
    count(*) FILTER (WHERE sc.new_status_label IN ('EG: Geführt, kein ZG Terminiert','ZG: Gebucht'))::numeric AS eg_gefuehrt,
    count(*) FILTER (WHERE sc.new_status_label = 'Won')::numeric AS won
  FROM public.sales_status_changes sc
  LEFT JOIN public.sales_leads l ON l.id = sc.lead_id
  WHERE sc.pipeline_name = 'Sales' AND sc.date_changed IS NOT NULL
  GROUP BY 1,2
),
umsatz AS (
  SELECT
    date_trunc('week', o.date_won AT TIME ZONE 'Europe/Berlin')::date AS woche,
    l.kanal,
    sum(COALESCE(o.value_cents,0))::numeric / 100.0 AS umsatz
  FROM public.sales_opportunities o
  LEFT JOIN public.sales_leads l ON l.id = o.lead_id
  WHERE o.status_type = 'won' AND o.date_won IS NOT NULL
  GROUP BY 1,2
)
SELECT
  COALESCE(s.woche, le.woche, f.woche, u.woche) AS woche,
  COALESCE(s.kanal, le.kanal, f.kanal, u.kanal) AS kanal,
  COALESCE(s.spend,0) AS spend,
  COALESCE(le.leads,0) AS leads,
  COALESCE(f.eg,0) AS eg,
  COALESCE(f.eg_gefuehrt,0) AS eg_gefuehrt,
  COALESCE(f.won,0) AS won,
  COALESCE(u.umsatz,0) AS umsatz,
  CASE WHEN COALESCE(le.leads,0) > 0 THEN COALESCE(s.spend,0) / le.leads END AS cpl,
  CASE WHEN COALESCE(f.eg,0) > 0 THEN COALESCE(s.spend,0) / f.eg END AS cpsc,
  CASE WHEN COALESCE(f.eg_gefuehrt,0) > 0 THEN COALESCE(s.spend,0) / f.eg_gefuehrt END AS cpscs,
  CASE WHEN COALESCE(f.won,0) > 0 THEN COALESCE(s.spend,0) / f.won END AS cac,
  CASE WHEN COALESCE(s.spend,0) > 0 THEN COALESCE(u.umsatz,0) / s.spend END AS roas
FROM spend s
FULL JOIN leads le ON le.woche = s.woche AND le.kanal IS NOT DISTINCT FROM s.kanal
FULL JOIN funnel f ON f.woche = COALESCE(s.woche, le.woche) AND f.kanal IS NOT DISTINCT FROM COALESCE(s.kanal, le.kanal)
FULL JOIN umsatz u ON u.woche = COALESCE(s.woche, le.woche, f.woche) AND u.kanal IS NOT DISTINCT FROM COALESCE(s.kanal, le.kanal, f.kanal);
GRANT SELECT ON public.v_sales_economics TO authenticated;

-- 3. PERMISSION
INSERT INTO public.app_permissions (permission_key, label, category, description)
VALUES ('sales.kpi.view', 'Sales KPI ansehen', 'Sales', 'Zugriff auf die Sales-KPI-Seite')
ON CONFLICT (permission_key) DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin','sales.kpi.view')
ON CONFLICT DO NOTHING;
