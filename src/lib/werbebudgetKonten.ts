import { supabase } from '@/integrations/supabase/client';

export type Untermarke = { meta_account_id: string; name: string | null };
export const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Aktiv', PAUSED: 'Pausiert', CAMPAIGN_PAUSED: 'Kampagne pausiert', ARCHIVED: 'Archiviert', DELETED: 'Gelöscht', WITH_ISSUES: 'Mit Problemen', IN_PROCESS: 'In Bearbeitung' };

/** Unsere Untermarken-Konten: aktiv und in den letzten 30 Tagen synchronisiert; bereits genutzte zuerst. */
export async function ladeUntermarken(): Promise<Untermarke[]> {
  const [k, z] = await Promise.all([
    (supabase.from as any)('meta_accounts_cache').select('meta_account_id, name').eq('status', 'active')
      .gte('last_synced_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('name'),
    (supabase.from as any)('werbebudget_zuordnung').select('meta_account_id'),
  ]);
  const belegt = new Set(((z.data || []) as any[]).map(r => r.meta_account_id));
  return ((k.data || []) as Untermarke[]).sort((a, b) => Number(belegt.has(b.meta_account_id)) - Number(belegt.has(a.meta_account_id)) || (a.name || '').localeCompare(b.name || ''));
}
