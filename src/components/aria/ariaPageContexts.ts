export interface PageContext {
  name: string;
  focus: string;
  suggested_actions: string[];
}

const PAGE_CONTEXTS: Record<string, PageContext> = {
  '/': {
    name: 'Dashboard / Übersicht',
    focus: 'Gesamtüberblick der Agentur — KPIs, Aufgaben, Abschlüsse, Handlungsbedarf',
    suggested_actions: ['KPIs ansehen', 'Offene Aufgaben', 'Letzte Abschlüsse', 'Handlungsbedarf'],
  },
  '/kunden': {
    name: 'Kunden / CRM',
    focus: 'Kundenverwaltung, Deals, Pipeline, Abschlüsse',
    suggested_actions: ['Neuen Kunden anlegen', 'Ampelstatus ändern', 'Laufzeit prüfen', 'Deal suchen'],
  },
  '/kunden/pipeline': {
    name: 'Sales Pipeline',
    focus: 'Aktive Deals in verschiedenen Pipeline-Stufen',
    suggested_actions: ['Deal voranbringen', 'Followup erstellen', 'Pipeline-Status'],
  },
  '/kunden/abschluesse': {
    name: 'Abschlüsse',
    focus: 'Finalisierte Deals und Vertragsabschlüsse',
    suggested_actions: ['Abschluss details', 'Rechnung erstellen', 'Onboarding starten'],
  },
  '/projekte': {
    name: 'Projekte & Aufgaben',
    focus: 'Aufgabenverwaltung, Projektfortschritt, Deadlines',
    suggested_actions: ['Neue Aufgabe', 'Überfällige Aufgaben', 'Aufgabe zuweisen'],
  },
  '/projekte/aufgaben': {
    name: 'Aufgaben',
    focus: 'Offene und überfällige Aufgaben des Teams',
    suggested_actions: ['Aufgabe erstellen', 'Als erledigt markieren', 'Deadline verschieben'],
  },
  '/sales': {
    name: 'Sales',
    focus: 'Vertriebsperformance, KPIs, Leaderboard',
    suggested_actions: ['KPIs diese Woche', 'Top Setter', 'Call loggen', 'Terminquote'],
  },
  '/sales/kpis': {
    name: 'Sales KPIs & Leaderboard',
    focus: 'Detaillierte Setter-Performance, Calls, TQ, Show-ups, Closes',
    suggested_actions: ['Wer hat die meisten Calls?', 'Terminquote vergleichen', 'KPIs eintragen'],
  },
  '/sales/vorquali': {
    name: 'Vorqualifikation',
    focus: 'Telefonische Vorqualifizierung von Leads',
    suggested_actions: ['Vorquali-Quote', 'Leads heute', 'Setter vergleichen'],
  },
  '/sales/coldmail': {
    name: 'Cold Mail',
    focus: 'Outreach Emails, Response Rates, Kampagnen',
    suggested_actions: ['Öffnungsrate', 'Antworten diese Woche', 'Neue Kampagne'],
  },
  '/fulfillment': {
    name: 'Fulfillment',
    focus: 'Kundenbetreuung, Ad Performance, Media Buying',
    suggested_actions: ['Ad Spend Übersicht', 'CPL prüfen', 'Ampel Rot Kunden'],
  },
  '/fulfillment/ads': {
    name: 'Ad Performance',
    focus: 'Meta Ads Performance aller Kundenaccounts — CPL, Spend, Leads',
    suggested_actions: ['Welcher Kunde hat den besten CPL?', 'Ad Spend heute', 'Kampagne pausieren'],
  },
  '/finanzen': {
    name: 'Finanzen',
    focus: 'MRR, ARR, Cashflow, Rechnungsübersicht',
    suggested_actions: ['MRR aktuell', 'Offene Rechnungen', 'Cash Collect', 'Umsatz Monat'],
  },
  '/finanzen/rechnungen': {
    name: 'Rechnungen / Faktura',
    focus: 'Alle Rechnungen — offen, bezahlt, überfällig. Neue Rechnungen erstellen.',
    suggested_actions: ['Welche Rechnungen sind offen?', 'Überfällige anzeigen', 'Neue Rechnung erstellen'],
  },
  '/finanzen/belege': {
    name: 'Belege',
    focus: 'Ausgaben, Belege, Buchhaltungsunterlagen',
    suggested_actions: ['Beleg hochladen', 'Ausgaben Monat', 'Kategorie filtern'],
  },
  '/finanzen/buchhaltung': {
    name: 'Buchhaltung / Qonto',
    focus: 'Kontostand, Transaktionen, Qonto-Integration',
    suggested_actions: ['Kontostand', 'Letzte Transaktionen', 'Monatsumsatz'],
  },
  '/hr': {
    name: 'Team & HR',
    focus: 'Mitarbeiterverwaltung, Verträge, Akademie, Coaching',
    suggested_actions: ['Teamübersicht', 'Offene HR-Anfragen', 'Akademie Fortschritt'],
  },
  '/hr/mitarbeiter': {
    name: 'Mitarbeiter',
    focus: 'Alle Teammitglieder, Rollen, Abteilungen, Status',
    suggested_actions: ['Wer ist im Sales Team?', 'Neuen Mitarbeiter anlegen', 'Mitarbeiter suchen'],
  },
  '/hr/akademie': {
    name: 'Vertriebsakademie',
    focus: 'Interne Akademie — Kursfortschritt, Module, Kapitel',
    suggested_actions: ['Fortschritt Setter', 'Welches Modul als nächstes?', 'Akademie Status'],
  },
  '/hr/coaching': {
    name: 'Coaching',
    focus: 'Call-Coaching, Feedback-Sessions, Bewertungen',
    suggested_actions: ['Letzte Coaching-Session', 'Feedback erstellen', 'Score Übersicht'],
  },
  '/aria': {
    name: 'ARIA & Automationen',
    focus: 'Automationen verwalten, erstellen, ausführen',
    suggested_actions: ['Alle Automationen', 'Neue Automation', 'Letzte Ausführungen'],
  },
  '/einstellungen': {
    name: 'Einstellungen',
    focus: 'Integrationen, API, Nutzer, App-Konfiguration',
    suggested_actions: ['Slack Webhook', 'API Keys', 'Integrationen prüfen'],
  },
  '/nachrichten': {
    name: 'Nachrichten',
    focus: 'Interne Benachrichtigungen, E-Mails, Slack-Nachrichten',
    suggested_actions: ['Ungelesene Nachrichten', 'Nachricht senden', 'Archiv'],
  },
};

export function getCurrentPageContext(pathname: string): PageContext {
  if (PAGE_CONTEXTS[pathname]) return PAGE_CONTEXTS[pathname];
  const prefix = Object.keys(PAGE_CONTEXTS)
    .filter(key => pathname.startsWith(key) && key !== '/')
    .sort((a, b) => b.length - a.length)[0];
  return PAGE_CONTEXTS[prefix] || {
    name: pathname,
    focus: 'Allgemeiner Bereich',
    suggested_actions: [],
  };
}
