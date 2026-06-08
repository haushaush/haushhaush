export interface BrancheAlias {
  /** Canonical long-form label shown in the filter UI. */
  canonical: string;
  /** Short form shown as sub-label in the filter. */
  shortName?: string;
  /** All spellings that get folded into this canonical (incl. canonical itself). */
  aliases: string[];
}

export const BRANCHE_ALIASES: BrancheAlias[] = [
  {
    canonical: 'Private Krankenversicherung',
    shortName: 'PKV',
    aliases: ['Private Krankenversicherung', 'PKV', 'pkv', 'Private KV', 'Privatkrankenversicherung'],
  },
  {
    canonical: 'Tierkrankenversicherung',
    shortName: 'TKV',
    aliases: ['Tierkrankenversicherung', 'TKV', 'tkv', 'Tier-KV', 'Tierversicherung', 'Haustierversicherung'],
  },
  {
    canonical: 'Rechtsschutzversicherung',
    shortName: 'RS',
    aliases: ['Rechtsschutzversicherung', 'Rechtsschutz', 'RS', 'rs', 'RSV'],
  },
  {
    canonical: 'Berufsunfähigkeitsversicherung',
    shortName: 'BU',
    aliases: ['Berufsunfähigkeitsversicherung', 'BU', 'bu', 'Berufsunfähigkeit'],
  },
  {
    canonical: 'Haftpflichtversicherung',
    shortName: 'HP',
    aliases: ['Haftpflichtversicherung', 'Haftpflicht', 'Privathaftpflicht', 'PHV'],
  },
  {
    canonical: 'Unfallversicherung',
    shortName: 'UV',
    aliases: ['Unfallversicherung', 'Unfall', 'UV'],
  },
  {
    canonical: 'Kinderversicherung',
    shortName: 'KV',
    aliases: ['Kinderversicherung', 'Kindervorsorge', 'Kinder'],
  },
  {
    canonical: 'Photovoltaik',
    aliases: ['Photovoltaik', 'PV'],
  },
  {
    canonical: 'Aviation',
    aliases: ['Aviation', 'Luftfahrt'],
  },
  {
    canonical: 'Sterbegeldversicherung',
    shortName: 'SG',
    aliases: ['Sterbegeldversicherung', 'Sterbegeld'],
  },
];

const ALIAS_LOOKUP: Map<string, BrancheAlias> = (() => {
  const m = new Map<string, BrancheAlias>();
  for (const group of BRANCHE_ALIASES) {
    for (const a of group.aliases) m.set(a.trim().toLowerCase(), group);
  }
  return m;
})();

/** Fold any raw branche spelling onto its canonical label. Unknown values pass through unchanged. */
export function getCanonicalBranche(rawBranche: string | null | undefined): string {
  const normalized = (rawBranche ?? '').toString().trim();
  if (!normalized) return normalized;
  const hit = ALIAS_LOOKUP.get(normalized.toLowerCase());
  return hit?.canonical ?? normalized;
}

export function getBrancheAliases(canonical: string): string[] {
  const group = BRANCHE_ALIASES.find(g => g.canonical === canonical);
  return group?.aliases ?? [canonical];
}

export function getBrancheShortName(canonical: string): string | undefined {
  return BRANCHE_ALIASES.find(g => g.canonical === canonical)?.shortName;
}
