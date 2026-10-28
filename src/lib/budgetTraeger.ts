import { supabase } from '@/integrations/supabase/client';

/** Wer das Werbebudget trägt: 'uns' (läuft über Haush Haush) oder 'kunde'. */
export type BudgetTraeger = 'uns' | 'kunde';

/** Einzige Ableitung: 'uns', wenn der Kunde auf einem Untermarken-Konto sitzt ODER werbebudget_pflicht true ist. */
export function wirksamerBudgetTraeger(kontoArten: Iterable<string>, werbebudgetPflicht: boolean | null | undefined): BudgetTraeger {
  for (const a of kontoArten) if (a === 'untermarke') return 'uns';
  return werbebudgetPflicht === true ? 'uns' : 'kunde';
}

export type KontoInfo = { meta_account_id: string; konto_name: string | null; art: string | null };

/** Meta-Konten je Kunde (Werbebudget-Zuordnung + Kontoverknüpfung) mit Konto-Art aus meta_konto_art. Nur lesend. */
export async function ladeKontenJeKunde(clientIds?: string[]): Promise<Map<string, KontoInfo[]>> {
  let zq = (supabase.from as any)('werbebudget_zuordnung').select('client_id, meta_account_id');
  let kq = (supabase.from as any)('kunde_meta_accounts').select('client_id, meta_account_id');
  if (clientIds) { zq = zq.in('client_id', clientIds); kq = kq.in('client_id', clientIds); }
  const [z, k, a] = await Promise.all([zq, kq, (supabase.from as any)('meta_konto_art').select('meta_account_id, konto_name, art')]);
  if (z.error) console.error('werbebudget_zuordnung', z.error.message);
  if (k.error) console.error('kunde_meta_accounts', k.error.message);
  if (a.error) console.error('meta_konto_art', a.error.message);
  const norm = (s: string) => String(s).replace(/^act_/, '');
  const arten = new Map<string, KontoInfo>(((a.data || []) as KontoInfo[]).map(r => [norm(r.meta_account_id), r]));
  const out = new Map<string, Map<string, KontoInfo>>();
  for (const r of [...(z.data || []), ...(k.data || [])] as { client_id: string | null; meta_account_id: string | null }[]) {
    if (!r.client_id || !r.meta_account_id) continue;
    const id = norm(r.meta_account_id);
    const m = out.get(r.client_id) || new Map<string, KontoInfo>();
    m.set(id, arten.get(id) || { meta_account_id: id, konto_name: null, art: null });
    out.set(r.client_id, m);
  }
  return new Map([...out.entries()].map(([c, m]) => [c, [...m.values()]]));
}
