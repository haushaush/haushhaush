INSERT INTO public.app_permissions (permission_key, label, category, description)
VALUES ('sales.provisions.view', 'Sales – Provisionen', 'Sales', 'Zugriff auf die Provisionen-Seite unter /sales/provisions')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'sales.provisions.view')
ON CONFLICT DO NOTHING;