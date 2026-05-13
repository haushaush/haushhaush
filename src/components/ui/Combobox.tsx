import { useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

interface ComboboxProps {
  value: string | null;
  onChange: (value: string) => void;
  options: { name: string }[];
  onCreateNew: (name: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
}

export function Combobox({
  value,
  onChange,
  options,
  onCreateNew,
  placeholder = 'Wählen...',
  disabled = false,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const filtered = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = options.some(
    (opt) => opt.name.toLowerCase() === search.trim().toLowerCase()
  );
  const showCreateOption = search.trim().length > 0 && !exactMatch;

  const handleCreate = async () => {
    const name = search.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      await onCreateNew(name);
      onChange(name);
      setSearch('');
      setIsOpen(false);
    } catch {
      // error handled by mutation onError
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((o) => !o)}
        className="w-full px-3 h-10 bg-background border border-input rounded-md text-sm text-left flex items-center justify-between hover:border-ring/50 transition-colors disabled:opacity-50"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="Suchen oder neu eingeben..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showCreateOption) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                autoFocus
                className="w-full px-2 py-1.5 text-sm bg-muted border border-transparent rounded focus:border-ring outline-none"
              />
            </div>

            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => {
                    onChange(opt.name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="w-full px-3 py-2 text-sm text-left text-foreground hover:bg-accent flex items-center justify-between"
                >
                  <span className="truncate">{opt.name}</span>
                  {value === opt.name && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              ))}

              {filtered.length === 0 && !showCreateOption && (
                <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                  Keine Treffer
                </div>
              )}

              {showCreateOption && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="w-full px-3 py-2 text-sm text-left text-primary hover:bg-accent flex items-center gap-2 border-t border-border font-medium disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isCreating ? 'Wird erstellt...' : `"${search.trim()}" neu hinzufügen`}
                </button>
              )}
            </div>

            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-xs text-left text-muted-foreground hover:bg-accent border-t border-border flex items-center gap-2"
              >
                <X className="w-3 h-3" /> Auswahl löschen
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
