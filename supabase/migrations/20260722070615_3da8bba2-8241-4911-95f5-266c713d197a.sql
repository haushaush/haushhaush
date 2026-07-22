INSERT INTO public.app_permissions (permission_key, label, category, description)
VALUES ('sales.referenzen.manage', 'Referenzen verwalten', 'Sales', 'Anzeigen, Kampagnen und Websites im Referenz-Showcase hinzufügen, importieren und zuordnen')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'sales.referenzen.manage')
ON CONFLICT DO NOTHING;