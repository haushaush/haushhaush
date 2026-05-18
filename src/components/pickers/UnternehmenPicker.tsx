import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Combobox } from '@/components/ui/Combobox';

interface Props {
  value: string | null;
  onChange: (id: string | null, displayName?: string) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
}

interface Row {
  id: string;
  display_name: string | null;
  name: string;
}

/** Picker for unternehmen.id — supports inline create via create_or_get_unternehmen RPC. */
export function UnternehmenPicker({ value, onChange, label, placeholder = 'Unternehmen wählen', compact, disabled }: Props) {
  const qc = useQueryClient();
  const { data = [] } = useQuery<Row[]>({
    queryKey: ['unternehmen-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unternehmen' as any)
        .select('id, display_name, name')
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 60_000,
  });

  const options = data.map((r) => ({ value: r.id, label: r.display_name || r.name }));

  const handleCreate = async (name: string) => {
    const { data, error } = await supabase.rpc('create_or_get_unternehmen' as any, { p_name: name });
    if (error) throw error;
    const newId = data as unknown as string;
    await qc.invalidateQueries({ queryKey: ['unternehmen-picker'] });
    onChange(newId, name);
  };

  return (
    <Combobox
      value={value ?? ''}
      onChange={(v, label) => onChange(v || null, label)}
      options={options}
      label={label}
      placeholder={placeholder}
      onCreate={handleCreate}
      allowCreate
      compact={compact}
      disabled={disabled}
    />
  );
}
