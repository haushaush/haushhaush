import { useEffect, useState } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaPageHeader } from '@/components/meta/MetaPageHeader';
import { MetaDetailPanel } from '@/components/meta/MetaDetailPanel';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  entityStatusBadge,
  flatInsights,
  exportCsv,
} from '@/components/meta/metaUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Image as ImageIcon } from 'lucide-react';

export default function MetaAnzeigen() {
  const { selectedAccountId, accounts, datePreset, callMeta } = useMetaAds();
  const [rows, setRows] = useState<any[]>([]);
  const [adsetsMap, setAdsetsMap] = useState<Record<string, string>>({});
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
      const [adsData, adsetsData] = await Promise.all([
        callMeta<any>(`/${selectedAccountId}/ads`, {
          fields:
            'id,name,status,adset_id,creative{id,name,thumbnail_url,body,title},insights{spend,impressions,clicks,ctr,cpc,reach}',
          date_preset: datePreset,
          limit: 200,
        }),
        callMeta<any>(`/${selectedAccountId}/adsets`, {
          fields: 'id,name',
          limit: 500,
        }).catch(() => ({ data: [] })),
      ]);
      setRows(adsData?.data || []);
      const map: Record<string, string> = {};
      (adsetsData?.data || []).forEach((a: any) => (map[a.id] = a.name));
      setAdsetsMap(map);
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
      `meta-anzeigen-${Date.now()}.csv`,
      rows.map((r) => {
        const ins = flatInsights(r.insights);
        return {
          Name: r.name,
          Status: r.status,
          Anzeigengruppe: adsetsMap[r.adset_id] || r.adset_id,
          Spend: ins.spend || 0,
          Impressions: ins.impressions || 0,
          Clicks: ins.clicks || 0,
          CTR: ins.ctr || 0,
          CPC: ins.cpc || 0,
          Reach: ins.reach || 0,
        };
      })
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <MetaPageHeader
        title="Anzeigen"
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
              <TableHead className="w-[60px]">Preview</TableHead>
              <TableHead>Anzeigenname</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Anzeigengruppe</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Impressionen</TableHead>
              <TableHead className="text-right">Klicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              rows.map((r) => {
                const ins = flatInsights(r.insights);
                const badge = entityStatusBadge(r.status);
                const thumb = r.creative?.thumbnail_url;
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell>
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="w-10 h-10 object-cover rounded border border-border"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded border border-border bg-muted/30 flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium max-w-[260px] truncate">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {adsetsMap[r.adset_id] || r.adset_id}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.spend, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.impressions)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.clicks)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPercent(ins.ctr)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.cpc, currency)}</TableCell>
                  </TableRow>
                );
              })}
            {!loading && rows.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Keine Anzeigen für diesen Zeitraum.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <MetaDetailPanel
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.name || 'Anzeige'}
        data={detail || {}}
      />
    </div>
  );
}
