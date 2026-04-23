// Single source of truth for the customer's display name.
// `unternehmen` is a brand multi-select (Allianz, HanseMerkur, Individuell, …) — never a name.
// The slide-in panel header, matching tables and CSV exports must all derive
// the visible Kunde name from `vor_nachname` (primary) → `client_name` (fallback).

export interface KundeNameSource {
  vor_nachname?: string | null;
  client_name?: string | null;
}

export function getKundeDisplayName(kunde: KundeNameSource | null | undefined): string {
  if (!kunde) return "Unbenannt";
  const vn = kunde.vor_nachname?.trim();
  if (vn) return vn;
  const cn = kunde.client_name?.trim();
  if (cn) return cn;
  return "Unbenannt";
}
