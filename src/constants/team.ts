// Shared options for team member create / edit forms.
// IMPORTANT: keep this in sync with the edge function `create-team-member`.

export const DEPARTMENT_OPTIONS = [
  'Management',
  'Sales',
  'Setter',
  'Closer',
  'Fulfillment',
  'Operation',
  'Support',
  'Backoffice',
  'Buchhaltung',
  'Design',
  'Tech',
  'Development',
  'Websites',
  'Media Buying',
  'Foto & Video',
  'Copywriting',
  'Intern',
  'Sonstiges',
] as const;

export const MITARBEITER_TYP_OPTIONS = [
  'Fulfillment',
  'Management',
  'Sales',
] as const;

export const MITARBEITER_STATUS_OPTIONS = [
  'Aktiv',
  'Probezeit',
  'Freelancer',
  'Onboarding',
  'Gekündigt',
] as const;

export const PORTAL_ROLLEN = [
  { value: 'admin', label: 'Admin', desc: 'Vollzugriff auf alles inkl. Finanzen' },
  { value: 'management', label: 'Management', desc: 'Alles außer Kontostand & Bankdaten' },
  { value: 'mitarbeiter', label: 'Mitarbeiter', desc: 'Nur eigene Daten & Aufgaben' },
] as const;
