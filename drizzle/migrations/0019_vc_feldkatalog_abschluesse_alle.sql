CREATE TABLE public.close_vc_feldkatalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  typ text,
  mehrfach boolean NOT NULL DEFAULT false,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.close_vc_feldkatalog TO authenticated;
GRANT ALL ON public.close_vc_feldkatalog TO service_role;
ALTER TABLE public.close_vc_feldkatalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Angemeldete lesen VC-Feldkatalog" ON public.close_vc_feldkatalog FOR SELECT TO authenticated USING (true);

ALTER TABLE public.kunden_laufzeit_stand ADD COLUMN IF NOT EXISTS quelle text, ADD COLUMN IF NOT EXISTS vc_opportunity_id text;

-- Viral Connect opportunities with custom fields resolved by exact field name from Noah's own catalog (never by our field ids).
CREATE OR REPLACE VIEW public.close_vc_abschluesse WITH (security_invoker = true) AS
WITH cf AS (
  SELECT o.id, k.name, o.custom_fields -> k.id AS v
  FROM public.close_opportunities o
  JOIN public.close_vc_feldkatalog k ON o.custom_fields ? k.id
)
SELECT o.id AS close_opportunity_id, o.lead_id AS close_lead_id, o.lead_name, o.client_id, o.status_label, o.status_type AS status_typ,
  COALESCE(o.date_won, o.date_lost, o.date_updated) AS status_geaendert_am,
  COALESCE(o.abschlusswert, (SELECT (v #>> '{}')::numeric FROM cf WHERE cf.id = o.id AND name = 'Abschlusswert' AND jsonb_typeof(v) = 'number')) AS abschlusswert,
  (SELECT (v #>> '{}')::numeric FROM cf WHERE cf.id = o.id AND name IN ('Setup-Fee','Setup Fee') AND jsonb_typeof(v) = 'number' LIMIT 1) AS setup_fee,
  (SELECT (v #>> '{}')::numeric FROM cf WHERE cf.id = o.id AND name IN ('Retainer pro Monat','Retainer') AND jsonb_typeof(v) = 'number' LIMIT 1) AS retainer_monat,
  (SELECT CASE WHEN jsonb_typeof(v) = 'number' THEN (v #>> '{}')::numeric
               WHEN (v #>> '{}') ~ '^\s*\d+\s*(Monat|Monate)?\s*$' THEN substring(v #>> '{}' from '\d+')::numeric END
     FROM cf WHERE cf.id = o.id AND name = 'Laufzeit') AS laufzeit_monate,
  (SELECT CASE WHEN (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}' THEN left(v #>> '{}', 10)::date END FROM cf WHERE cf.id = o.id AND name = 'Startdatum') AS startdatum,
  (SELECT CASE WHEN jsonb_typeof(v) = 'array' THEN (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v) x) ELSE v #>> '{}' END FROM cf WHERE cf.id = o.id AND name = 'Leistungen') AS leistungen,
  (SELECT v #>> '{}' FROM cf WHERE cf.id = o.id AND name IN ('Deal-Typ','Deal Typ') LIMIT 1) AS deal_typ,
  (SELECT v #>> '{}' FROM cf WHERE cf.id = o.id AND name = 'Branche') AS branche,
  o.user_name AS closer
FROM public.close_opportunities o;
GRANT SELECT ON public.close_vc_abschluesse TO authenticated, service_role;

-- Both sources in one list. A VC deal matching one of ours on client + won month + value is shown as duplicate and excluded from sums.
CREATE OR REPLACE VIEW public.close_abschluesse_alle WITH (security_invoker = true) AS
SELECT 'Haush Haush'::text AS quelle, a.close_opportunity_id, a.close_lead_id, a.lead_name, a.client_id, a.status_label, a.status_typ, a.status_geaendert_am,
  a.abschlusswert, a.setup_fee, a.retainer_monat, a.laufzeit_monate, a.startdatum, a.leistungen, a.deal_typ, a.closer, a.setter, a.marke, a.branche,
  NULL::text AS dublette_von
FROM public.close_abschluesse a
UNION ALL
SELECT 'Viral Connect', v.close_opportunity_id, v.close_lead_id, v.lead_name, v.client_id, v.status_label, v.status_typ, v.status_geaendert_am,
  v.abschlusswert, v.setup_fee, v.retainer_monat, v.laufzeit_monate, v.startdatum, v.leistungen, v.deal_typ, v.closer, NULL, 'Viral Connect', v.branche,
  (SELECT a.close_opportunity_id FROM public.close_abschluesse a
    WHERE v.client_id IS NOT NULL AND a.client_id = v.client_id AND a.status_typ = v.status_typ
      AND date_trunc('month', a.status_geaendert_am) = date_trunc('month', v.status_geaendert_am)
      AND a.abschlusswert IS NOT DISTINCT FROM v.abschlusswert LIMIT 1)
FROM public.close_vc_abschluesse v;
GRANT SELECT ON public.close_abschluesse_alle TO authenticated, service_role;