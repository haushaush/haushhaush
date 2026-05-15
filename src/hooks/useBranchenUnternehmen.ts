import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ComboboxOption } from '@/components/ui/Combobox';

async function fetchPool(table: 'branches' | 'companies'): Promise<ComboboxOption[]> {
  const { data, error } = await supabase
    .from(table as any)
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    value: r.name,
    label: r.name,
  }));
}

export function useBranchen() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['branches-pool'],
    queryFn: () => fetchPool('branches'),
    staleTime: 60_000,
  });

  const createBranche = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from('branches' as any)
      .upsert({ name: trimmed }, { onConflict: 'name' })
      .select('id')
      .single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['branches-pool'] });
    return (data as any)?.id ?? null;
  };

  return { branchen: data, isLoading, createBranche };
}

export function useUnternehmen() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['companies-pool'],
    queryFn: () => fetchPool('companies'),
    staleTime: 60_000,
  });

  const createUnternehmen = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from('companies' as any)
      .upsert({ name: trimmed }, { onConflict: 'name' })
      .select('id')
      .single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['companies-pool'] });
    return (data as any)?.id ?? null;
  };

  return { unternehmen: data, isLoading, createUnternehmen };
}
