
-- Allow NULL emails for team members without email
ALTER TABLE public.team ALTER COLUMN email DROP NOT NULL;

-- Wipe and re-seed
TRUNCATE public.team RESTART IDENTITY CASCADE;

INSERT INTO public.team (notion_id, name, email, telefonnummer, abteilung, mitarbeiter_typ, rolle, vertrag_typ, mitarbeiter_status, verfuegbarkeit_h_woche, einstiegsdatum, nda_unterschrieben, onboarding_abgeschlossen, department)
VALUES
  ('2279f181-82a0-8074-8e5b-fde9d5e17df2', 'Noah Mrosek',        NULL, NULL, ARRAY['Media Buying'],  'Management',   'Admin',           'GF',         'Aktiv', NULL, '2023-02-23', true,  true,  'Media Buying'),
  ('2329f181-82a0-80af-83a7-c6833439751d', 'Maximilian Büsse',   'maximilian@haushhaush.de', NULL, ARRAY['Media Buying'],  'Management',   'Admin',           'GF',         'Aktiv', 70,   '2023-02-23', true,  true,  'Media Buying'),
  ('2279f181-82a0-80fc-bea9-d89fe08d9f7d', 'Dennis Öztürk',      'dennis@haushhaush.de', NULL, ARRAY['Tech'],          'Fulfillment',  'Admin',           'Vollzeit',   'Aktiv', 40,   '2023-09-01', true,  true,  'Tech'),
  ('2329f181-82a0-803b-994c-ea4de66db0b0', 'Timo Stich',         'timo@stich.digital', NULL, ARRAY['Websites'],      'Fulfillment',  'Setter',          'Freelancer', 'Aktiv', 10,   '2024-01-01', true,  true,  'Websites'),
  ('2479f181-82a0-8039-ba5f-f443bfc01b54', 'Jonas Reller',       NULL, NULL, ARRAY['Media Buying'],  'Fulfillment',  'Account-Manager', 'Vollzeit',   'Aktiv', NULL, '2024-06-01', true,  true,  'Media Buying'),
  ('2499f181-82a0-80f2-901c-d40d4584f721', 'Osman Hanci',        NULL, NULL, ARRAY['Setter'],        'Sales',        'Setter',          'Teilzeit',   'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('2329f181-82a0-8042-926b-d1d5738df076', 'Jelle Altmiks',      'jelle@viralconnect.de', NULL, ARRAY['Setter'],        'Sales',        'Setter',          'Minijob',    'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('2329f181-82a0-80cb-b63b-c5b1451d6893', 'Manis Achami',       'manis@viralconnect.de', NULL, ARRAY['Setter'],        'Sales',        'Setter',          'Minijob',    'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('2329f181-82a0-8051-a870-f2c453552201', 'Thalia Schiedeck',   'thalia@viralconnect.de', NULL, ARRAY['Setter'],       'Sales',        'Setter',          'Minijob',    'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('2329f181-82a0-8003-97f0-ce613098fdc0', 'Khalifa Ben Ameur',  'khalifa@viralconnect.de', NULL, ARRAY['Setter'],      'Sales',        'Setter',          'Minijob',    'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-lilly',    'Lilly Matejcek',     'lilly@viralconnect.de', NULL, ARRAY['Setter'],     'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-marc',     'Marc Hammer',        'marc@viralconnect.de', NULL, ARRAY['Setter'],     'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-lleyton',  'Lleyton Puls',       'lleyton@viralconnect.de', NULL, ARRAY['Setter'],  'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-nico',     'Nico von Engelmann', 'nico@viralconnect.de', NULL, ARRAY['Setter'],     'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-lucian',   'Lucian Ciocea',      'lucian@viralconnect.de', NULL, ARRAY['Setter'],   'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-lara',     'Lara Peter',         'lara@viralconnect.de', NULL, ARRAY['Setter'],     'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-mohammed', 'Mohammed Arkbawi',   'mohammed@viralconnect.de', NULL, ARRAY['Setter'], 'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-samet',    'Samet Karayel',      'samet@viralconnect.de', NULL, ARRAY['Setter'],    'Sales',       'Setter',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Setter'),
  ('fulfillment-marcel',   'Marcel Veit',        'marcel@viralconnect.de', NULL, ARRAY['Closer'],   'Sales',       'Closer',   'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Closer'),
  ('fulfillment-antonia',  'Antonia Götte',      'antonia@viralconnect.de', NULL, ARRAY['Backoffice'], 'Fulfillment', 'Setter', 'Minijob',  'Aktiv', NULL, '2024-02-01', true,  true,  'Backoffice'),
  ('fulfillment-olga',     'Olga',               'buchhaltung@haushaush.de', NULL, ARRAY['Backoffice'], 'Fulfillment', 'Setter', 'Teilzeit', 'Aktiv', NULL, '2024-02-01', false, false, 'Backoffice'),
  ('fulfillment-justin',   'Justin Jackstell',   NULL, NULL, ARRAY['Fulfillment'], 'Fulfillment', 'Account-Manager', 'Vollzeit', 'Aktiv', NULL, '2024-02-01', true,  true,  'Fulfillment'),
  ('fulfillment-max-d',    'Max Driesner',       'max.driesner@viralconnect.de', NULL, ARRAY['Operation'], 'Management', 'Admin', 'Vollzeit', 'Aktiv', NULL, '2024-02-01', true,  true,  'Operation');
