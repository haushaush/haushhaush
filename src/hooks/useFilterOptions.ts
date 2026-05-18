import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUnternehmen } from '@/hooks/useBranchenUnternehmen';
import { normalizeBranche, getBranche, BRANCHEN } from '@/lib/branchen';
import { FK_EMBED_ALL, pickBrancheValue, pickClientId, pickClientName } from '@/lib/showcaseFkSelect';

export type FilterOption = { value: string; label: string; count?: number; allIds?: string[]; short?: string; isUnknown?: boolean };

export function useFilterOptions(itemType: 'werbeanzeige' | 'website' | 'campaign') {
  const { unternehmen } = useUnternehmen();

  // Branchen normalisiert aus tatsächlichen Ad-Daten (FK-first, legacy fallback)
  const { data: branchen = [] } = useQuery<FilterOption[]>({
    queryKey: ['branchen-normalized-for-filter', itemType],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select(`filter_values, linked_kunde:close_deals(branche), ${FK_EMBED_ALL}`)
        .is('deleted_at', null);

      const knownCounts = new Map<string, number>();
      const unknownCounts = new Map<string, number>();
      for (const ad of (data ?? []) as any[]) {
        const raw = pickBrancheValue(ad) ?? ad.linked_kunde?.branche ?? ad.filter_values?.branche;
        if (!raw) continue;
        const id = normalizeBranche(raw);
        if (id) {
          knownCounts.set(id, (knownCounts.get(id) ?? 0) + 1);
        } else {
          const t = String(raw).trim();
          if (t) unknownCounts.set(t, (unknownCounts.get(t) ?? 0) + 1);
        }
      }
      const known: FilterOption[] = Array.from(knownCounts.entries())
        .map(([id, count]) => {
          const b = getBranche(id)!;
          return { value: id, label: b.label, short: b.short, count };
        })
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, 'de'));
      const unknown: FilterOption[] = Array.from(unknownCounts.entries())
        .map(([label, count]) => ({ value: label, label, count, isUnknown: true }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
      return [...known, ...unknown];
    },
    staleTime: 60_000,
  });

  const { data: kunden = [] } = useQuery<FilterOption[]>({
    queryKey: ['kunden-for-filter', itemType],
    queryFn: async () => {
      // FK-first: prefer linked_client_id, fall back to legacy linked_kunde_id.
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select(`linked_kunde_id, linked_client_id, linked_kunde:close_deals(id, client_name), ${FK_EMBED_ALL}`)
        .or('linked_kunde_id.not.is.null,linked_client_id.not.is.null')
        .is('deleted_at', null);

      const rawRows = (data ?? []) as any[];

      const nameMap = new Map<string, FilterOption>();
      for (const ad of rawRows) {
        const name = pickClientName(ad);
        const id = pickClientId(ad);
        if (!name || !id) continue;
        const key = name.toLowerCase();
        const existing = nameMap.get(key);
        if (existing) {
          existing.count = (existing.count ?? 1) + 1;
          if (!existing.allIds!.includes(id)) existing.allIds!.push(id);
        } else {
          nameMap.set(key, { value: id, label: name, count: 1, allIds: [id] });
        }
      }
      const result = Array.from(nameMap.values()).sort((a, b) => {
        if ((b.count ?? 0) !== (a.count ?? 0)) return (b.count ?? 0) - (a.count ?? 0);
        return a.label.localeCompare(b.label, 'de');
      });
      // eslint-disable-next-line no-console
      console.log('[FilterOptions] FK-first kunden:', result.length);
      return result;
    },
    staleTime: 60_000,
  });

  const { data: werbekonten = [] } = useQuery<FilterOption[]>({
    queryKey: ['werbekonten-for-filter'],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select('meta_account_id, meta_account_name')
        .not('meta_account_id', 'is', null);
      const unique = new Map<string, FilterOption>();
      for (const item of (data ?? []) as any[]) {
        if (!unique.has(item.meta_account_id)) {
          unique.set(item.meta_account_id, {
            value: item.meta_account_id,
            label: item.meta_account_name || item.meta_account_id,
          });
        }
      }
      return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label, 'de'));
    },
    enabled: itemType === 'werbeanzeige' || itemType === 'campaign',
    staleTime: 60_000,
  });

  return { branchen, unternehmen, kunden, werbekonten };
}
