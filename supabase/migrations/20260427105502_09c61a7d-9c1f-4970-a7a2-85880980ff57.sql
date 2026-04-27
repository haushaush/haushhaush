-- 1. Erweiterungen onepage_project_leads für CSV-Import-Mapping
ALTER TABLE public.onepage_project_leads
  ADD COLUMN IF NOT EXISTS vorname text,
  ADD COLUMN IF NOT EXISTS nachname text,
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS nachricht text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS imported_via text;

-- Dedupe-Index (project + email + received_at)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_onepage_lead_dedupe
  ON public.onepage_project_leads (project_id, lower(email), received_at)
  WHERE email IS NOT NULL;

-- 2. Eindeutiger Projektname
ALTER TABLE public.onepage_projects
  DROP CONSTRAINT IF EXISTS onepage_projects_name_key;
ALTER TABLE public.onepage_projects
  ADD CONSTRAINT onepage_projects_name_key UNIQUE (name);

-- 3. Stats-View
CREATE OR REPLACE VIEW public.onepage_projects_with_stats AS
SELECT
  p.id, p.name, p.page_url, p.status, p.client_id, p.notes,
  p.webhook_secret, p.created_by, p.created_at, p.updated_at,
  COUNT(l.id)::int AS lead_count_total,
  COUNT(l.id) FILTER (WHERE l.received_at > now() - interval '7 days')::int  AS lead_count_7d,
  COUNT(l.id) FILTER (WHERE l.received_at > now() - interval '30 days')::int AS lead_count_30d,
  MAX(l.received_at) AS last_lead_at
FROM public.onepage_projects p
LEFT JOIN public.onepage_project_leads l ON l.project_id = p.id
GROUP BY p.id;

GRANT SELECT ON public.onepage_projects_with_stats TO authenticated;

-- 4. Bulk-Seed (idempotent)
INSERT INTO public.onepage_projects (name, status) VALUES
  ('Marvin Rixen BU',                       'active'),
  ('Marvin Rixen & Marcel Utsch | PKV',     'active'),
  ('Marco Linsenmeier PKV',                 'active'),
  ('Henrik Johannsen PKV',                  'active'),
  ('Amadeus Schröter KFZ',                  'active'),
  ('Oliver Slawik',                         'active'),
  ('Breuer & Marquart',                     'active'),
  ('Oliver Buchwald Sportler BU',           'active'),
  ('Senne Handels GbR',                     'active'),
  ('Haustierversichert',                    'active'),
  ('PKV für Deutschland',                   'active'),
  ('Selena Höge',                           'active'),
  ('Stephan Nette',                         'active'),
  ('Thie Group',                            'active'),
  ('Robert Loos',                           'active'),
  ('Alexander Lichtner',                    'active'),
  ('Rechtsschutzritter.de',                 'active'),
  ('Unfallschutz-Direkt.de',                'active'),
  ('Peter Misch',                           'active'),
  ('Christian Reichert',                    'active'),
  ('Leadsharks.de',                         'active')
ON CONFLICT (name) DO NOTHING;

-- 5. URL-Vorbefüllung
UPDATE public.onepage_projects SET page_url = 'https://rechtsschutzritter.de'
  WHERE name = 'Rechtsschutzritter.de' AND (page_url IS NULL OR page_url = '');
UPDATE public.onepage_projects SET page_url = 'https://unfallschutz-direkt.de'
  WHERE name = 'Unfallschutz-Direkt.de' AND (page_url IS NULL OR page_url = '');
UPDATE public.onepage_projects SET page_url = 'https://leadsharks.de'
  WHERE name = 'Leadsharks.de' AND (page_url IS NULL OR page_url = '');