import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useMetaAds, MetaAdAccount } from '@/contexts/MetaAdsContext';
import { ChevronDown, Loader2 } from 'lucide-react';

interface Props {
  onAccountChange?: (accountId: string) => void;
  className?: string;
  width?: string;
}

/** Searchable single-select for Meta ad accounts (matches Kunden/Projekte SingleSelect style). */
export function MetaAccountSelector({ onAccountChange, className, width = 'w-[280px]' }: Props) {
  const { accounts, loadingAccounts, selectedAccountId, setSelectedAccountId } = useMetaAds();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = accounts.find((a) => a.id === selectedAccountId) || null;

  const filtered = accounts.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(q) ||
      (a.id || '').toLowerCase().includes(q) ||
      (a.currency || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleSelect = (a: MetaAdAccount) => {
    if (a.id !== selectedAccountId) {
      setSelectedAccountId(a.id);
      onAccountChange?.(a.id);
    }
    setSearch('');
    setOpen(false);
  };

  return (
    <div ref={ref} className={cn('relative', width, className)} onClick={(e) => e.stopPropagation()}>
      <div
        className="h-9 border border-input rounded-md px-2.5 flex items-center gap-2 cursor-text bg-background hover:border-ring/40 transition-colors"
        onClick={() => setOpen(true)}
      >
        {loadingAccounts ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Lade Konten…</span>
          </>
        ) : open ? (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={selected ? selected.name : 'Werbekonto suchen…'}
            className="outline-none text-sm flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground"
          />
        ) : selected ? (
          <span className="text-sm text-foreground truncate flex-1">
            {selected.name}
            {selected.currency && (
              <span className="text-muted-foreground ml-1.5">· {selected.currency}</span>
            )}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground flex-1">Werbekonto wählen</span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {open && !loadingAccounts && (
        <div className="absolute z-[200] w-full bg-popover border border-border rounded-md shadow-lg mt-1 max-h-[320px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Keine Treffer</div>
          ) : (
            filtered.map((a) => (
              <div
                key={a.id}
                onClick={() => handleSelect(a)}
                className={cn(
                  'px-3 py-2 text-sm hover:bg-muted cursor-pointer transition-colors flex items-center justify-between gap-3',
                  selectedAccountId === a.id && 'bg-primary/10 text-primary font-medium'
                )}
              >
                <span className="truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a.currency || ''}
                  {a.owned ? ' · Owned' : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
