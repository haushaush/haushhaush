import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Clock, ArrowRight, Users, ListTodo, FileText, UserCircle, Home, BarChart3, Euro, Settings, Target, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { icon: Home, label: 'Übersicht', href: '/' },
  { icon: Users, label: 'Kunden', href: '/kunden' },
  { icon: BarChart3, label: 'Sales KPIs', href: '/sales/kpis' },
  { icon: Euro, label: 'Finanzen', href: '/finanzen' },
  { icon: UserCircle, label: 'Team & HR', href: '/hr/mitarbeiter' },
  { icon: Settings, label: 'Einstellungen', href: '/einstellungen' },
];

interface SearchResult {
  type: 'kunde' | 'aufgabe' | 'rechnung' | 'team' | 'nav';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon: typeof Home;
  iconBg: string;
  badge?: string;
}

function getRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem('recent-searches') || '[]'); } catch { return []; }
}
function saveRecentSearch(q: string) {
  const arr = getRecentSearches().filter(s => s !== q);
  arr.unshift(q);
  localStorage.setItem('recent-searches', JSON.stringify(arr.slice(0, 5)));
}
function removeRecentSearch(q: string) {
  localStorage.setItem('recent-searches', JSON.stringify(getRecentSearches().filter(s => s !== q)));
}

export function SearchBar({ onClick }: { onClick: () => void }) {
  return (
    <div className="max-w-[560px] w-full mx-auto mt-6">
      <button
        onClick={onClick}
        className="w-full h-11 bg-card border border-border rounded-[10px] px-4 flex items-center gap-2.5 cursor-text hover:border-primary/40 focus:border-primary focus:ring-[3px] focus:ring-accent transition-all duration-150"
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1 text-left">Kunden, Aufgaben, Seiten suchen...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </button>
    </div>
  );
}

export function GlobalSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!open) onClose(); // toggle — parent handles
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const pattern = `%${q}%`;
      const [dealsRes, tasksRes, invoicesRes, teamRes] = await Promise.all([
        supabase.from('close_deals').select('id, client_name, art, wert_eur, ampelstatus').ilike('client_name', pattern).limit(3),
        supabase.from('tasks').select('id, title, status, due_date').ilike('title', pattern).limit(3),
        supabase.from('invoices').select('id, invoice_nr, client_name, status, brutto').or(`invoice_nr.ilike.${pattern},client_name.ilike.${pattern}`).limit(3),
        supabase.from('team').select('id, name, rolle').ilike('name', pattern).limit(3),
      ]);

      const items: SearchResult[] = [];
      (dealsRes.data || []).forEach(d => items.push({
        type: 'kunde', id: d.id, title: d.client_name, subtitle: `${d.art || ''} · €${Number(d.wert_eur || 0).toLocaleString('de-DE')}`,
        href: '/kunden', icon: Users, iconBg: 'bg-primary/10 text-primary',
        badge: d.ampelstatus || undefined,
      }));
      (tasksRes.data || []).forEach(t => items.push({
        type: 'aufgabe', id: t.id, title: t.title, subtitle: t.status,
        href: '/projekte/aufgaben', icon: ListTodo, iconBg: 'bg-warning/10 text-warning',
      }));
      (invoicesRes.data || []).forEach(i => items.push({
        type: 'rechnung', id: i.id, title: i.invoice_nr, subtitle: `${i.client_name || ''} · €${Number(i.brutto || 0).toLocaleString('de-DE')}`,
        href: '/finanzen/rechnungen', icon: FileText, iconBg: 'bg-blue-500/10 text-blue-500',
        badge: i.status || undefined,
      }));
      (teamRes.data || []).forEach(m => items.push({
        type: 'team', id: m.id, title: m.name, subtitle: m.rolle,
        href: '/hr/mitarbeiter', icon: UserCircle, iconBg: 'bg-primary/10 text-primary',
      }));

      // Nav matches
      NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q.toLowerCase())).slice(0, 3).forEach(n => items.push({
        type: 'nav', id: n.href, title: n.label, href: n.href, icon: n.icon, iconBg: 'bg-muted text-muted-foreground',
      }));

      setResults(items);
      setSelectedIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const allItems = query.length < 2
    ? NAV_ITEMS.map(n => ({ type: 'nav' as const, id: n.href, title: n.label, href: n.href, icon: n.icon, iconBg: 'bg-muted text-muted-foreground' }))
    : results;

  const handleSelect = (item: { title: string; href: string }) => {
    if (query.length >= 2) saveRecentSearch(query);
    onClose();
    navigate(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, allItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && allItems[selectedIdx]) { handleSelect(allItems[selectedIdx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  const grouped = query.length >= 2 ? {
    kunden: results.filter(r => r.type === 'kunde'),
    aufgaben: results.filter(r => r.type === 'aufgabe'),
    rechnungen: results.filter(r => r.type === 'rechnung'),
    team: results.filter(r => r.type === 'team'),
    nav: results.filter(r => r.type === 'nav'),
  } : null;

  let flatIdx = -1;

  const renderRow = (item: SearchResult) => {
    flatIdx++;
    const idx = flatIdx;
    return (
      <button
        key={`${item.type}-${item.id}`}
        onClick={() => handleSelect(item)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100',
          idx === selectedIdx ? 'bg-accent border-l-2 border-primary' : 'hover:bg-accent/50 border-l-2 border-transparent'
        )}
      >
        <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs', item.iconBg)}>
          <item.icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
          {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
        </div>
        {item.badge && <Badge variant="outline" className="text-[10px] shrink-0">{item.badge}</Badge>}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative w-[92vw] max-w-[640px] bg-card border border-border rounded-[14px] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-border">
          <Search className="h-5 w-5 text-primary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Suchen..."
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
          <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto">
          {/* Recent searches */}
          {query.length < 2 && recentSearches.length > 0 && (
            <div className="py-2">
              <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Zuletzt gesucht</p>
              {recentSearches.map(s => (
                <div key={s} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <button onClick={() => setQuery(s)} className="flex-1 text-sm text-foreground text-left truncate">{s}</button>
                  <button onClick={() => { removeRecentSearch(s); setRecentSearches(getRecentSearches()); }} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Keine Ergebnisse für „{query}"</p>
              <p className="text-xs text-muted-foreground mt-1">Drücke Enter um überall zu suchen</p>
            </div>
          )}

          {!loading && grouped && (
            <>
              {grouped.kunden.length > 0 && (
                <div className="py-1">
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Kunden</p>
                  {grouped.kunden.map(renderRow)}
                </div>
              )}
              {grouped.aufgaben.length > 0 && (
                <div className="py-1">
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Aufgaben</p>
                  {grouped.aufgaben.map(renderRow)}
                </div>
              )}
              {grouped.rechnungen.length > 0 && (
                <div className="py-1">
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Rechnungen</p>
                  {grouped.rechnungen.map(renderRow)}
                </div>
              )}
              {grouped.team.length > 0 && (
                <div className="py-1">
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Team</p>
                  {grouped.team.map(renderRow)}
                </div>
              )}
              {grouped.nav.length > 0 && (
                <div className="py-1">
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Navigation</p>
                  {grouped.nav.map(renderRow)}
                </div>
              )}
            </>
          )}

          {/* Quick nav when no query */}
          {!loading && query.length < 2 && (
            <div className="py-1">
              <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Schnellnavigation</p>
              {allItems.map(renderRow)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
