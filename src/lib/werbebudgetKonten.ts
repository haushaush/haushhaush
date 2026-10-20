import { supabase } from '@/integrations/supabase/client';

export type Untermarke = { meta_account_id: string; name: string | null; business_name?: string | null; aktive_kampagnen?: number | null };
export const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Aktiv', PAUSED: 'Pausiert', CAMPAIGN_PAUSED: 'Kampagne pausiert', ARCHIVED: 'Archiviert', DELETED: 'Gelöscht', WITH_ISSUES: 'Mit Problemen', IN_PROCESS: 'In Bearbeitung' };

/** Vergleichsschlüssel für Suchen: klein, ohne Akzente, Umlaute aufgelöst, Leerzeichen zusammengefasst. */
export const suchKey = (s?: string | null) => (s || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Unsere Untermarken-Konten: aktiv und in den letzten 30 Tagen synchronisiert; bereits genutzte zuerst. */
export async function ladeUntermarken(immerMit?: { meta_account_id: string; name: string | null } | null): Promise<Untermarke[]> {
  const [k, z, s] = await Promise.all([
    (supabase.from as any)('meta_accounts_cache').select('meta_account_id, name, business_name').eq('status', 'active')
      .gte('last_synced_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('name'),
    (supabase.from as any)('werbebudget_zuordnung').select('meta_account_id'),
    (supabase.from as any)('meta_campaign_snapshot').select('account_id').eq('status', 'ACTIVE').limit(5000),
  ]);
  if (k.error) throw new Error(`Werbekonten konnten nicht geladen werden: ${k.error.message}`);
  const liste = [...((k.data || []) as Untermarke[])];
  // Das bereits verknüpfte Konto immer aufnehmen, auch wenn es den Aktiv-/Sync-Filter nicht erfüllt.
  if (immerMit && !liste.some(x => x.meta_account_id === immerMit.meta_account_id)) {
    const { data: e } = await (supabase.from as any)('meta_accounts_cache').select('meta_account_id, name, business_name').eq('meta_account_id', immerMit.meta_account_id).maybeSingle();
    liste.push(e || immerMit);
  }
  if (s.error) console.error('Aktive Kampagnen je Konto nicht geladen:', s.error.message);
  else {
    const n = new Map<string, number>();
    for (const r of (s.data || []) as any[]) n.set(r.account_id, (n.get(r.account_id) || 0) + 1);
    for (const x of liste) x.aktive_kampagnen = n.get(x.meta_account_id) || 0;
  }
  const belegt = new Set(((z.data || []) as any[]).map(r => r.meta_account_id));
  return liste.sort((a, b) => Number(belegt.has(b.meta_account_id)) - Number(belegt.has(a.meta_account_id)) || (a.name || '').localeCompare(b.name || ''));
}
