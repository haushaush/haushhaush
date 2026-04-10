
ALTER TYPE public.team_rolle ADD VALUE IF NOT EXISTS 'Freelancer';

DELETE FROM public.team;

INSERT INTO public.team (notion_id, name, email, rolle, department, abteilung, einstiegsdatum, mitarbeiter_typ, mitarbeiter_status)
VALUES
  ('2279f181-82a0-8074-8e5b-fde9d5e17df2', 'Noah Mrosek',        'noah@viralconnect.de',         'Admin',           'Management',   ARRAY['Media Buying'],  '2023-02-23', 'Management',  'Aktiv'),
  ('2329f181-82a0-80af-83a7-c6833439751d', 'Maximilian Büsse',   'maximilian@haushhaush.de',     'Admin',           'Management',   ARRAY['Media Buying'],  '2023-02-23', 'Management',  'Aktiv'),
  ('2279f181-82a0-80fc-bea9-d89fe08d9f7d', 'Dennis Öztürk',      'dennis@haushhaush.de',         'Account-Manager', 'Tech',         ARRAY['Tech'],          '2023-09-01', 'Fulfillment', 'Aktiv'),
  ('2329f181-82a0-803b-994c-ea4de66db0b0', 'Timo Stich',         'timo@stich.digital',           'Account-Manager', 'Websites',     ARRAY['Websites'],      '2024-01-01', 'Fulfillment', 'Aktiv'),
  ('2479f181-82a0-8039-ba5f-f443bfc01b54', 'Jonas Reller',       'jonas@viralconnect.de',        'Account-Manager', 'Media Buying', ARRAY['Media Buying'],  '2024-06-01', 'Fulfillment', 'Aktiv'),
  ('2499f181-82a0-80f2-901c-d40d4584f721', 'Osman Hanci',        'osman@viralconnect.de',        'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('2329f181-82a0-8042-926b-d1d5738df076', 'Jelle Altmiks',      'jelle@viralconnect.de',        'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('2329f181-82a0-80cb-b63b-c5b1451d6893', 'Manis Achami',       'manis@viralconnect.de',        'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('2329f181-82a0-8051-a870-f2c453552201', 'Thalia Schiedeck',   'thalia@viralconnect.de',       'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('2329f181-82a0-8003-97f0-ce613098fdc0', 'Khalifa Ben Ameur',  'khalifa@viralconnect.de',      'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-lilly',    'Lilly Matejcek',     'lilly@viralconnect.de',        'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-marc',     'Marc Hammer',        'marc@viralconnect.de',         'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-lleyton',  'Lleyton Puls',       'lleyton@viralconnect.de',      'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('closer-marcel',   'Marcel Veit',        'marcel@viralconnect.de',       'Closer',          'Closer',       ARRAY['Closer'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-nico',     'Nico von Engelmann', 'nico@viralconnect.de',         'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-lucian',   'Lucian Ciocea',      'lucian@viralconnect.de',       'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-lara',     'Lara Peter',         'lara@viralconnect.de',         'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-mohammed', 'Mohammed Arkbawi',   'mohammed@viralconnect.de',     'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('setter-samet',    'Samet Karayel',      'samet@viralconnect.de',        'Setter',          'Setter',       ARRAY['Setter'],        '2024-02-01', 'Sales',       'Aktiv'),
  ('intern-antonia',  'Antonia Götte',      'antonia@viralconnect.de',      'Account-Manager', 'Backoffice',   ARRAY['Backoffice'],    '2024-02-01', 'Fulfillment', 'Aktiv'),
  ('intern-olga',     'Olga Buchhaltung',   'buchhaltung@haushaush.de',     'Account-Manager', 'Backoffice',   ARRAY['Backoffice'],    '2024-02-01', 'Fulfillment', 'Aktiv'),
  ('intern-justin',   'Justin Jackstell',   'justin@viralconnect.de',       'Account-Manager', 'Fulfillment',  ARRAY['Operation'],     '2024-02-01', 'Fulfillment', 'Aktiv'),
  ('intern-max-d',    'Max Driesner',       'max.driesner@viralconnect.de', 'Admin',           'Management',   ARRAY['Operation'],     '2024-02-01', 'Management',  'Aktiv');
