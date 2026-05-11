import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Globe, Video, BarChart3, Search, ChevronDown, Image as ImageIcon, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type AnyItem = Record<string, any> & { _type: 'website' | 'werbeanzeige' | 'campaign' };

const KUNDE_SELECT = 'linked_kunde:close_deals(client_name, unternehmen, branche)';

export default function ReferenzShowcaseOverview() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'website' | 'werbeanzeige' | 'campaign'>('all');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [unternehmenFilter, setUnternehmenFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'featured' | 'kunde'>('newest');

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

  const allItems = useMemo<AnyItem[]>(
    () => [...websites, ...adCreatives, ...campaigns],
    [websites, adCreatives, campaigns],
  );

  const getBranche = (i: AnyItem) => i.linked_kunde?.branche || i.filter_values?.branche || i.branche || null;
  const getUnternehmen = (i: AnyItem) => i.linked_kunde?.unternehmen || i.filter_values?.unternehmen || null;
  const getKundenname = (i: AnyItem) =>
    i.linked_kunde?.client_name || i.client_name || i.meta_account_name || null;
  const getTitle = (i: AnyItem) =>
    i.custom_title || i.title || i.meta_campaign_name || i.meta_ad_name || 'Unbenannt';
  const getCreated = (i: AnyItem) => i.created_at || i.imported_at || '';

  const brancheOptions = useMemo(
    () => Array.from(new Set(allItems.map(getBranche).filter(Boolean))) as string[],
    [allItems],
  );
  const unternehmenOptions = useMemo(
    () => Array.from(new Set(allItems.map(getUnternehmen).filter(Boolean))) as string[],
    [allItems],
  );

  const filteredItems = useMemo(() => {
    let out = allItems.filter(item => {
      if (typeFilter !== 'all' && item._type !== typeFilter) return false;
      if (brancheFilter && getBranche(item) !== brancheFilter) return false;
      if (unternehmenFilter && getUnternehmen(item) !== unternehmenFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          item.title,
          item.custom_title,
          item.meta_campaign_name,
          item.meta_ad_name,
          item.client_name,
          item.meta_account_name,
          getKundenname(item),
          getBranche(item),
          getUnternehmen(item),
          ...(item.custom_tags || item.tags || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
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
    <div className="p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Referenz Showcase</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Alle bisherigen Projekte für Sales-Pitches und Calls.
        </p>
      </header>

      {/* Category tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <CategoryTile
          icon={<Globe className="w-9 h-9" />}
          label="Websites"
          count={counts.websites}
          href="/sales/referenz-showcase/websites"
          unit="Referenz"
          unitPlural="Referenzen"
        />
        <CategoryTile
          icon={<Video className="w-9 h-9" />}
          label="Ad Creatives"
          count={counts.ads}
          href="/sales/referenz-showcase/werbeanzeigen"
          unit="Referenz"
          unitPlural="Referenzen"
        />
        <CategoryTile
          icon={<BarChart3 className="w-9 h-9" />}
          label="Ad Performance"
          count={counts.performance}
          href="/sales/referenz-showcase/ad-performance"
          unit="Kampagne"
          unitPlural="Kampagnen"
        />
      </div>

      {/* Filter bar */}
      <div className="space-y-3 mb-6">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Suchen nach Titel, Kunde, Tag..."
              className="w-full pl-10 pr-3 h-10 bg-background border border-border rounded-md text-sm"
            />
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="appearance-none pl-3 pr-9 h-10 bg-background border border-border rounded-md text-sm"
            >
              <option value="newest">Sortieren: Neueste</option>
              <option value="oldest">Älteste</option>
              <option value="featured">Featured zuerst</option>
              <option value="kunde">Nach Kunde</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Typ:</span>
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label={`Alle ${counts.all}`} />
          <FilterChip active={typeFilter === 'website'} onClick={() => setTypeFilter('website')} label={`🌐 Websites ${counts.websites}`} />
          <FilterChip active={typeFilter === 'werbeanzeige'} onClick={() => setTypeFilter('werbeanzeige')} label={`🎬 Ads ${counts.ads}`} />
          <FilterChip active={typeFilter === 'campaign'} onClick={() => setTypeFilter('campaign')} label={`📊 Performance ${counts.performance}`} />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <DropdownFilter label="Branche" value={brancheFilter} onChange={setBrancheFilter} options={brancheOptions} />
          <DropdownFilter label="Unternehmen" value={unternehmenFilter} onChange={setUnternehmenFilter} options={unternehmenOptions} />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {filteredItems.length} {filteredItems.length === 1 ? 'Referenz' : 'Referenzen'}
            {filteredItems.length < allItems.length && ` von ${allItems.length}`}
          </span>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="text-primary hover:underline text-xs">
              Alle Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Keine Referenzen gefunden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {filteredItems.map(item => (
            <ShowcaseCard key={`${item._type}-${item.id}`} item={item} getKundenname={getKundenname} getBranche={getBranche} getTitle={getTitle} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryTile({
  icon, label, count, href, unit, unitPlural,
}: { icon: React.ReactNode; label: string; count: number; href: string; unit: string; unitPlural: string }) {
  return (
    <Link
      to={href}
      className="block bg-card border border-border hover:border-primary/60 hover:shadow-md rounded-xl p-6 transition-all group"
    >
      <div className="text-primary mb-3">{icon}</div>
      <h3 className="text-lg font-semibold">{label}</h3>
      <p className="text-xs text-muted-foreground mt-2 tabular-nums">
        {count} {count === 1 ? unit : unitPlural}
      </p>
    </Link>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 h-7 rounded-full border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background border-border hover:border-primary/60 text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function DropdownFilter({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  if (options.length === 0) return null;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 h-9 bg-background border border-border rounded-md text-sm"
      >
        <option value="">{label}: Alle</option>
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-muted-foreground" />
    </div>
  );
}

function ShowcaseCard({
  item, getKundenname, getBranche, getTitle,
}: { item: AnyItem; getKundenname: (i: AnyItem) => string | null; getBranche: (i: AnyItem) => string | null; getTitle: (i: AnyItem) => string }) {
  const detailHref =
    item._type === 'website' ? `/sales/referenz-showcase/websites/${item.id}` :
    item._type === 'werbeanzeige' ? `/sales/referenz-showcase/werbeanzeigen/${item.id}` :
    `/sales/referenz-showcase/ad-performance/${item.id}`;

  const kunde = getKundenname(item);
  const branche = getBranche(item);

  return (
    <Link
      to={detailHref}
      className="block bg-card border border-border hover:border-primary/60 hover:shadow-md rounded-lg overflow-hidden transition-all group"
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
        {item._type === 'campaign' ? (
          <PerformanceCardVisual campaign={item} />
        ) : (
          <ImageCardVisual item={item} />
        )}
        <TypeBadge type={item._type} />
        {item.is_featured && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1">
            <Star className="w-3 h-3" fill="currentColor" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[11px] text-muted-foreground truncate">
          {kunde || '—'}
          {branche && <span> · {branche}</span>}
        </p>
        <h3 className="text-sm font-medium truncate mt-0.5">{getTitle(item)}</h3>
      </div>
    </Link>
  );
}

function ImageCardVisual({ item }: { item: AnyItem }) {
  const imageUrl =
    item.thumbnail_url ||
    item.fallback_image_url ||
    item.preview_image_url ||
    item.thumbnail_url_persisted ||
    item.thumbnail_url_meta;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={item.title || item.meta_ad_name || ''}
        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-full h-full bg-muted flex items-center justify-center">
      <ImageIcon className="w-10 h-10 text-muted-foreground" />
    </div>
  );
}

function PerformanceCardVisual({ campaign }: { campaign: AnyItem }) {
  const m = campaign.metrics || {};
  const roas = typeof m.roas === 'number' ? m.roas : (m.roas ? Number(m.roas) : null);
  const cpl = typeof m.cpl === 'number' ? m.cpl : (m.cpl ? Number(m.cpl) : null);
  const leads = m.leads != null ? Number(m.leads) : null;

  return (
    <div className="w-full h-full bg-gradient-to-br from-muted via-muted/50 to-background flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">ROAS</p>
        <p className="text-4xl font-bold tabular-nums text-foreground">
          {roas != null && !isNaN(roas) ? `${roas.toFixed(1)}x` : '—'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] w-full max-w-[180px]">
        <div className="text-center bg-background/80 rounded px-2 py-1">
          <p className="text-muted-foreground">CPL</p>
          <p className="font-semibold tabular-nums">{cpl != null && !isNaN(cpl) ? `€${cpl.toFixed(2)}` : '—'}</p>
        </div>
        <div className="text-center bg-background/80 rounded px-2 py-1">
          <p className="text-muted-foreground">Leads</p>
          <p className="font-semibold tabular-nums">{leads != null && !isNaN(leads) ? leads.toLocaleString('de-DE') : '—'}</p>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: AnyItem['_type'] }) {
  const config = {
    website: { icon: '🌐', label: 'Website' },
    werbeanzeige: { icon: '🎬', label: 'Ad' },
    campaign: { icon: '📊', label: 'Performance' },
  }[type];
  return (
    <div className="absolute top-2 right-2 bg-background/90 backdrop-blur text-[10px] uppercase font-medium rounded px-2 py-0.5 border border-border">
      {config.icon} {config.label}
    </div>
  );
}
