import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  meta?: string;
}

// Backward-compatible legacy option shape: { name: string }
type LegacyOption = { name: string };

interface ComboboxProps {
  value: string | null;
  onChange: (value: string, displayLabel?: string) => void;
  options: Array<ComboboxOption | LegacyOption>;
  /** New API */
  onCreate?: (newValue: string) => Promise<unknown> | void;
  /** Legacy API (kept for AddWebsiteModal etc) */
  onCreateNew?: (newValue: string) => Promise<unknown> | void;
  placeholder?: string;
  label?: string;
  allowCreate?: boolean;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  /** Optional override for the trigger display label (when closed) */
  selectedLabel?: string;
  /** Optional footer action shown at the bottom of the dropdown */
  onAddNew?: () => void;
  addNewLabel?: string;
}

function normalizeOption(opt: ComboboxOption | LegacyOption): ComboboxOption {
  if ('value' in opt) return opt;
  return { value: opt.name, label: opt.name };
}

export function Combobox({
  value,
  onChange,
  options,
  onCreate,
  onCreateNew,
  placeholder = 'Auswählen oder tippen',
  label,
  allowCreate = true,
  compact = false,
  disabled = false,
  className,
  selectedLabel,
  onAddNew,
  addNewLabel = 'Neu hinzufügen',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = options.map(normalizeOption);
  const currentOption = normalized.find((o) => o.value === value);
  const displayValue = open ? search : (selectedLabel || currentOption?.label || value || '');

  const filtered = normalized.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = filtered.find(
    (o) =>
      o.label.toLowerCase() === search.trim().toLowerCase() ||
      o.value.toLowerCase() === search.trim().toLowerCase()
  );

  const createHandler = onCreate ?? onCreateNew;
  const showCreateOption =
    allowCreate && !!createHandler && search.trim().length >= 2 && !exactMatch;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectOption = (opt: ComboboxOption) => {
    onChange(opt.value, opt.label);
    setOpen(false);
    setSearch('');
  };

  const createNew = async () => {
    const newValue = search.trim();
    if (!newValue || !createHandler) return;
    try {
      await createHandler(newValue);
    } catch (e) {
      console.warn('Combobox create failed', e);
    }
    const canonical = newValue.toLowerCase().replace(/\s+/g, '-');
    onChange(canonical, newValue);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    const max = filtered.length + (showCreateOption ? 1 : 0) - 1;
    if (e.key === 'ArrowDown') {
      setHighlightedIdx((i) => Math.min(i + 1, max));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedIdx((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx < filtered.length) selectOption(filtered[highlightedIdx]);
      else if (showCreateOption) createNew();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  const clearValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {label && (
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {label}
        </label>
      )}

      <div
        onClick={() => !disabled && (setOpen(true), inputRef.current?.focus())}
        className={cn(
          'flex items-center gap-2 bg-background border border-input rounded-md px-3 transition-colors cursor-text',
          compact ? 'h-8 text-sm' : 'h-10 text-sm',
          open && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
            setHighlightedIdx(0);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {value && !open && (
          <button
            type="button"
            onClick={clearValue}
            className="text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </div>

      {open && (
        <div className="absolute z-[400] mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.length === 0 && !showCreateOption && (
            <div className="px-3.5 py-2.5 text-sm text-muted-foreground">
              Keine Treffer
            </div>
          )}

          {filtered.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => selectOption(opt)}
              onMouseEnter={() => setHighlightedIdx(idx)}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors',
                highlightedIdx === idx
                  ? 'bg-accent'
                  : 'hover:bg-accent/50'
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                {value === opt.value ? (
                  <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{opt.label}</span>
              </span>
              {opt.meta && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {opt.meta}
                </span>
              )}
            </button>
          ))}

          {showCreateOption && (
            <>
              {filtered.length > 0 && <div className="h-px bg-border my-1" />}
              <button
                type="button"
                onClick={createNew}
                onMouseEnter={() => setHighlightedIdx(filtered.length)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors',
                  highlightedIdx === filtered.length
                    ? 'bg-accent'
                    : 'hover:bg-accent/50'
                )}
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">Neu anlegen:</span>
                <span className="font-medium">"{search.trim()}"</span>
              </button>
            </>
          )}

          {onAddNew && (
            <>
              <div className="h-px bg-border my-1" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                  onAddNew();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm text-primary hover:bg-accent/50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="font-medium">{addNewLabel}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
