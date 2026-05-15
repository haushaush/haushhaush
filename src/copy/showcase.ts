// Centralized copy for the Referenz-Showcase surface area.
// One source of truth → high-end, brand-consistent wording.

export const SHOWCASE_COPY = {
  overview: {
    title: 'Referenzen',
    description: 'Eine Auswahl an Projekten und Kampagnen, die für sich sprechen.',
  },

  websites: {
    title: 'Websites',
    description: 'Landingpages und Webauftritte, gebaut für Performance.',
    emptyTitle: 'Noch keine Websites',
    emptyDescription: 'Die erste Landingpage wartet darauf, vorgezeigt zu werden.',
    addLabel: 'Neue Website',
    addFirstLabel: 'Erste Website hinzufügen',
  },

  werbeanzeigen: {
    title: 'Anzeigen',
    description: 'Die besten Creatives unserer Kampagnen — direkt aus Meta.',
    emptyTitle: 'Keine Anzeigen importiert',
    emptyDescription: 'Aktiviere die Meta-Verbindung und importiere deine Top-Creatives in einem Schwung.',
    importLabel: 'Importieren',
    importFirstLabel: 'Erste Anzeigen importieren',
    enrichLabel: 'Automatisch anreichern',
  },

  adPerformance: {
    title: 'Kampagnen',
    description: 'Echte Ergebnisse. Echte Zahlen. Keine Schönfärberei.',
    emptyTitle: 'Noch keine Kampagnen',
    emptyDescription: 'Verbinde dein Meta-Konto, um Performance zu importieren.',
    importLabel: 'Kampagnen importieren',
    importFirstLabel: 'Erste Kampagne importieren',
  },

  categories: {
    websites: {
      label: 'Websites',
      description: 'Landingpages und Webauftritte',
    },
    werbeanzeigen: {
      label: 'Anzeigen',
      description: 'Creatives aus Meta',
    },
    adPerformance: {
      label: 'Kampagnen',
      description: 'Performance mit Zahlen',
    },
  },
} as const;
