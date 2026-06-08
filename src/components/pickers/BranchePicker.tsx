import { Combobox } from '@/components/ui/Combobox';
import { useBranchen } from '@/hooks/useBranchen';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
}

/** Picker for Branchen from the central `branchen` master table. */
export function BranchePicker({ value, onChange, label, placeholder = 'Branche wählen', compact, disabled }: Props) {
  const { data: branchen = [], isLoading } = useBranchen();
  const options = branchen.map((b) => ({
    value: b.canonical_name,
    label: b.display_name || b.canonical_name,
    meta: b.short_name || undefined,
  }));

  return (
    <Combobox
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      options={options}
      label={label}
      placeholder={placeholder}
      allowCreate={false}
      compact={compact}
      disabled={disabled || isLoading}
    />
  );
}
