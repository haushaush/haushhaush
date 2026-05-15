import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Highlight {
  id: string;
  label: string;
  usage_count: number;
}

export function useHighlights() {
  const queryClient = useQueryClient();

  const { data: highlights = [] } = useQuery<Highlight[]>({
    queryKey: ['website-highlights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('website_highlights' as any)
        .select('id, label, usage_count')
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const createHighlight = async (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    await supabase.rpc('increment_highlight_usage' as any, { p_label: trimmed });
    queryClient.invalidateQueries({ queryKey: ['website-highlights'] });
  };

  const incrementUsage = async (labels: string[]) => {
    if (!labels?.length) return;
    await Promise.all(
      labels.map((label) =>
        supabase.rpc('increment_highlight_usage' as any, { p_label: label.trim() })
      )
    );
    queryClient.invalidateQueries({ queryKey: ['website-highlights'] });
  };

  return { highlights, createHighlight, incrementUsage };
}
