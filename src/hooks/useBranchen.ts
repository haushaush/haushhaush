import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BrancheRow {
  id: string;
  canonical_name: string;
  short_name: string | null;
}

export const useBranchen = () => {
  return useQuery<BrancheRow[]>({
    queryKey: ['branchen-master'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('branchen')
        .select('id, canonical_name, short_name')
        .is('deleted_at', null)
        .order('canonical_name');
      if (error) throw error;
      return (data ?? []) as BrancheRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const createBranche = async (canonical_name: string, short_name?: string | null) => {
  const trimmed = canonical_name.trim();
  const { data, error } = await (supabase as any)
    .from('branchen')
    .insert({
      canonical_name: trimmed,
      short_name: short_name?.trim() || null,
      name: trimmed,
      display_name: trimmed,
    })
    .select('id, canonical_name, short_name')
    .single();
  if (error) throw error;
  return data as BrancheRow;
};
