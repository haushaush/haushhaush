import { entityStatusBadge, flatInsights, formatBudgetMinor, formatCurrency, formatDecimal, formatNumber, formatPercent } from './metaUtils';

export type ColumnId =
  | 'name'
  | 'status'
  | 'objective'
  | 'budget'
  | 'spend'
  | 'impressionen'
  | 'klicks'
  | 'ctr'
  | 'cpc'
  | 'cpm'
  | 'reichweite'
  | 'frequenz'
  | 'results'
  | 'cost_per_result'
  | 'roas'
  | 'video_views'
  | 'video_view_rate'
  | 'link_clicks'
  | 'landing_page_views'
  | 'add_to_cart'
  | 'purchases'
  | 'purchase_roas'
  | 'leads'
  | 'cost_per_lead'
  | 'unique_clicks'
  | 'unique_ctr'
  | 'thumb_stop_rate'
  | 'thumbnail';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  alwaysVisible?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Render the cell value for a row. */
  render: (row: any, currency: string) => React.ReactNode;
}

// ---------- Helpers to extract action values ----------
// Sums all matching action types — use ONLY when types are mutually exclusive
// (e.g. video_view aggregates). Never use for leads/purchases/atc — Meta returns
// duplicate entries (e.g. `lead` AND `onsite_conversion.lead_grouped`) which
// would double-count. Use `priorityActionValue` instead.
function actionValue(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
}

// Returns the value of the FIRST matching action_type in priority order.
// Use this for conversion metrics where Meta sends overlapping action types.
function priorityActionValue(actions: any[] | undefined, priority: string[]): number {
  if (!Array.isArray(actions)) return 0;
  for (const type of priority) {
    const match = actions.find((a) => a.action_type === type);
    if (match) return parseFloat(match.value) || 0;
  }
  return 0;
}

// Action priority orders — single source of truth
const LEAD_PRIORITY = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen.other'];
const PURCHASE_PRIORITY = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
const ADD_TO_CART_PRIORITY = ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'];

function videoWatched(ins: any): number {
  // Use 25% as the "video views" proxy (Meta convention) — fall back to video_play_actions
  const p25 = actionValue(ins.video_p25_watched_actions, [
    'video_view',
    'video_p25_watched_actions',
  ]);
  if (p25 > 0) return p25;
  const plays = actionValue(ins.video_play_actions, ['video_play', 'video_play_actions']);
  return plays;
}

// ---------- Renderers ----------
const StatusCell = (row: any) => {
  const b = entityStatusBadge(row.status);
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${b.className}`}>
      {b.label}
    </span>
  );
};

const budgetCell = (row: any, currency: string) => {
  if (row.daily_budget) return `${formatBudgetMinor(row.daily_budget, currency)} / Tag`;
  if (row.lifetime_budget) return `${formatBudgetMinor(row.lifetime_budget, currency)} gesamt`;
  return '–';
};

// ---------- Common metric column factories ----------
const metricCols = (): ColumnDef[] => [
  {
    id: 'spend',
    label: 'Spend',
    align: 'right',
    render: (r, c) => <span className="font-mono">{formatCurrency(flatInsights(r.insights).spend, c)}</span>,
  },
  {
    id: 'impressionen',
    label: 'Impressionen',
    align: 'right',
    render: (r) => <span className="font-mono">{formatNumber(flatInsights(r.insights).impressions)}</span>,
  },
  {
    id: 'klicks',
    label: 'Klicks',
    align: 'right',
    render: (r) => <span className="font-mono">{formatNumber(flatInsights(r.insights).clicks)}</span>,
  },
  {
    id: 'ctr',
    label: 'CTR',
    align: 'right',
    render: (r) => <span className="font-mono">{formatPercent(flatInsights(r.insights).ctr)}</span>,
  },
  {
    id: 'cpc',
    label: 'CPC',
    align: 'right',
    render: (r, c) => <span className="font-mono">{formatCurrency(flatInsights(r.insights).cpc, c)}</span>,
  },
  {
    id: 'cpm',
    label: 'CPM',
    align: 'right',
    render: (r, c) => <span className="font-mono">{formatCurrency(flatInsights(r.insights).cpm, c)}</span>,
  },
  {
    id: 'reichweite',
    label: 'Reichweite',
    align: 'right',
    render: (r) => <span className="font-mono">{formatNumber(flatInsights(r.insights).reach)}</span>,
  },
  {
    id: 'frequenz',
    label: 'Frequenz',
    align: 'right',
    render: (r) => <span className="font-mono">{formatDecimal(flatInsights(r.insights).frequency, 2)}</span>,
  },
  {
    id: 'results',
    label: 'Ergebnisse',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = Array.isArray(ins.results) ? actionValue(ins.results, ins.results.map((x: any) => x.action_type || '')) : parseFloat(ins.results || '0');
      return <span className="font-mono">{formatNumber(v)}</span>;
    },
  },
  {
    id: 'cost_per_result',
    label: 'Kosten/Ergebnis',
    align: 'right',
    render: (r, c) => {
      const ins = flatInsights(r.insights);
      const v = Array.isArray(ins.cost_per_result)
        ? parseFloat(ins.cost_per_result[0]?.values?.[0]?.value || '0')
        : parseFloat(ins.cost_per_result || '0');
      return <span className="font-mono">{formatCurrency(v, c)}</span>;
    },
  },
  {
    id: 'roas',
    label: 'ROAS',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = Array.isArray(ins.purchase_roas)
        ? parseFloat(ins.purchase_roas[0]?.value || '0')
        : parseFloat(ins.roas || '0');
      return <span className="font-mono">{v ? formatDecimal(v, 2) : '–'}</span>;
    },
  },
  {
    id: 'video_views',
    label: 'Video Views',
    align: 'right',
    render: (r) => <span className="font-mono">{formatNumber(videoWatched(flatInsights(r.insights)))}</span>,
  },
  {
    id: 'video_view_rate',
    label: 'Video View Rate',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const views = videoWatched(ins);
      const imps = parseFloat(ins.impressions || '0');
      const rate = imps > 0 ? (views / imps) * 100 : 0;
      return <span className="font-mono">{formatPercent(rate)}</span>;
    },
  },
  {
    id: 'link_clicks',
    label: 'Link Clicks',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = actionValue(ins.outbound_clicks, ['outbound_click', 'link_click']) ||
        actionValue(ins.actions, ['link_click']);
      return <span className="font-mono">{formatNumber(v)}</span>;
    },
  },
  {
    id: 'landing_page_views',
    label: 'Landing Page Views',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = actionValue(ins.actions, ['landing_page_view', 'omni_landing_page_view']);
      return <span className="font-mono">{formatNumber(v)}</span>;
    },
  },
  {
    id: 'add_to_cart',
    label: 'Add to Cart',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = actionValue(ins.actions, ['add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']);
      return <span className="font-mono">{formatNumber(v)}</span>;
    },
  },
  {
    id: 'purchases',
    label: 'Purchases',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = actionValue(ins.actions, ['purchase', 'offsite_conversion.fb_pixel_purchase']);
      return <span className="font-mono">{formatNumber(v)}</span>;
    },
  },
  {
    id: 'purchase_roas',
    label: 'Purchase ROAS',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = Array.isArray(ins.purchase_roas) ? parseFloat(ins.purchase_roas[0]?.value || '0') : 0;
      return <span className="font-mono">{v ? formatDecimal(v, 2) : '–'}</span>;
    },
  },
  {
    id: 'leads',
    label: 'Leads',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const v = actionValue(ins.actions, ['lead', 'offsite_conversion.fb_pixel_lead', 'leadgen.other']);
      return <span className="font-mono">{formatNumber(v)}</span>;
    },
  },
  {
    id: 'cost_per_lead',
    label: 'Kosten / Lead',
    align: 'right',
    render: (r, c) => {
      const ins = flatInsights(r.insights);
      const leads = actionValue(ins.actions, ['lead', 'offsite_conversion.fb_pixel_lead', 'leadgen.other']);
      const spend = parseFloat(ins.spend || '0');
      return <span className="font-mono">{leads > 0 ? formatCurrency(spend / leads, c) : '–'}</span>;
    },
  },
  {
    id: 'unique_clicks',
    label: 'Unique Clicks',
    align: 'right',
    render: (r) => <span className="font-mono">{formatNumber(flatInsights(r.insights).unique_clicks)}</span>,
  },
  {
    id: 'unique_ctr',
    label: 'Unique CTR',
    align: 'right',
    render: (r) => <span className="font-mono">{formatPercent(flatInsights(r.insights).unique_ctr)}</span>,
  },
  {
    id: 'thumb_stop_rate',
    label: 'Thumb Stop Rate',
    align: 'right',
    render: (r) => {
      const ins = flatInsights(r.insights);
      const views = actionValue(ins.actions, ['video_view']);
      const imps = parseFloat(ins.impressions || '0');
      const rate = imps > 0 ? (views / imps) * 100 : 0;
      return <span className="font-mono">{formatPercent(rate)}</span>;
    },
  },
];

// ---------- Per-level columns ----------
export function getColumnsForLevel(level: 'campaigns' | 'adsets' | 'ads'): ColumnDef[] {
  if (level === 'ads') {
    return [
      {
        id: 'thumbnail',
        label: 'Vorschau',
        alwaysVisible: true,
        width: 'w-[80px]',
        render: () => null, // rendered specially in page
      },
      {
        id: 'name',
        label: 'Anzeigenname',
        alwaysVisible: true,
        render: (r) => <span className="font-medium max-w-[320px] truncate inline-block">{r.name}</span>,
      },
      { id: 'status', label: 'Status', render: StatusCell },
      ...metricCols(),
    ];
  }

  const base: ColumnDef[] = [
    {
      id: 'name',
      label: level === 'campaigns' ? 'Kampagnenname' : 'Anzeigengruppe',
      alwaysVisible: true,
      render: (r) => <span className="font-medium max-w-[300px] truncate inline-block">{r.name}</span>,
    },
    { id: 'status', label: 'Status', render: StatusCell },
  ];

  if (level === 'campaigns') {
    base.push({
      id: 'objective',
      label: 'Ziel',
      render: (r) => <span className="text-xs text-muted-foreground">{r.objective || '–'}</span>,
    });
  }

  base.push({
    id: 'budget',
    label: 'Budget',
    align: 'right',
    render: (r, c) => <span className="text-sm">{budgetCell(r, c)}</span>,
  });

  return [...base, ...metricCols()];
}

export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [
  'name',
  'status',
  'spend',
  'impressionen',
  'klicks',
  'ctr',
  'cpc',
];

export const DEFAULT_VISIBLE_ADS: ColumnId[] = [
  'thumbnail',
  'name',
  'status',
  'spend',
  'impressionen',
  'klicks',
  'ctr',
  'cpc',
];
