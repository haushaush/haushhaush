import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranchen, useUnternehmen } from '@/hooks/useBranchenUnternehmen';

export type FilterOption = { value: string; label: string; count?: number };

export function useFilterOptions(itemType: 'werbeanzeige' | 'website' | 'campaign') {
  const { branchen } = useBranchen();
  const { unternehmen } = useUnternehmen();

  const { data: kunden = [] } = useQuery<FilterOption[]>({
    queryKey: ['kunden-for-filter'],
    queryFn: async () => {
      const { data } = await supabase
        .from('close_deals' as any)
        .select('id, client_name')
        .not('client_name', 'is', null)
        .order('client_name');
      const seen = new Set<string>();
      const out: FilterOption[] = [];
      for (const row of (data ?? []) as any[]) {
        if (!row.client_name || seen.has(row.id)) continue;
        seen.add(row.id);
        out.push({ value: row.id, label: row.client_name });
      }
      return out;
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
