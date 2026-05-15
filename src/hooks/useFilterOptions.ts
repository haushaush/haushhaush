import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranchen, useUnternehmen } from '@/hooks/useBranchenUnternehmen';

export type FilterOption = { value: string; label: string; count?: number; allIds?: string[] };

export function useFilterOptions(itemType: 'werbeanzeige' | 'website' | 'campaign') {
  const { branchen } = useBranchen();
  const { unternehmen } = useUnternehmen();

  const { data: kunden = [] } = useQuery<FilterOption[]>({
    queryKey: ['kunden-for-filter', itemType],
    queryFn: async () => {
      // Source kunden from ads that actually link to a customer, then dedupe by normalized name.
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select('linked_kunde_id, linked_kunde:close_deals(id, client_name)')
        .not('linked_kunde_id', 'is', null)
        .is('deleted_at', null);

      const rawRows = (data ?? []) as any[];
      const uniqueIds = new Set(rawRows.map(r => r.linked_kunde_id).filter(Boolean));
      // eslint-disable-next-line no-console
      console.log('[FilterOptions] raw kunden rows:', rawRows.length, 'unique kunde_ids:', uniqueIds.size);

      const nameMap = new Map<string, FilterOption>();
      for (const ad of rawRows) {
        const k = ad.linked_kunde;
        const name = (k?.client_name ?? '').trim();
        const id = k?.id ?? ad.linked_kunde_id;
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
      console.log('[FilterOptions] deduplicated kunden:', result.length);
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
