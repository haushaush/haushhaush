import { describe, it, expect } from 'vitest';
import { gewichteterScore } from '@/hooks/useDataSources';

describe('Effizienz-Score', () => {
  it('nimmt fehlende Teilscores aus der Gewichtung und normalisiert die übrigen', () => {
    // A=50 (40 %), B fehlt, C=100 (20 %) → (50·0,4 + 100·0,2) / 0,6 = 67
    expect(gewichteterScore([{ wert: 50, gewicht: 0.4 }, { wert: null, gewicht: 0.4 }, { wert: 100, gewicht: 0.2 }])).toBe(67);
  });
  it('ist nicht berechenbar, wenn kein Teilscore Daten hat', () => {
    expect(gewichteterScore([{ wert: null, gewicht: 0.4 }, { wert: null, gewicht: 0.4 }, { wert: null, gewicht: 0.2 }])).toBeNull();
  });
});
