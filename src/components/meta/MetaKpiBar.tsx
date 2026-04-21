import { Card } from '@/components/ui/card';
import { formatCurrency, formatNumber, formatPercent, flatInsights } from './metaUtils';

interface Props {
  rows: any[];
  currency?: string;
  loading?: boolean;
}

export function MetaKpiBar({ rows, currency = 'EUR', loading }: Props) {
  const totals = rows.reduce(
    (acc, r) => {
      const ins = flatInsights(r.insights);
      acc.spend += parseFloat(ins.spend || '0') || 0;
      acc.impressions += parseFloat(ins.impressions || '0') || 0;
      acc.clicks += parseFloat(ins.clicks || '0') || 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0 }
  );
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const items = [
    { label: 'Spend', value: formatCurrency(totals.spend, currency) },
    { label: 'Impressionen', value: formatNumber(totals.impressions) },
    { label: 'Klicks', value: formatNumber(totals.clicks) },
    { label: 'CTR', value: formatPercent(ctr) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{it.label}</p>
          <p className="text-2xl font-semibold mt-1 font-mono text-foreground">
            {loading ? '…' : it.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
