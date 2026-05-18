import { Combobox } from '@/components/ui/Combobox';
import { BRANCHEN } from '@/lib/branchen';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
}

const options = BRANCHEN.map((b) => ({ value: b.id, label: b.label, meta: b.short }));

/** Picker for canonical Branche IDs (from src/lib/branchen.ts). */
export function BranchePicker({ value, onChange, label, placeholder = 'Branche wählen', compact, disabled }: Props) {
  return (
    <Combobox
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      options={options}
      label={label}
      placeholder={placeholder}
      allowCreate={false}
      compact={compact}
      disabled={disabled}
    />
  );
}
