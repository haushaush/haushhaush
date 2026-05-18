/**
 * Phase D helpers: FK-first display for showcase / ad / website items.
 * Reads new FK joins (linked_client / linked_branche / linked_unternehmen)
 * with full legacy fallback so existing rows keep rendering.
 */

import { getBranche as getBrancheById } from '@/lib/branchen';

// PostgREST embed snippets — disambiguated via FK column to avoid ambiguity
// with the legacy `linked_kunde:close_deals(...)` join that still ships.
export const FK_EMBED_CLIENT =
  'linked_client:clients!linked_client_id(id, name, branche, unternehmen:unternehmen_id(id, display_name, name))';
export const FK_EMBED_UNTERNEHMEN =
  'linked_unternehmen:unternehmen!linked_unternehmen_id(id, name, display_name)';

// NOTE: `branchen` is NOT a DB table — branches live as a TS constant in src/lib/branchen.ts.
// `linked_branche_id` is a plain TEXT column holding the canonical branche id and is read directly.
export const FK_EMBED_ALL = `linked_branche_id, ${FK_EMBED_CLIENT}, ${FK_EMBED_UNTERNEHMEN}`;

const trimOrNull = (v: any): string | null => {
  if (Array.isArray(v)) v = v[0];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
};

/** Display label for branche — prefers FK, falls back to legacy text. */
export function pickBrancheLabel(i: any): string | null {
  const fk = i?.linked_branche;
  if (fk) return trimOrNull(fk.display_name) ?? trimOrNull(fk.name);
  const fromClientFk = i?.linked_client?.branche;
  if (fromClientFk) {
    const id = trimOrNull(fromClientFk);
    if (id) {
      const b = getBrancheById(id);
      if (b) return b.label;
    }
  }
  return (
    trimOrNull(i?.linked_kunde?.branche) ??
    trimOrNull(i?.filter_values?.branche) ??
    trimOrNull(i?.branche) ??
    null
  );
}

/** Normalized (lowercased) branche value for filter comparisons. */
export function pickBrancheValue(i: any): string | null {
  const fk = i?.linked_branche;
  if (fk) return trimOrNull(fk.name)?.toLowerCase() ?? null;
  const label = pickBrancheLabel(i);
  return label ? label.toLowerCase() : null;
}

export function pickUnternehmenLabel(i: any): string | null {
  const fk = i?.linked_unternehmen ?? i?.linked_client?.unternehmen;
  if (fk) return trimOrNull(fk.display_name) ?? trimOrNull(fk.name);
  return (
    trimOrNull(i?.linked_kunde?.unternehmen) ??
    trimOrNull(i?.filter_values?.unternehmen) ??
    trimOrNull(i?.unternehmen) ??
    null
  );
}

export function pickUnternehmenValue(i: any): string | null {
  const fk = i?.linked_unternehmen ?? i?.linked_client?.unternehmen;
  if (fk) return trimOrNull(fk.name)?.toLowerCase() ?? null;
  const label = pickUnternehmenLabel(i);
  return label ? label.toLowerCase() : null;
}

export function pickClientName(i: any): string | null {
  return (
    trimOrNull(i?.linked_client?.name) ??
    trimOrNull(i?.linked_kunde?.client_name) ??
    trimOrNull(i?.client_name) ??
    trimOrNull(i?.meta_account_name) ??
    null
  );
}

export function pickClientId(i: any): string | null {
  return (
    trimOrNull(i?.linked_client?.id) ??
    trimOrNull(i?.linked_client_id) ??
    trimOrNull(i?.linked_kunde_id) ??
    null
  );
}
