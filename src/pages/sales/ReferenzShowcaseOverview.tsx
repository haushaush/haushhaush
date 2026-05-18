import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Globe, Sparkles, TrendingUp, Search, ChevronRight, Lightbulb, Upload, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useIsPublicView } from '@/hooks/useIsPublicView';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { ShowcaseCard } from './ReferenzShowcaseUI';
import { SHOWCASE_COPY } from '@/copy/showcase';
import { FK_EMBED_ALL, pickBrancheLabel, pickBrancheValue, pickUnternehmenLabel, pickUnternehmenValue, pickClientName } from '@/lib/showcaseFkSelect';

type AnyItem = Record<string, any> & { _type: 'website' | 'werbeanzeige' | 'campaign' };

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'heute';
  if (days < 2) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Mon.`;
  return d.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
}

const KUNDE_SELECT = 'linked_kunde:close_deals(client_name, unternehmen, branche)';

export default function ReferenzShowcaseOverview() {
  const queryClient = useQueryClient();
  const isPublic = useIsPublicView();
  const kundeJoin = isPublic ? '' : `, ${KUNDE_SELECT}`;
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'website' | 'werbeanzeige' | 'campaign'>('all');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [unternehmenFilter, setUnternehmenFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'featured' | 'kunde'>('newest');
  const [syncing, setSyncing] = useState(false);

  const { data: websites = [] } = useQuery({
    queryKey: ['showcase-websites', isPublic],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_showcase' as any)
        .select(`*${kundeJoin}`)
        .eq('type', 'website')
        .eq('is_active', true);
      return ((data as any[]) || []).map(w => ({ ...w, _type: 'website' as const }));
    },
  });

  const { data: adCreatives = [] } = useQuery({
    queryKey: ['showcase-ad-creatives', isPublic],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select(`*${kundeJoin}`)
        .eq('is_active', true)
        .is('deleted_at', null);
      return ((data as any[]) || []).map(a => ({ ...a, _type: 'werbeanzeige' as const }));
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['showcase-campaigns', isPublic],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_campaigns' as any)
        .select(`*${kundeJoin}`)
        .eq('is_active', true);
      return ((data as any[]) || []).map(c => ({ ...c, _type: 'campaign' as const }));
    },
  });


  // Unified filter category + option queries
  const { data: filterCategories = [] } = useQuery({
    queryKey: ['showcase-filter-categories-unified'],
    queryFn: async () => {
      const { data } = await supabase
        .from('showcase_filter_categories' as any)
        .select('*')
        .in('applies_to', ['all', 'werbeanzeige', 'website', 'campaign', 'both'])
        .eq('is_active', true)
        .order('display_order');
      return (data as any[]) || [];
    },
  });

  const { data: filterOptions = [] } = useQuery({
    queryKey: ['showcase-filter-options-unified'],
    queryFn: async () => {
      const { data } = await supabase
        .from('showcase_filter_options' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order')
        .range(0, 999);
      return (data as any[]) || [];
    },
  });

  const getOptionsFor = (categoryKey: string) => {
    const cats = filterCategories.filter((c: any) => c.key === categoryKey);
    if (!cats.length) return [] as { value: string; label: string }[];
    const catIds = new Set(cats.map((c: any) => c.id));
    const seen = new Map<string, string>();
    filterOptions
      .filter((o: any) => catIds.has(o.category_id))
      .forEach((o: any) => { if (!seen.has(o.label)) seen.set(o.label, o.label); });
    return Array.from(seen.values())
      .sort((a, b) => a.localeCompare(b, 'de'))
      .map(label => ({ value: label, label }));
  };

  // Auto-sync filters if stale (>24h)
  useEffect(() => {
    const lastSync = localStorage.getItem('showcase-filters-last-sync');
    const now = Date.now();
    const ageHours = lastSync ? (now - parseInt(lastSync, 10)) / 3.6e6 : Infinity;
    if (ageHours > 24) {
      supabase.functions.invoke('sync-showcase-filters-from-notion').then(({ error }) => {
        if (!error) {
          localStorage.setItem('showcase-filters-last-sync', String(now));
          queryClient.invalidateQueries({ queryKey: ['showcase-filter-options-unified'] });
        }
      });
    }
  }, [queryClient]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-showcase-filters-from-notion');
      if (error) throw error;
      localStorage.setItem('showcase-filters-last-sync', String(Date.now()));
      const added = (data as any)?.added ?? 0;
      const reactivated = (data as any)?.reactivated ?? 0;
      toast.success(`Filter aktualisiert: ${added} neu, ${reactivated} reaktiviert`);
      queryClient.invalidateQueries({ queryKey: ['showcase-filter-options-unified'] });
    } catch (e: any) {
      toast.error(e.message || 'Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  const allItems = useMemo<AnyItem[]>(
    () => [...websites, ...adCreatives, ...campaigns],
    [websites, adCreatives, campaigns],
  );

  const normalize = (v: any): string | null => {
    if (Array.isArray(v)) v = v[0];
    if (!v || typeof v !== 'string') return null;
    const t = v.trim().toLowerCase();
    return t || null;
  };

  const getBrancheValue = (i: AnyItem): string | null => {
    const tags: string[] = i.custom_tags || i.tags || [];
    const fromTags = tags
      .filter(t => typeof t === 'string' && t.toLowerCase().startsWith('branche-'))
      .map(t => t.slice('branche-'.length));
    const candidates = [
      i.linked_kunde?.branche,
      i.filter_values?.branche,
      i.branche,
      ...fromTags,
    ];
    for (const c of candidates) {
      const n = normalize(c);
      if (n) return n;
    }
    return null;
  };

  const getUnternehmenValue = (i: AnyItem): string | null => {
    const tags: string[] = i.custom_tags || i.tags || [];
    const fromTags = tags
      .filter(t => typeof t === 'string' && (t.toLowerCase().startsWith('versicherer-') || t.toLowerCase().startsWith('unternehmen-')))
      .map(t => t.replace(/^(versicherer-|unternehmen-)/i, ''));
    const candidates = [
      i.linked_kunde?.unternehmen,
      i.filter_values?.unternehmen,
      i.unternehmen,
      ...fromTags,
    ];
    for (const c of candidates) {
      const n = normalize(c);
      if (n) return n;
    }
    return null;
  };

  // Display-friendly version (preserves original casing from first occurrence)
  const getBranche = (i: AnyItem): string | null => {
    const tags: string[] = i.custom_tags || i.tags || [];
    const fromTags = tags
      .filter(t => typeof t === 'string' && t.toLowerCase().startsWith('branche-'))
      .map(t => t.slice('branche-'.length));
    const raw = i.linked_kunde?.branche ?? i.filter_values?.branche ?? i.branche ?? fromTags[0] ?? null;
    if (Array.isArray(raw)) return raw[0]?.trim() || null;
    return (typeof raw === 'string' && raw.trim()) ? raw.trim() : null;
  };
  const getUnternehmen = (i: AnyItem): string | null => {
    const raw = i.linked_kunde?.unternehmen || i.filter_values?.unternehmen || i.unternehmen || null;
    return (typeof raw === 'string' && raw.trim()) ? raw.trim() : null;
  };
  const getKundenname = (i: AnyItem) =>
    i.linked_kunde?.client_name || i.client_name || i.meta_account_name || null;
  const getTitle = (i: AnyItem) => {
    if (i.custom_title) return i.custom_title;
    if (i._type === 'campaign') {
      const branche = i.linked_kunde?.branche || i.filter_values?.branche || i.branche || 'Performance';
      const start = i.start_date || i.campaign_period_start || i.created_at;
      const month = start
        ? new Date(start).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
        : '';
      return month ? `${branche} · ${month}` : String(branche);
    }
    return i.title || i.meta_ad_name || i.meta_campaign_name || 'Unbenannt';
  };
  const getCreated = (i: AnyItem) => i.created_at || i.imported_at || '';

  const capitalizeWords = (s: string) =>
    s.split(/\s+/).map(w => w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');

  const brancheOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const display = new Map<string, string>();
    allItems.forEach(item => {
      const n = getBrancheValue(item);
      if (!n) return;
      counts.set(n, (counts.get(n) || 0) + 1);
      if (!display.has(n)) {
        const raw = getBranche(item);
        display.set(n, raw || capitalizeWords(n));
      }
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([value, count]) => ({ value, label: `${display.get(value) || capitalizeWords(value)} (${count})` }));
  }, [allItems]);

  const unternehmenOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const display = new Map<string, string>();
    allItems.forEach(item => {
      const n = getUnternehmenValue(item);
      if (!n) return;
      counts.set(n, (counts.get(n) || 0) + 1);
      if (!display.has(n)) {
        const raw = getUnternehmen(item);
        display.set(n, raw || capitalizeWords(n));
      }
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([value, count]) => ({ value, label: `${display.get(value) || capitalizeWords(value)} (${count})` }));
  }, [allItems]);

  // Debug logging
  useEffect(() => {
    if (!allItems.length) return;
    console.log('[showcase-filter-debug] Total items:', allItems.length);
    allItems.forEach(item => {
      console.log(`[${item._type}] ${getTitle(item)}`, {
        'linked_kunde.branche': item.linked_kunde?.branche,
        'filter_values.branche': item.filter_values?.branche,
        'item.branche': item.branche,
        'custom_tags': item.custom_tags,
        '→ normalized branche': getBrancheValue(item),
        '→ normalized unternehmen': getUnternehmenValue(item),
      });
    });
    console.log('[showcase-filter-debug] Branche options:', brancheOptions);
    console.log('[showcase-filter-debug] Unternehmen options:', unternehmenOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let out = allItems.filter(item => {
      if (typeFilter !== 'all' && item._type !== typeFilter) return false;
      if (brancheFilter && getBrancheValue(item) !== brancheFilter.toLowerCase().trim()) return false;
      if (unternehmenFilter && getUnternehmenValue(item) !== unternehmenFilter.toLowerCase().trim()) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          item.title, item.custom_title, item.meta_campaign_name, item.meta_ad_name,
          item.client_name, item.meta_account_name,
          getKundenname(item), getBranche(item), getUnternehmen(item),
          ...(item.custom_tags || item.tags || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      if (sortBy === 'featured') {
        const f = Number(!!b.is_featured) - Number(!!a.is_featured);
        if (f !== 0) return f;
        return getCreated(b).localeCompare(getCreated(a));
      }
      if (sortBy === 'oldest') return getCreated(a).localeCompare(getCreated(b));
      if (sortBy === 'kunde') return (getKundenname(a) || '').localeCompare(getKundenname(b) || '');
      return getCreated(b).localeCompare(getCreated(a));
    });

    return out;
  }, [allItems, typeFilter, brancheFilter, unternehmenFilter, searchQuery, sortBy]);

  const counts = {
    all: allItems.length,
    websites: websites.length,
    ads: adCreatives.length,
    performance: campaigns.length,
  };

  const resetFilters = () => {
    setTypeFilter('all');
    setBrancheFilter('');
    setUnternehmenFilter('');
    setSearchQuery('');
    setSortBy('newest');
  };

  const hasActiveFilters =
    typeFilter !== 'all' || brancheFilter || unternehmenFilter || searchQuery;

  return (
    <PageShell>
      <PageHeader
        title={SHOWCASE_COPY.overview.title}
        description={SHOWCASE_COPY.overview.description}
        size="xl"
        centered
      />

      {/* Compact horizontal category tiles — Apple-Settings pattern */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-12">
        <CategoryTile
          label={SHOWCASE_COPY.categories.websites.label}
          description={SHOWCASE_COPY.categories.websites.description}
          count={counts.websites}
          href={`${isPublic ? '/showcase' : '/sales/referenz-showcase'}/websites`}
          icon={Globe}
          gradient="from-teal-500 to-cyan-600"
        />
        <CategoryTile
          label={SHOWCASE_COPY.categories.werbeanzeigen.label}
          description={SHOWCASE_COPY.categories.werbeanzeigen.description}
          count={counts.ads}
          href={`${isPublic ? '/showcase' : '/sales/referenz-showcase'}/werbeanzeigen`}
          icon={Sparkles}
          gradient="from-purple-500 to-pink-600"
        />
        <CategoryTile
          label={SHOWCASE_COPY.categories.adPerformance.label}
          description={SHOWCASE_COPY.categories.adPerformance.description}
          count={counts.performance}
          href={`${isPublic ? '/showcase' : '/sales/referenz-showcase'}/ad-performance`}
          icon={TrendingUp}
          gradient="from-blue-500 to-indigo-600"
        />
      </div>

      {counts.websites + counts.ads + counts.performance === 0 && (
        <OnboardingHint isPublic={isPublic} />
      )}
      <div className="mb-8 space-y-3">
        {/* Row 1: Search full-width */}
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Suchen nach Titel, Kunde, Tag..."
            className="w-full pl-11 pr-4 py-3 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:font-normal font-semibold border border-gray-200 dark:border-gray-800 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 dark:focus:ring-teal-900 focus:outline-none hover:border-gray-300 dark:hover:border-gray-700 rounded-xl transition-all duration-150"
          />
        </div>

        {/* Row 2: All dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <DropdownPill
            label="Sortieren"
            value={sortBy === 'newest' ? '' : sortBy}
            onChange={v => setSortBy((v || 'newest') as any)}
            options={[
              { value: 'oldest', label: 'Älteste' },
              { value: 'featured', label: 'Featured zuerst' },
              { value: 'kunde', label: 'Nach Kunde' },
            ]}
          />
          <DropdownPill
            label="Typ"
            value={typeFilter === 'all' ? '' : typeFilter}
            onChange={v => setTypeFilter((v || 'all') as any)}
            options={[
              { value: 'website', label: `Websites (${counts.websites})` },
              { value: 'werbeanzeige', label: `Anzeigen (${counts.ads})` },
              { value: 'campaign', label: `Kampagnen (${counts.performance})` },
            ]}
          />
          <DropdownPill label="Branche" value={brancheFilter} onChange={setBrancheFilter} options={brancheOptions} />
          <DropdownPill label="Unternehmen" value={unternehmenFilter} onChange={setUnternehmenFilter} options={unternehmenOptions} />
          {(hasActiveFilters || sortBy !== 'newest') && (
            <button onClick={resetFilters} className="ml-auto text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline">
              Alle zurücksetzen
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 text-sm text-gray-500 dark:text-gray-400 tabular-nums">
        <span>
          {hasActiveFilters
            ? `${filteredItems.length} von ${allItems.length}`
            : `${allItems.length} Referenzen`}
        </span>
      </div>

      {filteredItems.length === 0 ? (
        <SurfaceCard padding="none" className="text-center py-20">
          <p className="text-sm text-gray-500 dark:text-gray-400">Keine Referenzen gefunden.</p>
        </SurfaceCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {filteredItems.map(item => (
            <ShowcaseCard key={`${item._type}-${item.id}`} item={item as any} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function CategoryTile({
  label, description, count, href, icon: Icon, gradient,
}: {
  label: string;
  description: string;
  count: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}) {
  return (
    <SurfaceCard
      as={Link}
      to={href}
      interactive
      padding="none"
      className="group flex items-center gap-4 px-5 py-4"
    >
      <div className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
            {label}
          </h3>
          <span className="text-sm font-semibold text-gray-400 dark:text-gray-500 tabular-nums">
            {count}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {description}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-700 dark:group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
    </SurfaceCard>
  );
}

function DropdownPill({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const isActive = !!value;
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`
          appearance-none cursor-pointer
          px-5 py-3 pr-11
          text-sm
          rounded-xl border
          transition-all duration-150
          min-w-[180px]
          outline-none
          ${isActive
            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white shadow-sm font-bold'
            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm font-semibold'
          }
        `}
      >
        <option value="">{label}: Alle</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <svg
        viewBox="0 0 20 20" fill="none"
        className={`absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors ${
          isActive ? 'text-white dark:text-gray-900' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}


function OnboardingHint({ isPublic }: { isPublic: boolean }) {
  if (isPublic) return null;
  return (
    <div className="mb-10 rounded-2xl border border-teal-200 dark:border-teal-900 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/20 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md shrink-0">
          <Lightbulb className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 dark:text-white tracking-tight mb-1">
            So funktioniert dein Showcase
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
            Sammle deine besten Cases an einem Ort. Anzeigen kommen direkt aus Meta, Websites ergänzt du manuell. Im Sales-Call hast du alles in einer Sekunde griffbereit.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <OnboardingStep n="1" title="Meta verbinden" desc="Anzeigen automatisch importieren" />
            <OnboardingStep n="2" title="Websites ergänzen" desc="Landingpages mit Live-Vorschau" />
            <OnboardingStep n="3" title="Mit Prospects teilen" desc="Jeder Case bekommt einen Link" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/sales/referenz-showcase/werbeanzeigen"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" /> Anzeigen importieren
            </Link>
            <Link
              to="/sales/referenz-showcase/websites"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Website hinzufügen
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingStep({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/70 dark:bg-gray-900/40 border border-white/60 dark:border-gray-800/60">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {n}
      </div>
      <div>
        <div className="text-sm font-bold text-gray-900 dark:text-white">{title}</div>
        <div className="text-xs text-gray-600 dark:text-gray-400">{desc}</div>
      </div>
    </div>
  );
}
