// Helpers for Meta Ads UI

export function formatCurrency(value: any, currency: string = 'EUR'): string {
  const n = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(n)) return '–';
  // Meta returns spend in currency units (string). amount_spent is in cents for some endpoints — but insights.spend is normal. We keep as-is.
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 2,
  }).format(n);
}

// amount_spent on account level is returned in CENTS (per Meta docs)
export function formatAccountSpend(value: any, currency: string = 'EUR'): string {
  const n = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(n)) return '–';
  return formatCurrency(n / 100, currency);
}

export function formatNumber(value: any): string {
  const n = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(n)) return '–';
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
}

export function formatDecimal(value: any, digits = 2): string {
  const n = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(n)) return '–';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function formatPercent(value: any): string {
  const n = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(n)) return '–';
  return `${n.toFixed(2)} %`;
}

// Account status mapping (1=Active, 2=Disabled, 3=Unsettled, 7=Pending review, 9=In grace, 100=Pending closure, 101=Closed, 201=Any active, 202=Any closed)
export function accountStatusBadge(status?: number): { label: string; className: string } {
  switch (status) {
    case 1:
      return { label: 'Active', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
    case 2:
      return { label: 'Disabled', className: 'bg-rose-500/15 text-rose-600 border-rose-500/30' };
    case 3:
      return { label: 'Unsettled', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    case 7:
      return { label: 'Pending Review', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    case 9:
      return { label: 'In Grace', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    case 100:
      return { label: 'Pending Close', className: 'bg-rose-500/15 text-rose-600 border-rose-500/30' };
    case 101:
      return { label: 'Closed', className: 'bg-muted text-muted-foreground border-border' };
    default:
      return { label: status != null ? `Status ${status}` : 'Unknown', className: 'bg-muted text-muted-foreground border-border' };
  }
}

export function entityStatusBadge(status?: string): { label: string; className: string } {
  const s = (status || '').toUpperCase();
  switch (s) {
    case 'ACTIVE':
      return { label: 'Active', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
    case 'PAUSED':
      return { label: 'Paused', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    case 'ARCHIVED':
      return { label: 'Archived', className: 'bg-muted text-muted-foreground border-border' };
    case 'DELETED':
      return { label: 'Deleted', className: 'bg-rose-500/15 text-rose-600 border-rose-500/30' };
    case 'CAMPAIGN_PAUSED':
      return { label: 'Camp. Paused', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    case 'ADSET_PAUSED':
      return { label: 'Adset Paused', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    default:
      return { label: status || '–', className: 'bg-muted text-muted-foreground border-border' };
  }
}

// Insights are returned as { data: [{spend, impressions, ...}] } — flatten
export function flatInsights(insights: any): Record<string, any> {
  if (!insights) return {};
  if (Array.isArray(insights?.data) && insights.data.length > 0) return insights.data[0] || {};
  return {};
}

// Budget: minor units (cents) → currency
export function formatBudgetMinor(value: any, currency: string = 'EUR'): string {
  if (value == null || value === '') return '–';
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(n) || n === 0) return '–';
  return formatCurrency(n / 100, currency);
}

export function exportCsv(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /["\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(';'), ...rows.map((r) => headers.map((h) => escape(r[h])).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
