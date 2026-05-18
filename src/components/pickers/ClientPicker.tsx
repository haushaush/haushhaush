import { useQuery } from '@tanstack/react-query';
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
  name: string;
  unternehmen: { display_name: string | null; name: string } | null;
}

/** Picker for clients.id (central person/customer DB). Read-only — create new clients elsewhere. */
export function ClientPicker({ value, onChange, label, placeholder = 'Kunde wählen', compact, disabled }: Props) {
  const { data = [] } = useQuery<Row[]>({
    queryKey: ['clients-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients' as any)
        .select('id, name, unternehmen:unternehmen_id(display_name, name)')
        .order('name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 60_000,
  });

  const options = data.map((r) => ({
    value: r.id,
    label: r.name,
    meta: r.unternehmen?.display_name || r.unternehmen?.name || undefined,
  }));

  return (
    <Combobox
      value={value ?? ''}
      onChange={(v, label) => onChange(v || null, label)}
      options={options}
      label={label}
      placeholder={placeholder}
      allowCreate={false}
      compact={compact}
      disabled={disabled}
    />
  );
}
