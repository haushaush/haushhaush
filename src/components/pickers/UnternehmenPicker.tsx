import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Picker for unternehmen.id — supports inline create with case-insensitive dedupe. */
export function UnternehmenPicker({ value, onChange, label, placeholder = 'Unternehmen wählen', compact, disabled }: Props) {
  const qc = useQueryClient();
  const { data = [], refetch } = useQuery<Row[]>({
    queryKey: ['unternehmen-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unternehmen' as any)
        .select('id, display_name, name')
        .order('name', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as any as Row[];
      // Client-side dedupe safety net: keep first per lower(name)
      const map = new Map<string, Row>();
      for (const r of rows) {
        const k = normalize(r.name || '');
        if (!map.has(k)) map.set(k, r);
      }
      return [...map.values()];
    },
    staleTime: 60_000,
  });

  const options = data.map((r) => ({ value: r.id, label: r.display_name || r.name }));

  const handleCreate = async (rawName: string) => {
    const trimmed = rawName.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    const key = trimmed.toLowerCase();

    // a) Pre-check against loaded list
    const existing = data.find((r) => (r.name || '').toLowerCase() === key);
    if (existing) {
      onChange(existing.id, existing.display_name || existing.name);
      toast.info('Bereits vorhanden, verlinkt');
      return;
    }

    // b) Insert; on unique conflict (race), refetch + reuse
    const { data: inserted, error } = await supabase
      .from('unternehmen' as any)
      .insert({ name: trimmed, display_name: trimmed })
      .select('id, name, display_name')
      .maybeSingle();

    if (error) {
      const msg = String(error.message ?? '');
      if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') {
        const fresh = await refetch();
        const match = (fresh.data ?? []).find((r) => (r.name || '').toLowerCase() === key);
        if (match) {
          onChange(match.id, match.display_name || match.name);
          toast.info('Bereits vorhanden, verlinkt');
          return;
        }
      }
      toast.error(`Fehler: ${msg}`);
      throw error;
    }

    await qc.invalidateQueries({ queryKey: ['unternehmen-picker'] });
    if (inserted) onChange((inserted as any).id, (inserted as any).display_name || (inserted as any).name);
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
