
-- Extend team table with new columns
ALTER TABLE public.team
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS portal_rolle text DEFAULT 'mitarbeiter',
  ADD COLUMN IF NOT EXISTS gehalt numeric,
  ADD COLUMN IF NOT EXISTS gehalt_typ text DEFAULT 'monatlich',
  ADD COLUMN IF NOT EXISTS vertrag_typ text,
  ADD COLUMN IF NOT EXISTS vertrag_beginn date,
  ADD COLUMN IF NOT EXISTS vertrag_ende date,
  ADD COLUMN IF NOT EXISTS probezeit_ende date,
  ADD COLUMN IF NOT EXISTS wochenstunden numeric,
  ADD COLUMN IF NOT EXISTS notizen text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Add new enum values
ALTER TYPE public.team_rolle ADD VALUE IF NOT EXISTS 'Management';
ALTER TYPE public.team_rolle ADD VALUE IF NOT EXISTS 'Fulfillment';

-- Seed team members
INSERT INTO public.team (name, email, rolle, position, portal_rolle, abteilung, mitarbeiter_typ, mitarbeiter_status, startdatum)
VALUES
  ('Dennis Öztürk', 'dennis@viralconnect.de', 'Admin', 'Head of Development', 'admin', ARRAY['Development','Tech'], 'Management', 'Aktiv', '2023-01-01'),
  ('Maximilian Büsse', 'maximilian@haushaush.de', 'Admin', 'CEO, Head of Fulfillment', 'admin', ARRAY['Operation','Media Buying'], 'Management', 'Aktiv', '2023-01-01'),
  ('Noah Mrosek', 'noah@viralconnect.de', 'Admin', 'CEO, Head of Sales', 'admin', ARRAY['Sales'], 'Management', 'Aktiv', '2023-01-01'),
  ('Justin Jackstell', 'justin@viralconnect.de', 'Account-Manager', 'Customer Success', 'management', ARRAY['Support'], 'Management', 'Aktiv', '2023-06-01'),
  ('Lilly Matejcek', 'lilly@viralconnect.de', 'Setter', 'Grafikdesign', 'mitarbeiter', ARRAY['Design'], 'Fulfillment', 'Aktiv', '2024-02-01'),
  ('Lleyton Puls', 'lleyton@viralconnect.de', 'Setter', 'Setter', 'mitarbeiter', ARRAY['Setter'], 'Sales', 'Aktiv', '2024-02-01'),
  ('Manis Achhami', 'manis@viralconnect.de', 'Setter', 'Vorqualifikation', 'mitarbeiter', ARRAY['Support'], 'Sales', 'Aktiv', '2024-02-01'),
  ('Marc Hammer', 'marc@viralconnect.de', 'Setter', 'Cold Calling', 'mitarbeiter', ARRAY['Sales'], 'Sales', 'Aktiv', '2024-02-01'),
  ('Marcel Veit', 'marcel@viralconnect.de', 'Closer', 'Cold Calling', 'mitarbeiter', ARRAY['Sales'], 'Sales', 'Aktiv', '2024-02-01'),
  ('Nico von Engelmann', 'nico@viralconnect.de', 'Setter', 'Setter', 'mitarbeiter', ARRAY['Setter'], 'Sales', 'Aktiv', '2024-02-01'),
  ('Khalifa Ben Amor', 'khalifa@viralconnect.de', 'Setter', 'Development', 'mitarbeiter', ARRAY['Development'], 'Fulfillment', 'Aktiv', '2024-02-01'),
  ('Lara Peter', 'lara@viralconnect.de', 'Setter', 'Account Setups', 'mitarbeiter', ARRAY['Operation'], 'Fulfillment', 'Aktiv', '2024-03-01'),
  ('Lucian Ciocea', 'lucian@viralconnect.de', 'Setter', 'Webdesign', 'mitarbeiter', ARRAY['Websites'], 'Fulfillment', 'Aktiv', '2024-02-01'),
  ('Mohammed Abakar', 'mohammed@viralconnect.de', 'Setter', 'Development', 'mitarbeiter', ARRAY['Development'], 'Fulfillment', 'Aktiv', '2024-02-01'),
  ('Samet Karayel', 'samet@viralconnect.de', 'Setter', 'Media Buying', 'mitarbeiter', ARRAY['Media Buying'], 'Fulfillment', 'Aktiv', '2024-02-01'),
  ('Antonia Götte', 'antonia@viralconnect.de', 'Setter', 'Buchhaltung', 'mitarbeiter', ARRAY['Backoffice'], 'Fulfillment', 'Aktiv', '2025-03-01'),
  ('Olga', 'buchhaltung@haushaush.de', 'Setter', 'Buchhaltung', 'mitarbeiter', ARRAY['Backoffice'], 'Fulfillment', 'Aktiv', '2025-03-01'),
  ('Osman Hanci', 'osman@viralconnect.de', 'Setter', 'Webdesign', 'mitarbeiter', ARRAY['Websites'], 'Fulfillment', 'Aktiv', '2024-06-01'),
  ('Thalia Schiedeck', 'thalia@viralconnect.de', 'Setter', 'Account Setups', 'mitarbeiter', ARRAY['Operation'], 'Fulfillment', 'Aktiv', '2024-06-01'),
  ('Jelle Altmiks', 'jelle@viralconnect.de', 'Setter', 'Foto & Video', 'mitarbeiter', ARRAY['Foto & Video'], 'Fulfillment', 'Aktiv', '2024-06-01')
ON CONFLICT (email) DO UPDATE SET
  position = EXCLUDED.position,
  portal_rolle = EXCLUDED.portal_rolle,
  abteilung = EXCLUDED.abteilung,
  mitarbeiter_typ = EXCLUDED.mitarbeiter_typ,
  mitarbeiter_status = EXCLUDED.mitarbeiter_status;

-- Add Max Driesner separately
INSERT INTO public.team (name, email, rolle, position, portal_rolle, abteilung, mitarbeiter_typ, mitarbeiter_status, startdatum)
VALUES ('Max Driesner', 'max.driesner@viralconnect.de', 'Admin', 'Gesellschafter / Strategy', 'admin', ARRAY['Operation'], 'Management', 'Aktiv', '2023-01-01')
ON CONFLICT (email) DO UPDATE SET position = EXCLUDED.position, portal_rolle = EXCLUDED.portal_rolle;
