import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LookupRow {
  id: string;
  name: string;
  display_order?: number;
}

export function useBranchen() {
  return useQuery<LookupRow[]>({
    queryKey: ['branchen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branchen' as any)
        .select('id, name, display_order')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]) as LookupRow[];
    },
  });
}

export function useCreateBranche() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('branchen' as any)
        .insert({ name, display_order: 100 });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branchen'] });
      toast.success('Branche hinzugefügt');
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? '');
      if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('Branche existiert bereits');
      } else {
        toast.error(`Fehler: ${msg}`);
      }
    },
  });
}

export function useUnternehmen() {
  return useQuery<LookupRow[]>({
    queryKey: ['unternehmen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unternehmen' as any)
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]) as LookupRow[];
    },
  });
}

export function useCreateUnternehmen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('unternehmen' as any)
        .insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unternehmen'] });
      toast.success('Unternehmen hinzugefügt');
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? '');
      if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('Unternehmen existiert bereits');
      } else {
        toast.error(`Fehler: ${msg}`);
      }
    },
  });
}
