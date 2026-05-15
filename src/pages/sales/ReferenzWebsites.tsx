import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPublicView } from '@/hooks/useIsPublicView';
import { Plus, Star, Clock, Sparkles } from 'lucide-react';
import { AddWebsiteModal } from '@/components/sales/AddWebsiteModal';
import { SHOWCASE_COPY } from '@/copy/showcase';
import type { ShowcaseRow } from './ReferenzShowcaseShared';
import {
  ShowcasePageWrapper, SubPageHeader, ShowcaseSearchInput, DropdownPill,
  ShowcaseCard, ShowcaseEmptyState, ResultCount, PrimaryActionButton,
  getShowcaseBranche, type AnyItem,
} from './ReferenzShowcaseUI';
import { cn } from '@/lib/utils';

export default function ReferenzWebsitesPage() {
  const { hasRole } = useAuth();
  const isPublic = useIsPublicView();
  const isAdmin = hasRole('admin') && !isPublic;
  const [rows, setRows] = useState<ShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [unternehmenFilter, setUnternehmenFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'featured'>('featured');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShowcaseRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('referenz_showcase' as any)
      .select(isPublic ? '*' : '*, linked_kunde:close_deals(client_name, unternehmen, branche)')
      .eq('type', 'website')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    setRows(((data ?? []) as any[]) as ShowcaseRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const items: AnyItem[] = useMemo(
    () => rows.map(r => ({ ...r, _type: 'website' as const })),
    [rows],
  );

  const brancheOptions = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      const b = getShowcaseBranche(i);
      if (b) map.set(b, (map.get(b) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([v, c]) => ({ value: v, label: `${v} (${c})` }));
  }, [items]);

  const unternehmenOptions = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      const u = (i as any).linked_kunde?.unternehmen || (i as any).unternehmen;
      if (typeof u === 'string' && u.trim()) map.set(u.trim(), (map.get(u.trim()) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([v, c]) => ({ value: v, label: `${v} (${c})` }));
  }, [items]);

  const filtered = useMemo(() => {
    let out = items.filter(i => {
      if (brancheFilter && getShowcaseBranche(i) !== brancheFilter) return false;
      const u = (i as any).linked_kunde?.unternehmen || (i as any).unternehmen;
      if (unternehmenFilter && u !== unternehmenFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [i.title, i.client_name, i.branche, (i as any).linked_kunde?.client_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sortBy === 'featured') {
        const f = Number(!!b.is_featured) - Number(!!a.is_featured);
        if (f !== 0) return f;
      }
      const ca = (a.created_at || '') as string;
      const cb = (b.created_at || '') as string;
      return sortBy === 'oldest' ? ca.localeCompare(cb) : cb.localeCompare(ca);
    });
    return out;
  }, [items, brancheFilter, unternehmenFilter, search, sortBy]);

  const hasActiveFilters = !!(search || brancheFilter || unternehmenFilter);
  const resetFilters = () => { setSearch(''); setBrancheFilter(''); setUnternehmenFilter(''); };

  return (
    <ShowcasePageWrapper>
      <SubPageHeader
        title={SHOWCASE_COPY.websites.title}
        subtitle={SHOWCASE_COPY.websites.description}
        actions={isAdmin && (
          <PrimaryActionButton onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4" /> {SHOWCASE_COPY.websites.addLabel}
          </PrimaryActionButton>
        )}
      />

      <div className="space-y-3 mb-8">
        <ShowcaseSearchInput value={search} onChange={setSearch} />

        <div className="flex flex-wrap items-center gap-3">
          <DropdownPill
            label="Sortieren"
            value={sortBy === 'featured' ? '' : sortBy}
            onChange={v => setSortBy((v || 'featured') as any)}
            options={[
              { value: 'newest', label: 'Neueste' },
              { value: 'oldest', label: 'Älteste' },
            ]}
          />
          <DropdownPill label="Branche" value={brancheFilter} onChange={setBrancheFilter} options={brancheOptions} />
          <DropdownPill label="Unternehmen" value={unternehmenFilter} onChange={setUnternehmenFilter} options={unternehmenOptions} />
          {hasActiveFilters && (
            <button onClick={resetFilters} className="ml-auto text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline">
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      <ResultCount count={filtered.length} singular="Referenz" plural="Referenzen" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <ShowcaseEmptyState
          title={rows.length === 0 ? SHOWCASE_COPY.websites.emptyTitle : 'Keine Ergebnisse'}
          subtitle={rows.length === 0 ? SHOWCASE_COPY.websites.emptyDescription : undefined}
          action={isAdmin && rows.length === 0 ? (
            <PrimaryActionButton onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4" /> {SHOWCASE_COPY.websites.addFirstLabel}
            </PrimaryActionButton>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {filtered.map(item => <ShowcaseCard key={item.id} item={item} />)}
        </div>
      )}

      {formOpen && (
        <AddWebsiteModal
          open={formOpen}
          editing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
        />
      )}
    </ShowcasePageWrapper>
  );
}
