import { useState } from 'react';
import { Check, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useHighlights } from '@/hooks/useHighlights';

interface HighlightsPickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  max?: number;
}

export function HighlightsPicker({ selected, onChange, max = 6 }: HighlightsPickerProps) {
  const { highlights, createHighlight } = useHighlights();
  const [search, setSearch] = useState('');

  const toggleHighlight = (label: string) => {
    if (selected.includes(label)) {
      onChange(selected.filter((s) => s !== label));
    } else {
      if (selected.length >= max) {
        toast.error(`Maximal ${max} Highlights`);
        return;
      }
      onChange([...selected, label]);
    }
  };

  const createAndSelect = async () => {
    const trimmed = search.trim();
    if (!trimmed || selected.length >= max) return;
    await createHighlight(trimmed);
    if (!selected.includes(trimmed)) onChange([...selected, trimmed]);
    setSearch('');
  };

  const filtered = highlights.filter((h) =>
    h.label.toLowerCase().includes(search.toLowerCase())
  );
  const exactMatch = filtered.some(
    (h) => h.label.toLowerCase() === search.trim().toLowerCase()
  );
  const showCreate = search.trim().length >= 2 && !exactMatch && selected.length < max;

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 bg-muted/50 rounded-xl">
          {selected.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-md border border-teal-200 dark:border-teal-800"
            >
              <Check className="w-3 h-3" />
              {label}
              <button
                type="button"
                onClick={() => toggleHighlight(label)}
                className="ml-0.5 hover:bg-teal-100 dark:hover:bg-teal-900 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground self-center ml-1 tabular-nums">
            {selected.length} / {max}
          </span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && showCreate) {
              e.preventDefault();
              createAndSelect();
            }
          }}
          placeholder={
            selected.length >= max
              ? `Maximum erreicht (${max})`
              : 'Highlight suchen oder neu anlegen...'
          }
          disabled={selected.length >= max}
          className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:border-foreground/40 disabled:opacity-50"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
        {showCreate && (
          <button
            type="button"
            onClick={createAndSelect}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-950/60 border-b border-teal-200 dark:border-teal-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="text-muted-foreground">Neu anlegen:</span>
            <span className="font-bold text-foreground">"{search.trim()}"</span>
          </button>
        )}

        {filtered.length === 0 && !showCreate && (
          <div className="px-3 py-6 text-sm text-muted-foreground text-center">
            {search ? 'Keine Treffer' : 'Keine Highlights verfügbar'}
          </div>
        )}

        <div className="divide-y divide-border">
          {filtered.map((h) => {
            const isSelected = selected.includes(h.label);
            const disabled = !isSelected && selected.length >= max;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => toggleHighlight(h.label)}
                disabled={disabled}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors text-left',
                  isSelected
                    ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 font-semibold'
                    : 'hover:bg-muted/50',
                  disabled && 'opacity-40 cursor-not-allowed'
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      isSelected ? 'bg-teal-600 border-teal-600' : 'border-border'
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="truncate">{h.label}</span>
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {h.usage_count}×
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
