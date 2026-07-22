import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
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
import { FK_EMBED_ALL, pickClientName, pickUnternehmenLabel } from '@/lib/showcaseFkSelect';
import { cn } from '@/lib/utils';

function QuickToggle({
  active, onClick, icon: Icon, label, tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: 'yellow' | 'emerald';
}) {
  const activeTone =
    tone === 'yellow'
      ? 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-500/10 dark:border-yellow-500/40 dark:text-yellow-300'
      : tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300'
      : 'bg-gray-900 border-gray-900 text-white dark:bg-white dark:border-white dark:text-gray-900';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
        active
          ? activeTone
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

export default function ReferenzWebsitesPage() {
  const { hasRole } = useAuth();
  const { hasPermission } = usePermissions();
  const isPublic = useIsPublicView();
  const isAdmin = (hasRole('admin') || hasPermission('sales.referenzen.manage')) && !isPublic;
  const [rows, setRows] = useState<ShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [kundeFilter, setKundeFilter] = useState('');
  const [unternehmenFilter, setUnternehmenFilter] = useState('');
  const [highlightFilter, setHighlightFilter] = useState('');
  const [zeitraumFilter, setZeitraumFilter] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [withHighlightsOnly, setWithHighlightsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'featured'>('featured');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShowcaseRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('referenz_showcase' as any)
      .select(isPublic ? `*, ${FK_EMBED_ALL}` : `*, linked_kunde:close_deals(client_name, unternehmen, branche), ${FK_EMBED_ALL}`)
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

  const kundeOptions = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      const k = pickClientName(i as any) || (i as any).linked_kunde?.client_name || (i as any).client_name;
      if (typeof k === 'string' && k.trim()) map.set(k.trim(), (map.get(k.trim()) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([v, c]) => ({ value: v, label: `${v} (${c})` }));
  }, [items]);

  const unternehmenOptions = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      const u = pickUnternehmenLabel(i as any) || (i as any).linked_kunde?.unternehmen || (i as any).unternehmen;
      if (typeof u === 'string' && u.trim()) map.set(u.trim(), (map.get(u.trim()) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([v, c]) => ({ value: v, label: `${v} (${c})` }));
  }, [items]);

  const highlightOptions = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      const features = ((i as any).key_features as string[] | null) || [];
      features.forEach(f => {
        const t = (f || '').trim();
        if (t) map.set(t, (map.get(t) ?? 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => ({ value: v, label: `${v} (${c})` }));
  }, [items]);

  const zeitraumOptions = [
    { value: '7d', label: 'Letzte 7 Tage' },
    { value: '30d', label: 'Letzte 30 Tage' },
    { value: '90d', label: 'Letzte 90 Tage' },
    { value: '1y', label: 'Letztes Jahr' },
  ];

  const filtered = useMemo(() => {
    const now = Date.now();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    let out = items.filter(i => {
      if (brancheFilter && getShowcaseBranche(i) !== brancheFilter) return false;
      const k = pickClientName(i as any) || (i as any).linked_kunde?.client_name || (i as any).client_name;
      if (kundeFilter && k !== kundeFilter) return false;
      const u = pickUnternehmenLabel(i as any) || (i as any).linked_kunde?.unternehmen || (i as any).unternehmen;
      if (unternehmenFilter && u !== unternehmenFilter) return false;
      const features = ((i as any).key_features as string[] | null) || [];
      if (highlightFilter && !features.includes(highlightFilter)) return false;
      if (withHighlightsOnly && features.length === 0) return false;
      if (featuredOnly && !i.is_featured) return false;
      if (zeitraumFilter) {
        const days = zeitraumFilter === '1y' ? 365 : parseInt(zeitraumFilter);
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        if (!i.created_at || new Date(i.created_at).getTime() < cutoff) return false;
      }
      if (recentOnly) {
        if (!i.created_at || new Date(i.created_at).getTime() < now - days30) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hay = [i.title, i.client_name, i.branche, (i as any).linked_kunde?.client_name, ...features]
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
  }, [items, brancheFilter, kundeFilter, unternehmenFilter, highlightFilter, zeitraumFilter, featuredOnly, recentOnly, withHighlightsOnly, search, sortBy]);

  const hasActiveFilters = !!(
    search || brancheFilter || kundeFilter || unternehmenFilter ||
    highlightFilter || zeitraumFilter || featuredOnly || recentOnly || withHighlightsOnly
  );
  const resetFilters = () => {
    setSearch(''); setBrancheFilter(''); setKundeFilter(''); setUnternehmenFilter('');
    setHighlightFilter(''); setZeitraumFilter('');
    setFeaturedOnly(false); setRecentOnly(false); setWithHighlightsOnly(false);
  };

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

      <div className="space-y-4 mb-8 max-w-5xl mx-auto">
        <ShowcaseSearchInput value={search} onChange={setSearch} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
          <DropdownPill label="Kunde" value={kundeFilter} onChange={setKundeFilter} options={kundeOptions} />
          <DropdownPill label="Unternehmen" value={unternehmenFilter} onChange={setUnternehmenFilter} options={unternehmenOptions} />
          <DropdownPill label="Highlights" value={highlightFilter} onChange={setHighlightFilter} options={highlightOptions} />
          <DropdownPill label="Zeitraum" value={zeitraumFilter} onChange={setZeitraumFilter} options={zeitraumOptions} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <QuickToggle active={featuredOnly} onClick={() => setFeaturedOnly(v => !v)} icon={Star} label="Featured" tone="yellow" />
          <QuickToggle active={recentOnly} onClick={() => setRecentOnly(v => !v)} icon={Clock} label="Letzte 30 Tage" />
          <QuickToggle active={withHighlightsOnly} onClick={() => setWithHighlightsOnly(v => !v)} icon={Sparkles} label="Mit Highlights" tone="emerald" />
        </div>

        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          {hasActiveFilters ? (
            <><strong className="text-gray-900 dark:text-white tabular-nums">{filtered.length}</strong> von <span className="tabular-nums">{items.length}</span></>
          ) : (
            <><strong className="text-gray-900 dark:text-white tabular-nums">{items.length}</strong> Referenzen</>
          )}
          {hasActiveFilters && (
            <>
              <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
              <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white underline">
                Alle zurücksetzen
              </button>
            </>
          )}
        </div>
      </div>

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