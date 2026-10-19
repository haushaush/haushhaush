// Same name matching as `namensTreffer` in src/lib/kundenVerknuepfungen.ts (edge functions cannot import src/).
// Keep both copies identical so cash clarification suggestions agree with the customer link suggestions.
const STOP = new Set(['gmbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'mbh', 'co', 'und', 'the', 'der', 'die', 'das', 'von', 'haftungsbeschraenkt', 'ek', 'inh']);
const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string | null | undefined) => new Set(norm(s || '').split(' ').filter(t => t.length >= 3 && !STOP.has(t)));
export function namensTreffer(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const shared = [...A].filter(t => B.has(t));
  if (!shared.some(t => t.length >= 4)) return 0;
  const score = shared.length / Math.min(A.size, B.size);
  return shared.some(t => t.length >= 6) && score >= 0.5 ? Math.max(score, 0.6) : score;
}
