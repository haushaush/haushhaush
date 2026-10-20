// Durchsuchbare Werbekonto-Auswahl: Name und act_-ID, tastaturbedienbar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { suchKey, type Untermarke } from '@/lib/werbebudgetKonten';

export function KontoCombobox({ konten, value, onChange, leerText = 'Werbekonto wählen …', alleText, className }: {
  konten: Untermarke[]; value: string; onChange: (id: string) => void; leerText?: string; alleText?: string; className?: string;
}) {
  const [q, setQ] = useState('');
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const gewaehlt = konten.find(k => k.meta_account_id === value);

  // Reihenfolge der Eingabeliste (belegte Konten oben) bleibt beim leeren Suchfeld erhalten.
  const treffer = useMemo(() => {
    const s = suchKey(q);
    const t = s ? konten.filter(k => suchKey(`${k.name} ${k.meta_account_id} ${k.business_name || ''}`).includes(s)) : konten;
    return alleText && !s ? [null, ...t] : t;
  }, [konten, q, alleText]);

  useEffect(() => { setAktiv(0); }, [q, offen]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOffen(false); setQ(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { (listRef.current?.children[aktiv] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }); }, [aktiv]);

  const waehle = (k: Untermarke | null) => { onChange(k?.meta_account_id || ''); setOffen(false); setQ(''); };
  const taste = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOffen(true); setAktiv(i => Math.min(i + 1, treffer.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (offen && treffer.length) waehle(treffer[aktiv]); else setOffen(true); }
    else if (e.key === 'Escape') { setOffen(false); setQ(''); }
  };

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <div className="h-8 flex items-center gap-2 rounded-md border border-input bg-background px-2">
        <input value={offen ? q : ''} onChange={e => { setQ(e.target.value); setOffen(true); }} onFocus={() => setOffen(true)} onKeyDown={taste}
          placeholder={gewaehlt ? (gewaehlt.name || gewaehlt.meta_account_id) : (alleText || leerText)}
          role="combobox" aria-expanded={offen} aria-label="Werbekonto suchen"
          className={cn('flex-1 min-w-0 bg-transparent outline-none text-xs', gewaehlt && !offen ? 'placeholder:text-foreground' : 'placeholder:text-muted-foreground')} />
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      {offen && (
        <div ref={listRef} role="listbox" className="absolute z-[200] mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {treffer.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Keine Treffer</div>}
          {treffer.map((k, i) => (
            <div key={k?.meta_account_id || '_alle'} role="option" aria-selected={i === aktiv}
              onMouseDown={e => { e.preventDefault(); waehle(k); }} onMouseEnter={() => setAktiv(i)}
              className={cn('px-3 py-1.5 cursor-pointer text-xs', i === aktiv && 'bg-muted', (k?.meta_account_id || '') === value && 'text-primary font-medium')}>
              {k ? <>
                <p className="truncate">{k.name || k.meta_account_id}</p>
                <p className="text-xs text-muted-foreground truncate tabular-nums">
                  {[k.business_name, k.aktive_kampagnen != null && `${k.aktive_kampagnen} aktive Kampagne${k.aktive_kampagnen === 1 ? '' : 'n'}`, k.meta_account_id].filter(Boolean).join(' · ')}
                </p>
              </> : <p>{alleText}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
