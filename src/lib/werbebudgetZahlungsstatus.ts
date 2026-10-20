import { supabase } from '@/integrations/supabase/client';

/** Ergebnis von werbebudget_zahlungsstatus(client_id). Eine fehlende View-Zeile heißt NICHT „nicht verknüpft". */
export type WerbebudgetZahlungsstatus = 'keine_zahlungsverknuepfung' | 'verknuepft_ohne_werbebudgetposten' | 'werbebudget_vorhanden';

export const ZAHLUNGSSTATUS_TEXT: Record<Exclude<WerbebudgetZahlungsstatus, 'werbebudget_vorhanden'>, string> = {
  keine_zahlungsverknuepfung: 'keine Zahlungsverknüpfung',
  verknuepft_ohne_werbebudgetposten: 'verknüpft · kein Werbebudget berechnet',
};

export const OHNE_POSTEN_TOOLTIP = 'Qonto ist verknüpft, in den Rechnungen gibt es aber keine Werbebudget-Position. Entweder zahlt der Kunde Meta direkt, oder er bucht nur Betreuung.';

export async function ladeZahlungsstatus(clientIds: string[]): Promise<Map<string, WerbebudgetZahlungsstatus>> {
  const out = new Map<string, WerbebudgetZahlungsstatus>();
  await Promise.all(clientIds.map(async id => {
    const { data, error } = await (supabase.rpc as any)('werbebudget_zahlungsstatus', { p_client_id: id });
    if (error) { console.error('werbebudget_zahlungsstatus', id, error.message); return; }
    if (data) out.set(id, data as WerbebudgetZahlungsstatus);
  }));
  return out;
}
