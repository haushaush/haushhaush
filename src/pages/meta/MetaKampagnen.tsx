import { useEffect, useState } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaPageHeader } from '@/components/meta/MetaPageHeader';
import { MetaDetailPanel } from '@/components/meta/MetaDetailPanel';
import {
  formatCurrency,
  formatNumber,
  formatDecimal,
  formatPercent,
  entityStatusBadge,
  flatInsights,
  formatBudgetMinor,
  exportCsv,
} from '@/components/meta/metaUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

export default function MetaKampagnen() {
  const { selectedAccountId, accounts, datePreset, callMeta } = useMetaAds();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const account = accounts.find((a) => a.id === selectedAccountId);
  const currency = account?.currency || 'EUR';

  const load = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await callMeta<any>(`/${selectedAccountId}/campaigns`, {
        fields:
          'id,name,status,objective,daily_budget,lifetime_budget,spend_cap,insights{spend,impressions,clicks,ctr,cpc,cpp,reach,frequency}',
        date_preset: datePreset,
        limit: 200,
      });
      setRows(data?.data || []);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, datePreset]);

  const handleExport = () => {
    exportCsv(
      `meta-kampagnen-${Date.now()}.csv`,
      rows.map((r) => {
        const ins = flatInsights(r.insights);
        return {
          Name: r.name,
          Status: r.status,
          Objective: r.objective,
          DailyBudget: r.daily_budget ? parseFloat(r.daily_budget) / 100 : '',
          LifetimeBudget: r.lifetime_budget ? parseFloat(r.lifetime_budget) / 100 : '',
          Spend: ins.spend || 0,
          Impressions: ins.impressions || 0,
          Clicks: ins.clicks || 0,
          CTR: ins.ctr || 0,
          CPC: ins.cpc || 0,
          Reach: ins.reach || 0,
          Frequency: ins.frequency || 0,
        };
      })
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <MetaPageHeader
        title="Kampagnen"
        subtitle={account?.name || 'Wähle ein Werbekonto'}
        onExportCsv={handleExport}
        onRefresh={load}
        refreshing={loading}
      />

      {error && (
        <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kampagnenname</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ziel</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Impressionen</TableHead>
              <TableHead className="text-right">Klicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">Reichweite</TableHead>
              <TableHead className="text-right">Frequenz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              rows.map((r) => {
                const ins = flatInsights(r.insights);
                const badge = entityStatusBadge(r.status);
                const budget = r.daily_budget
                  ? `${formatBudgetMinor(r.daily_budget, currency)} / Tag`
                  : r.lifetime_budget
                  ? `${formatBudgetMinor(r.lifetime_budget, currency)} gesamt`
                  : '–';
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="font-medium max-w-[280px] truncate">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.objective || '–'}</TableCell>
                    <TableCell className="text-right text-sm">{budget}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.spend, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.impressions)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.clicks)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPercent(ins.ctr)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.cpc, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.reach)}</TableCell>
                    <TableCell className="text-right font-mono">{formatDecimal(ins.frequency, 2)}</TableCell>
                  </TableRow>
                );
              })}
            {!loading && rows.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Keine Kampagnen für diesen Zeitraum.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <MetaDetailPanel
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.name || 'Kampagne'}
        data={detail || {}}
      />
    </div>
  );
}
