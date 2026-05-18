import { Link } from 'react-router-dom';
import {
  ChevronDown, Search, Star, ExternalLink, X,
  Image as ImageIcon, Video, BarChart3, Inbox, Check, Flame, Euro,
  Tag, Building2,
} from 'lucide-react';
import * as React from 'react';
import { useIsPublicView } from '@/hooks/useIsPublicView';
import { PageShell } from '@/components/layout/PageShell';
import { getBrancheDisplay } from '@/lib/branchen';
import { pickBrancheLabel, pickClientName, pickUnternehmenLabel } from '@/lib/showcaseFkSelect';
import { PageHeader } from '@/components/layout/PageHeader';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { isTopPerformer } from '@/lib/topPerformer';
import { getAdLiveStatus, type AdLiveStatus } from '@/lib/adStatus';

export type AnyItem = Record<string, any> & {
  _type: 'website' | 'werbeanzeige' | 'campaign';
};

/* ------------------------------------------------------------------ */
/* Layout wrapper — delegates to PageShell                            */
/* ------------------------------------------------------------------ */
export function ShowcasePageWrapper({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}

/* ------------------------------------------------------------------ */
/* SubPageHeader — delegates to PageHeader (size="lg")                */
/* ------------------------------------------------------------------ */
export function SubPageHeader({
  title, subtitle, actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  const isPublic = useIsPublicView();
  return (
    <PageHeader
      breadcrumb={{
        label: 'Referenz Showcase',
        href: isPublic ? '/showcase' : '/sales/referenz-showcase',
      }}
      title={title}
      description={subtitle}
      actions={actions}
      size="lg"
      align="center"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Search input                                                       */
/* ------------------------------------------------------------------ */
export function ShowcaseSearchInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-[240px]">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Suchen nach Titel, Kunde, Tag...'}
        className="w-full pl-11 pr-4 py-3 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:font-normal font-semibold border border-gray-200 dark:border-gray-800 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 dark:focus:ring-teal-900 focus:outline-none hover:border-gray-300 dark:hover:border-gray-700 rounded-xl transition-all duration-150"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DropdownPill                                                       */
/* ------------------------------------------------------------------ */
export function DropdownPill({
  label, value, onChange, options, icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
  icon?: React.ComponentType<{ className?: string }>;
  /** kept for backward-compat, unused */
  minWidth?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const isActive = !!value;
  const activeOption = options.find(o => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all ${
          isActive
            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white shadow-sm'
            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{isActive ? activeOption?.label ?? value : label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[200px] max-h-72 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl py-1.5">
          {isActive && (
            <>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <X className="w-3 h-3" /> Filter entfernen
              </button>
              <div className="my-1 mx-3 h-px bg-gray-100 dark:bg-gray-800" />
            </>
          )}
          {options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500 text-center">Keine Werte verfügbar</div>
          ) : (
            options.map(opt => (
              <button
                type="button"
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm transition-colors ${
                  value === opt.value
                    ? 'bg-gray-100 dark:bg-gray-800 font-semibold text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <span className="truncate text-left">{opt.label}</span>
                {opt.count !== undefined && (
                  <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{opt.count}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */
export function ShowcaseEmptyState({
  title = 'Keine Ergebnisse',
  subtitle = 'Versuche es mit anderen Filtern oder lade neue Referenzen hoch.',
  action,
}: { title?: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <SurfaceCard padding="none" className="text-center py-20">
      <Inbox className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      {action && <div className="mt-5">{action}</div>}
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------ */
/* Result count                                                        */
/* ------------------------------------------------------------------ */
export function ResultCount({ count, singular, plural }: { count: number; singular: string; plural: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
        {count} {count === 1 ? singular : plural}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card helpers                                                        */
/* ------------------------------------------------------------------ */
function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'heute';
  if (days < 2) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Mon.`;
  return d.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
}

export function getShowcaseTitle(i: AnyItem): string {
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
}

export function getShowcaseKundenname(i: AnyItem): string | null {
  return pickClientName(i) || i.linked_kunde?.client_name || i.client_name || i.meta_account_name || null;
}

export function getShowcaseBranche(i: AnyItem): string | null {
  const fk = pickBrancheLabel(i);
  if (fk) return getBrancheDisplay(fk, 'short') ?? fk;
  const raw = i.linked_kunde?.branche ?? i.filter_values?.branche ?? i.branche ?? null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !value.trim()) return null;
  return getBrancheDisplay(value, 'short') ?? value.trim();
}

export function getShowcaseUnternehmen(i: AnyItem): string | null {
  return pickUnternehmenLabel(i) || i.linked_kunde?.unternehmen || i.filter_values?.unternehmen || i.unternehmen || null;
}

/* ------------------------------------------------------------------ */
/* ShowcaseCard                                                        */
/* ------------------------------------------------------------------ */
export function ShowcaseCard({ item }: { item: AnyItem }) {
  if (item._type === 'werbeanzeige') {
    return <AdCreativeCard item={item} />;
  }
  const isPublic = useIsPublicView();
  const basePath = isPublic ? '/showcase' : '/sales/referenz-showcase';
  const detailHref =
    item._type === 'website' ? `${basePath}/websites/${item.id}` :
    `${basePath}/ad-performance/${item.id}`;

  const kunde = getShowcaseKundenname(item);
  const branche = getShowcaseBranche(item);
  const unternehmen =
    item.linked_kunde?.unternehmen || item.filter_values?.unternehmen || item.unternehmen || null;
  const externalLink =
    item.external_link || item.website_url || item.notion_url || item.original_url || null;

  const eyebrow = (kunde || '').trim();
  const title = getShowcaseTitle(item);

  return (
    <SurfaceCard
      as={Link}
      to={detailHref}
      interactive
      padding="none"
      className="group h-full flex flex-col overflow-hidden"
    >
      <div className="relative bg-gray-50 dark:bg-gray-800 overflow-hidden shrink-0" style={{ aspectRatio: '16 / 9' }}>
        {item._type === 'campaign'
          ? <PerformanceHero campaign={item} />
          : <ImageContent item={item} />}
        <TypeIndicator item={item} />
        {item.is_featured && (
          <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow-md">
            <Star className="w-4 h-4 text-white" fill="currentColor" />
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="space-y-1.5">
          {eyebrow && (
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em] truncate">
              {eyebrow}
            </p>
          )}

          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
            {title}
          </h3>

          <div className="pt-1">
            <PrimaryHighlight item={item} branche={branche} />
          </div>
        </div>

        <div className="flex-1" />

        {item._type === 'website' && item.key_features?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {item.key_features.slice(0, 3).map((feat: string, i: number) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg"
              >
                <Check className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="truncate max-w-[140px]">{feat}</span>
              </span>
            ))}
            {item.key_features.length > 3 && (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 rounded-lg">
                +{item.key_features.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 mt-4 pt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-teal-600 dark:text-teal-400 group-hover:translate-x-0.5 transition-transform">
            Ansehen →
          </span>
          {externalLink ? (
            <a
              href={externalLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Original</span>
            </a>
          ) : item.created_at ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              {formatRelativeDate(item.created_at)}
            </span>
          ) : null}
        </div>
      </div>
    </SurfaceCard>
  );
}

function PrimaryHighlight({ item, branche }: { item: AnyItem; branche?: string | null }) {
  if (item._type === 'campaign') {
    const roas = item.metrics?.roas != null ? Number(item.metrics.roas) : null;
    const leads = item.metrics?.leads != null ? Number(item.metrics.leads) : null;
    if (roas != null && !isNaN(roas)) {
      return <p className="text-xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">{roas.toFixed(1)}x ROAS</p>;
    }
    if (leads != null && !isNaN(leads)) {
      return <p className="text-xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">{leads.toLocaleString('de-DE')} Leads</p>;
    }
    return null;
  }
  if (item._type === 'website') {
    if (!branche) return null;
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-500 dark:text-gray-400 capitalize truncate">{branche}</span>
      </div>
    );
  }
  if (item._type === 'werbeanzeige') {
    const isVideo = item.ad_format === 'video' || item.ad_format === 'reel';
    return (
      <div className="flex items-center gap-1.5 text-sm">
        {isVideo ? <Video className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> : <ImageIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />}
        <span className="text-purple-600 dark:text-purple-400 font-semibold">
          {item.creative_format || item.ad_format || (isVideo ? 'Video' : 'Image')}
        </span>
        {branche && (
          <>
            <span className="text-gray-300 dark:text-gray-700">·</span>
            <span className="text-gray-500 dark:text-gray-400 capitalize truncate">{branche}</span>
          </>
        )}
      </div>
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
      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
        <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
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
    standard: 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 text-slate-700 dark:text-slate-200',
    none: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 text-gray-400 dark:text-gray-500',
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

function TypeIndicator({ item }: { item: AnyItem }) {
  if (item._type === 'website') {
    // No badges on website cards (cleaner look)
    return null;
  }
  const config = {
    werbeanzeige: { label: 'Ad', Icon: Video, color: 'bg-purple-600/95' },
    campaign: { label: 'Performance', Icon: BarChart3, color: 'bg-blue-600/95' },
  }[item._type as 'werbeanzeige' | 'campaign'];
  if (!config) return null;
  const { Icon } = config;
  return (
    <div className={`absolute top-3 right-3 ${config.color} backdrop-blur-md text-white text-[11px] px-2 py-1 rounded-md flex items-center gap-1 font-medium shadow-sm`}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primary action button (teal pill)                                  */
/* ------------------------------------------------------------------ */
export function PrimaryActionButton({
  onClick, children, disabled,
}: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium shadow-sm transition-colors"
    >
      {children}
    </button>
  );
}

export function SecondaryActionButton({
  onClick, children, disabled,
}: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* AdCreativeCard — 1:1 square w/ sales metrics                       */
/* ------------------------------------------------------------------ */
const TOP_CPL_THRESHOLDS: Record<string, number> = {
  PKV: 50,
  BU: 40,
  KFZ: 8,
  Tierkrankenversicherung: 12,
  Rechtsschutz: 15,
  default: 10,
};

function MetricMini({
  label, value, highlight,
}: { label: string; value: string; highlight?: 'green' | 'red' | null }) {
  const valueClass =
    highlight === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
    highlight === 'red' ? 'text-red-600 dark:text-red-400' :
    'text-gray-900 dark:text-white';
  return (
    <div className="text-center min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-0.5">
        {label}
      </div>
      <div className={`text-sm font-extrabold tabular-nums truncate ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function LiveStatusBadge({ ad }: { ad: any }) {
  const status: AdLiveStatus = getAdLiveStatus(ad);
  if (status === 'unknown') return null;
  const config = {
    live:    { label: 'Live',     bg: 'bg-emerald-500/95', pulse: true },
    paused:  { label: 'Pausiert', bg: 'bg-amber-500/95',   pulse: false },
    offline: { label: 'Offline',  bg: 'bg-gray-700/95',    pulse: false },
  }[status];
  return (
    <div className={`absolute top-3 left-3 z-10 inline-flex items-center gap-1 ${config.bg} backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-white ${config.pulse ? 'animate-pulse' : ''}`} />
      {config.label}
    </div>
  );
}

export function AdCreativeCard({ item }: { item: AnyItem }) {
  const isPublic = useIsPublicView();
  const basePath = isPublic ? '/showcase' : '/sales/referenz-showcase';
  const detailHref = `${basePath}/werbeanzeigen/${item.id}`;

  const eyebrowText = (getShowcaseKundenname(item) || 'Anzeige').toUpperCase();
  const titleText = getShowcaseTitle(item);
  const branche = getShowcaseBranche(item);

  const m = item.metrics || item.meta_metrics || {};
  const num = (v: any): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const cpl = num(m.cpl) ?? num(item.cpl);
  const leads = num(m.leads) ?? num(item.leads);
  const ctr = num(m.ctr) ?? num(item.ctr);
  const spend = num(m.spend) ?? num(item.spend);

  const isWinning = isTopPerformer(item as any);

  const isVideo = item.ad_format === 'video' || item.ad_format === 'reel' || item.creative_format === 'video';
  const isCarousel = item.ad_format === 'carousel' || item.creative_format === 'carousel';
  const formatLabel = isVideo ? 'Video' : isCarousel ? 'Carousel' : 'Image';
  const FormatIcon = isVideo ? Video : ImageIcon;

  const imageUrl =
    item.thumbnail_url_persisted ||
    item.thumbnail_url ||
    item.thumbnail_url_meta ||
    item.fallback_image_url ||
    item.preview_image_url;

  const hasMetrics = cpl != null || leads != null || ctr != null;

  // CTR may be stored as 0-1 or as percentage. Heuristic: if <=1, treat as fraction.
  const ctrDisplay = ctr == null ? '—' : ctr <= 1 ? `${(ctr * 100).toFixed(1)}%` : `${ctr.toFixed(1)}%`;

  return (
    <SurfaceCard
      as={Link}
      to={detailHref}
      interactive
      padding="none"
      className="group h-full flex flex-col overflow-hidden"
    >
      <div className="relative aspect-square bg-gray-50 dark:bg-gray-800 shrink-0 overflow-hidden">
        {isVideo && item.video_url ? (
          <video
            src={item.video_url}
            poster={imageUrl}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={titleText}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Top-LEFT: Live status */}
        <LiveStatusBadge ad={item as any} />

        {/* Top-RIGHT: Top OR Format */}
        <div className="absolute top-3 right-3">
          {isWinning ? (
            <span className="inline-flex items-center gap-1 bg-emerald-500/95 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm">
              <Flame className="w-2.5 h-2.5" />
              Top
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-gray-900/85 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm">
              <FormatIcon className="w-2.5 h-2.5" />
              {formatLabel}
            </span>
          )}
        </div>

        {item.is_featured && (
          <div className="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow-md">
            <Star className="w-4 h-4 text-white" fill="currentColor" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>

      <div className="p-5 flex flex-col flex-1">
        {/* SECTION 1: Identity */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em] truncate">
            {eyebrowText}
          </p>
          <h3 className="text-base font-extrabold text-gray-900 dark:text-white leading-tight line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
            {titleText}
          </h3>
        </div>

        {/* SECTION 2: Meta-Pills (Branche + Unternehmen) */}
        {(branche || item.linked_kunde?.unternehmen) && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            {branche && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-semibold rounded-md">
                <Tag className="w-2.5 h-2.5 text-gray-400" />
                <span className="capitalize truncate max-w-[100px]">{branche}</span>
              </span>
            )}
            {item.linked_kunde?.unternehmen && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-semibold rounded-md">
                <Building2 className="w-2.5 h-2.5 text-gray-400" />
                <span className="truncate max-w-[100px]">{item.linked_kunde.unternehmen}</span>
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {hasMetrics && (
          <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <MetricMini
              label="CPL"
              value={cpl != null ? `€${cpl.toFixed(2)}` : '—'}
              highlight={isWinning ? 'green' : null}
            />
            <MetricMini
              label="Leads"
              value={leads != null ? leads.toLocaleString('de-DE') : '—'}
            />
            <MetricMini label="CTR" value={ctrDisplay} />
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 mt-4 pt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-teal-600 dark:text-teal-400 group-hover:translate-x-0.5 transition-transform">
            Ansehen →
          </span>
          {spend != null ? (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 tabular-nums">
              <Euro className="w-3 h-3" />
              {Math.round(spend).toLocaleString('de-DE')} Spend
            </span>
          ) : item.created_at ? (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {new Date(item.created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}
            </span>
          ) : null}
        </div>
      </div>
    </SurfaceCard>
  );
}
