// Canonical Branchen-Map mit Aliasen für Filter, Display & Import
export interface BrancheCanonical {
  id: string;       // canonical key, lowercase
  label: string;    // display name (lang)
  short: string;    // abbreviation
  aliases: string[];
}

export const BRANCHEN: BrancheCanonical[] = [
  { id: 'pkv', label: 'Private Krankenversicherung', short: 'PKV',
    aliases: ['pkv', 'private krankenversicherung', 'private kranken', 'krankenversicherung', 'private kv',
      'beihilfe', 'beihilfe - pkv', 'beihilfe-pkv', 'beihilfe pkv'] },
  { id: 'bu', label: 'Berufsunfähigkeitsversicherung', short: 'BU',
    aliases: ['bu', 'berufsunfähigkeit', 'berufsunfähigkeitsversicherung',
      'berufsunfaehigkeit', 'berufsunfaehigkeitsversicherung', 'berufsunfähigkeits-versicherung'] },
  { id: 'zz', label: 'Zahnzusatzversicherung', short: 'ZZ',
    aliases: ['zz', 'zahnzusatz', 'zahnzusatzversicherung', 'zahn', 'zahnversicherung'] },
  { id: 'rs', label: 'Rechtsschutzversicherung', short: 'RS',
    aliases: ['rs', 'rechtsschutz', 'rechtsschutzversicherung'] },
  { id: 'tkv', label: 'Tierkrankenversicherung', short: 'TKV',
    aliases: ['tkv', 'tier', 'tierkranken', 'tierkrankenversicherung', 'tierversicherung',
      'hundeversicherung', 'katzenversicherung', 'hund', 'katze'] },
  { id: 'uv', label: 'Unfallversicherung', short: 'UV',
    aliases: ['uv', 'unfall', 'unfallversicherung'] },
  { id: 'kfz', label: 'KFZ-Versicherung', short: 'KFZ',
    aliases: ['kfz', 'kfz-versicherung', 'kfzversicherung', 'auto', 'autoversicherung'] },
  { id: 'wohngebaeude', label: 'Wohngebäudeversicherung', short: 'Wohngebäude',
    aliases: ['wohngebäude', 'wohngebaeude', 'wohngebäudeversicherung', 'wohngebaeudeversicherung', 'gebäudeversicherung'] },
  { id: 'hausrat', label: 'Hausratversicherung', short: 'Hausrat',
    aliases: ['hausrat', 'hausratversicherung'] },
  { id: 'lebensversicherung', label: 'Lebensversicherung', short: 'Leben',
    aliases: ['leben', 'lebensversicherung', 'lv', 'risikolebensversicherung', 'risikoleben', 'rlv'] },
  { id: 'rente', label: 'Rentenversicherung', short: 'Rente',
    aliases: ['rente', 'rentenversicherung', 'riester', 'riesterrente', 'riester-rente',
      'rürup', 'ruerup', 'basisrente', 'private rente'] },
  { id: 'haftpflicht', label: 'Haftpflichtversicherung', short: 'PHV',
    aliases: ['haftpflicht', 'haftpflichtversicherung', 'phv', 'private haftpflicht'] },
  { id: 'gewerbe', label: 'Gewerbeversicherung', short: 'Gewerbe',
    aliases: ['gewerbe', 'gewerbeversicherung', 'gewerbliche versicherung', 'business', 'firmenversicherung'] },
  { id: 'baufinanzierung', label: 'Baufinanzierung', short: 'Bauf.',
    aliases: ['baufinanzierung', 'immobilienfinanzierung', 'baufi'] },
  { id: 'investment', label: 'Investment & Vermögensaufbau', short: 'Invest',
    aliases: ['investment', 'investments', 'vermögensaufbau', 'depot', 'etf', 'aktien', 'fonds'] },
  { id: 'photovoltaik', label: 'Photovoltaik', short: 'PV',
    aliases: ['photovoltaik', 'pv', 'solar', 'solaranlage', 'solarversicherung'] },
  { id: 'pflege', label: 'Pflegeversicherung', short: 'Pflege',
    aliases: ['pflege', 'pflegeversicherung', 'pflegetagegeld'] },
  { id: 'sonstige', label: 'Sonstige', short: 'Sonstige',
    aliases: ['sonstige', 'sonstiges', 'andere', 'other', 'misc'] },
];

const aliasToId = new Map<string, string>();
for (const b of BRANCHEN) {
  for (const a of b.aliases) aliasToId.set(a.toLowerCase().trim(), b.id);
  aliasToId.set(b.id, b.id);
  aliasToId.set(b.label.toLowerCase(), b.id);
  aliasToId.set(b.short.toLowerCase(), b.id);
}

export function normalizeBranche(raw: unknown): string | null {
  if (raw == null) return null;
  const str = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw);
  if (!str) return null;
  const n = str.toLowerCase().trim().replace(/\s+/g, ' ');
  return aliasToId.get(n) ?? null;
}

export function getBranche(id: string | null | undefined): BrancheCanonical | null {
  if (!id) return null;
  return BRANCHEN.find(b => b.id === id) ?? null;
}

export function getBrancheLabel(id: string | null | undefined, format: 'short' | 'long' = 'long'): string {
  if (!id) return 'Unbekannt';
  const b = getBranche(id);
  if (!b) return id;
  return format === 'short' ? b.short : b.label;
}

export function getBrancheDisplay(raw: string | null | undefined, format: 'short' | 'long' = 'short'): string | null {
  if (!raw) return null;
  const id = normalizeBranche(raw);
  if (id) return getBrancheLabel(id, format);
  return raw.trim() || null;
}
