
-- Add granular per-page permissions so each sidebar element can be toggled individually.
INSERT INTO public.app_permissions (permission_key, label, category, description) VALUES
  ('clients.list.view',          'Kunden – Kundenliste',           'Kunden',   'Zugriff auf /kunden/liste'),
  ('clients.abschluesse.view',   'Kunden – Abschlüsse',            'Kunden',   'Zugriff auf /kunden/abschluesse'),
  ('sales.uebersicht.view',      'Sales – Übersicht',              'Sales',    'Zugriff auf /sales/uebersicht'),
  ('sales.leadquality.view',     'Sales – Lead Quality Audit',     'Sales',    'Zugriff auf /tools/lead-quality-audit'),
  ('paid_ads.view',              'Paid Ads – Übersicht',           'Paid Ads', 'Zugriff auf /paid-ads'),
  ('paid_ads.kunden.view',       'Paid Ads – Kunden',              'Paid Ads', 'Zugriff auf /paid-ads/kunden'),
  ('paid_ads.untermarken.view',  'Paid Ads – Untermarken',         'Paid Ads', 'Zugriff auf /paid-ads/untermarken'),
  ('paid_ads.leadsharks.view',   'Paid Ads – Leadsharks',          'Paid Ads', 'Zugriff auf /paid-ads/leadsharks'),
  ('paid_ads.attentionx.view',   'Paid Ads – AttentionX',          'Paid Ads', 'Zugriff auf /paid-ads/attentionx'),
  ('finanzen.kpi.view',          'Finanzen – KPI',                 'Finanzen', 'Zugriff auf /finanzen/kpi'),
  ('finanzen.rechnungen.view',   'Finanzen – Rechnungen',          'Finanzen', 'Zugriff auf /finanzen/rechnungen'),
  ('finanzen.werbebudgets.view', 'Finanzen – Werbebudgets',        'Finanzen', 'Zugriff auf /finanzen/werbebudgets'),
  ('drive.geteilt.view',         'Dokumente – Geteilt mit mir',    'Drive',    'Zugriff auf /drive/geteilt'),
  ('drive.papierkorb.view',      'Dokumente – Papierkorb',         'Drive',    'Zugriff auf /drive/papierkorb'),
  ('hr.checkins.view',           'Team & HR – Check-in/out',       'Team',     'Zugriff auf /hr/checkins'),
  ('onepage.leads.view',         'Onepage – Kunden',               'Tools',    'Zugriff auf /onepage-leads/kunden'),
  ('email.automatisierung.view', 'E-Mail Automatisierung',         'Tools',    'Zugriff auf /email-automatisierung'),
  ('automationen.n8n.view',      'Automationen – n8n',             'Tools',    'Zugriff auf /automationen/n8n'),
  ('automationen.aria.view',     'FulfillmentOS KI',               'Tools',    'Zugriff auf /automationen/aria')
ON CONFLICT (permission_key) DO UPDATE
  SET label = EXCLUDED.label, category = EXCLUDED.category, description = EXCLUDED.description;

-- Seed role_permissions: preserve current visibility for roles that had the old parent view keys.
-- Admins bypass via has_role, but we seed them anyway for consistency in the UI listing.
INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, k.permission_key
FROM (VALUES
  ('admin'), ('account-manager'), ('setter'), ('mitarbeiter')
) r(role)
CROSS JOIN (VALUES
  ('clients.list.view'), ('clients.abschluesse.view')
) k(permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = r.role AND rp.permission_key = 'clients.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, k.permission_key
FROM (VALUES ('admin'), ('account-manager')) r(role)
CROSS JOIN (VALUES
  ('sales.uebersicht.view'), ('sales.leadquality.view')
) k(permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = r.role AND rp.permission_key = 'sales.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', k.permission_key
FROM (VALUES
  ('paid_ads.view'), ('paid_ads.kunden.view'), ('paid_ads.untermarken.view'),
  ('paid_ads.leadsharks.view'), ('paid_ads.attentionx.view'),
  ('finanzen.kpi.view'), ('finanzen.rechnungen.view'), ('finanzen.werbebudgets.view'),
  ('drive.geteilt.view'), ('drive.papierkorb.view'),
  ('hr.checkins.view'),
  ('onepage.leads.view'), ('email.automatisierung.view'),
  ('automationen.n8n.view'), ('automationen.aria.view')
) k(permission_key)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, k.permission_key
FROM (VALUES ('account-manager'), ('setter'), ('mitarbeiter')) r(role)
CROSS JOIN (VALUES ('drive.geteilt.view'), ('drive.papierkorb.view')) k(permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = r.role AND rp.permission_key = 'drive.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'account-manager', 'hr.checkins.view'
WHERE EXISTS (SELECT 1 FROM public.role_permissions WHERE role='account-manager' AND permission_key='team.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', 'finanzen.kpi.view'
ON CONFLICT DO NOTHING;

-- account-manager already had integrationen.view + slack.view; grant them the new tools children too if desired: only n8n + aria are broadly useful.
INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, k.permission_key
FROM (VALUES ('admin'), ('account-manager'), ('setter'), ('mitarbeiter')) r(role)
CROSS JOIN (VALUES ('automationen.n8n.view'), ('automationen.aria.view')) k(permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = r.role AND rp.permission_key = 'dashboard.view'
)
ON CONFLICT DO NOTHING;
