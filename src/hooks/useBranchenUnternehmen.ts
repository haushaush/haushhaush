import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ComboboxOption } from '@/components/ui/Combobox';

async function fetchPool(table: 'branchen' | 'unternehmen'): Promise<ComboboxOption[]> {
  const { data, error } = await supabase
    .from(table as any)
    .select('name, display_name, usage_count')
    .order('usage_count', { ascending: false })
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    value: r.name,
    label: r.display_name || r.name,
    meta: r.usage_count > 0 ? `${r.usage_count}×` : undefined,
  }));
}

export function useBranchen() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['branchen-pool'],
    queryFn: () => fetchPool('branchen'),
    staleTime: 60_000,
  });

  const createBranche = async (name: string) => {
    const { data, error } = await supabase.rpc('increment_branche_usage' as any, {
      branche_name: name,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['branchen-pool'] });
    return data as string | null;
  };

  return { branchen: data, isLoading, createBranche };
}

export function useUnternehmen() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['unternehmen-pool'],
    queryFn: () => fetchPool('unternehmen'),
    staleTime: 60_000,
  });

  const createUnternehmen = async (name: string, brancheId?: string) => {
    const { data, error } = await supabase.rpc('increment_unternehmen_usage' as any, {
      unt_name: name,
      branche_id_in: brancheId ?? null,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['unternehmen-pool'] });
    return data as string | null;
  };

  return { unternehmen: data, isLoading, createUnternehmen };
}
