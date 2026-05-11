import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Globe, Video, BarChart3, Search, ChevronDown, RefreshCw,
  Image as ImageIcon, Star, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'website' | 'werbeanzeige' | 'campaign'>('all');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [unternehmenFilter, setUnternehmenFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'featured' | 'kunde'>('newest');
  const [syncing, setSyncing] = useState(false);

  const { data: websites = [] } = useQuery({
    queryKey: ['showcase-websites'],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_showcase' as any)
        .select(`*, ${KUNDE_SELECT}`)
        .eq('type', 'website')
        .eq('is_active', true);
      return ((data as any[]) || []).map(w => ({ ...w, _type: 'website' as const }));
    },
  });

  const { data: adCreatives = [] } = useQuery({
    queryKey: ['showcase-ad-creatives'],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select(`*, ${KUNDE_SELECT}`)
        .eq('is_active', true);
      return ((data as any[]) || []).map(a => ({ ...a, _type: 'werbeanzeige' as const }));
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['showcase-campaigns'],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_campaigns' as any)
        .select(`*, ${KUNDE_SELECT}`)
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
  };

  const hasActiveFilters =
    typeFilter !== 'all' || brancheFilter || unternehmenFilter || searchQuery;

  return (
    <div className="min-h-screen bg-[#fafaf7] pb-32">
      <div className="px-6 lg:px-10 pt-10">
        <header className="text-center max-w-3xl mx-auto mb-16 pt-8">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 tracking-tight leading-[1.05]">
            Referenz Showcase
          </h1>
          <p className="text-lg md:text-xl text-gray-500 mt-5 font-normal">
            Alle bisherigen Projekte für Sales-Pitches und Calls
          </p>
        </header>

        {/* Filter panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-8">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Suchen nach Titel, Kunde, Tag..."
                className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-gray-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 focus:outline-none hover:border-gray-300 rounded-xl transition-all duration-150"
              />
            </div>
            <div className="relative inline-block">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="appearance-none cursor-pointer px-5 py-3 pr-11 text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm rounded-xl transition-all duration-150 min-w-[200px] outline-none"
              >
                <option value="newest">Sortieren: Neueste</option>
                <option value="oldest">Älteste</option>
                <option value="featured">Featured zuerst</option>
                <option value="kunde">Nach Kunde</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400" />
            </div>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="px-4 py-3 bg-gray-50 border border-transparent hover:border-gray-200 rounded-xl text-sm cursor-pointer outline-none flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Filter aktualisieren</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} tone="neutral">
              Alle <span className="ml-1.5 text-xs opacity-60">{counts.all}</span>
            </Chip>
            <Chip active={typeFilter === 'website'} onClick={() => setTypeFilter('website')} tone="teal">
              🌐 Websites <span className="ml-1.5 text-xs opacity-60">{counts.websites}</span>
            </Chip>
            <Chip active={typeFilter === 'werbeanzeige'} onClick={() => setTypeFilter('werbeanzeige')} tone="purple">
              🎬 Ad Creatives <span className="ml-1.5 text-xs opacity-60">{counts.ads}</span>
            </Chip>
            <Chip active={typeFilter === 'campaign'} onClick={() => setTypeFilter('campaign')} tone="blue">
              📊 Performance <span className="ml-1.5 text-xs opacity-60">{counts.performance}</span>
            </Chip>
          </div>

          <div className="flex flex-wrap gap-2">
            <DropdownPill label="Branche" value={brancheFilter} onChange={setBrancheFilter} options={brancheOptions} />
            <DropdownPill label="Unternehmen" value={unternehmenFilter} onChange={setUnternehmenFilter} options={unternehmenOptions} />
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-teal-700 hover:underline ml-1 self-center">
                Zurücksetzen
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
          <span>
            {filteredItems.length} {filteredItems.length === 1 ? 'Referenz' : 'Referenzen'}
            {filteredItems.length < allItems.length && ` von ${allItems.length}`}
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <p className="text-sm text-gray-500">Keine Referenzen gefunden.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => (
              <ShowcaseCard
                key={`${item._type}-${item.id}`}
                item={item}
                getKundenname={getKundenname}
                getBranche={getBranche}
                getTitle={getTitle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryTile({
  label, count, countLabel, href, accent,
}: {
  label: string;
  count: number;
  countLabel?: string;
  href: string;
  accent: string;
}) {
  const labelText = countLabel || (count === 1 ? 'Referenz' : 'Referenzen');

  return (
    <Link
      to={href}
      className="group relative block bg-white rounded-2xl border border-gray-200/80 px-8 py-10 text-center shadow-sm hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
    >
      {/* Accent line on hover */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${accent} opacity-0 group-hover:opacity-100 transition-opacity`} />

      <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
        {label}
      </h3>
      <p className="text-sm text-gray-500 mt-2 font-normal">
        {count} {labelText}
      </p>
    </Link>
  );
}

function Chip({
  active, onClick, tone, children,
}: { active: boolean; onClick: () => void; tone: 'neutral' | 'teal' | 'purple' | 'blue'; children: React.ReactNode }) {
  const activeClasses = {
    neutral: 'bg-gray-900 text-white border-gray-900',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        active ? activeClasses : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function DropdownPill({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const isActive = !!value;
  const activeOption = options.find(o => o.value === value);
  const displayLabel = activeOption ? activeOption.label : `${label}: Alle`;
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`
          appearance-none cursor-pointer
          px-5 py-3 pr-11
          text-sm font-medium
          rounded-xl border
          transition-all duration-150
          min-w-[180px]
          outline-none
          ${isActive
            ? 'bg-white text-gray-900 border-teal-400 ring-1 ring-teal-100 shadow-sm'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm'
          }
        `}
      >
        <option value="">{label}: Alle</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className={`
        absolute right-3.5 top-1/2 -translate-y-1/2
        w-4 h-4 pointer-events-none transition-colors
        ${isActive ? 'text-teal-500' : 'text-gray-400'}
      `} />
    </div>
  );
}

function ShowcaseCard({
  item, getKundenname, getBranche, getTitle,
}: {
  item: AnyItem;
  getKundenname: (i: AnyItem) => string | null;
  getBranche: (i: AnyItem) => string | null;
  getTitle: (i: AnyItem) => string;
}) {
  const detailHref =
    item._type === 'website' ? `/sales/referenz-showcase/websites/${item.id}` :
    item._type === 'werbeanzeige' ? `/sales/referenz-showcase/werbeanzeigen/${item.id}` :
    `/sales/referenz-showcase/ad-performance/${item.id}`;

  const kunde = getKundenname(item);
  const branche = getBranche(item);
  const unternehmen =
    item.linked_kunde?.unternehmen || item.filter_values?.unternehmen || item.unternehmen || null;
  const externalLink =
    item.external_link || item.website_url || item.notion_url || item.original_url || null;

  const eyebrow = (kunde || '').trim();
  const title = getTitle(item);

  const metaParts: string[] = [];
  if (branche) metaParts.push(branche);
  if (unternehmen && typeof unternehmen === 'string') metaParts.push(unternehmen);
  if (item._type === 'campaign') {
    if (item.date_range) metaParts.push(item.date_range);
    const spend = item.metrics?.spend;
    if (spend != null && !isNaN(Number(spend))) {
      metaParts.push(`€${Math.round(Number(spend)).toLocaleString('de-DE')} Spend`);
    }
  }

  return (
    <Link
      to={detailHref}
      className="group block bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-gray-300 transition-all duration-200 overflow-hidden"
    >
      <div className="relative bg-gray-50 overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
        {item._type === 'campaign'
          ? <PerformanceHero campaign={item} />
          : <ImageContent item={item} />}
        <TypeIndicator type={item._type} />
        {item.is_featured && (
          <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow-md">
            <Star className="w-4 h-4 text-white" fill="currentColor" />
          </div>
        )}
      </div>

      <div className="p-5">
        {eyebrow && (
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 truncate">
            {eyebrow}
          </p>
        )}

        <h3 className="text-lg font-bold text-gray-900 leading-snug mb-3 line-clamp-2 min-h-[3.5rem] group-hover:text-teal-700 transition-colors">
          {title}
        </h3>

        <PrimaryHighlight item={item} />

        {metaParts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            {metaParts.map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300">·</span>}
                <span>{part}</span>
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 my-4" />

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-teal-600 group-hover:text-teal-700 group-hover:underline transition-all">
            Ansehen →
          </span>
          {externalLink && (
            <a
              href={externalLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Original</span>
            </a>
          )}
          {!externalLink && item.created_at && (
            <span className="text-xs text-gray-400 font-medium">
              {formatRelativeDate(item.created_at)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function PrimaryHighlight({ item }: { item: AnyItem }) {
  if (item._type === 'campaign') {
    const roas = item.metrics?.roas != null ? Number(item.metrics.roas) : null;
    const leads = item.metrics?.leads != null ? Number(item.metrics.leads) : null;
    if (roas != null && !isNaN(roas)) {
      return <p className="text-2xl font-bold text-teal-600 mb-3 tabular-nums">{roas.toFixed(1)}x ROAS</p>;
    }
    if (leads != null && !isNaN(leads)) {
      return <p className="text-2xl font-bold text-teal-600 mb-3 tabular-nums">{leads.toLocaleString('de-DE')} Leads</p>;
    }
    return null;
  }
  if (item._type === 'website' && item.is_active) {
    return (
      <p className="text-sm font-semibold text-teal-600 mb-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
        Live
      </p>
    );
  }
  if (item._type === 'werbeanzeige') {
    return (
      <p className="text-sm font-semibold text-purple-600 mb-3">
        {item.creative_format || item.ad_format || 'Creative'}
      </p>
    );
  }
  return null;
}

function ImageContent({ item }: { item: AnyItem }) {
  const imageUrl =
    item.thumbnail_url ||
    item.fallback_image_url ||
    item.preview_image_url ||
    item.thumbnail_url_persisted ||
    item.thumbnail_url_meta;

  if (!imageUrl) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <ImageIcon className="w-10 h-10 text-gray-300" />
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt={item.title || item.meta_ad_name || ''}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      loading="lazy"
    />
  );
}

function PerformanceHero({ campaign }: { campaign: AnyItem }) {
  const m = campaign.metrics || {};
  const num = (v: any): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const roas = num(m.roas) ?? num(campaign.roas) ?? num(m.ROAS);
  const cpl = num(m.cpl) ?? num(campaign.cpl) ?? num(m.CPL);
  const leads = num(m.leads) ?? num(campaign.leads) ?? num(m.Leads);

  const tier: 'exceptional' | 'good' | 'standard' | 'none' =
    roas == null || isNaN(roas) ? 'none' :
    roas >= 4 ? 'exceptional' :
    roas >= 2.5 ? 'good' : 'standard';

  const tierStyles = {
    exceptional: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white',
    good: 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white',
    standard: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700',
    none: 'bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400',
  }[tier];

  return (
    <div className={`w-full h-full flex flex-col justify-center items-center p-6 relative overflow-hidden ${tierStyles}`}>
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
      <div className="relative z-10 text-center">
        <p className="text-xs uppercase tracking-[0.25em] opacity-80 mb-1.5 font-medium">ROAS</p>
        <p className="text-7xl font-bold leading-none tracking-tight tabular-nums">
          {roas != null && !isNaN(roas) ? (
            <>{roas.toFixed(1)}<span className="text-3xl ml-1 opacity-80">x</span></>
          ) : '—'}
        </p>
      </div>
      <div className="relative z-10 grid grid-cols-2 gap-3 mt-6 w-full max-w-[240px]">
        <div className="text-center bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider opacity-80 font-medium">CPL</p>
          <p className="font-semibold text-base mt-0.5 tabular-nums">
            {cpl != null && !isNaN(cpl) ? `€${cpl.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="text-center bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider opacity-80 font-medium">Leads</p>
          <p className="font-semibold text-base mt-0.5 tabular-nums">
            {leads != null && !isNaN(leads) ? leads.toLocaleString('de-DE') : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function TypeIndicator({ type }: { type: AnyItem['_type'] }) {
  const config = {
    website: { label: 'Website', Icon: Globe, color: 'bg-teal-600/95' },
    werbeanzeige: { label: 'Ad', Icon: Video, color: 'bg-purple-600/95' },
    campaign: { label: 'Performance', Icon: BarChart3, color: 'bg-blue-600/95' },
  }[type];
  const { Icon } = config;
  return (
    <div className={`absolute top-3 right-3 ${config.color} backdrop-blur-md text-white text-[11px] px-2 py-1 rounded-md flex items-center gap-1 font-medium shadow-sm`}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </div>
  );
}
