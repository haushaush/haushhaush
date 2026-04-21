import { useEffect, useMemo, useState } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaPageHeader } from '@/components/meta/MetaPageHeader';
import { MetaKpiBar } from '@/components/meta/MetaKpiBar';
import { MetaFilterBar, StatusFilter, matchesStatus } from '@/components/meta/MetaFilterBar';
import { MetaAdDetailPanel } from '@/components/meta/MetaAdDetailPanel';
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
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AlertCircle, ArrowLeft, ChevronRight, ImageOff } from 'lucide-react';

type Level = 'campaigns' | 'adsets' | 'ads';

const CAMPAIGN_FIELDS =
  'id,name,status,objective,daily_budget,lifetime_budget,spend_cap,insights{spend,impressions,clicks,ctr,cpc,cpp,reach,frequency}';
const ADSET_FIELDS =
  'id,name,status,campaign_id,daily_budget,lifetime_budget,insights{spend,impressions,clicks,ctr,cpc,cpm,reach,frequency}';
const AD_FIELDS =
  'id,name,status,adset_id,campaign_id,creative{id,name,thumbnail_url,title,body,call_to_action_type},insights{spend,impressions,clicks,ctr,cpc,cpm,reach,frequency}';

export default function MetaKampagnen() {
  const { selectedAccountId, accounts, datePreset, callMeta } = useMetaAds();
  const account = accounts.find((a) => a.id === selectedAccountId);
  const currency = account?.currency || 'EUR';

  // Drill-down state
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<any | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Data per level
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slide-in for ad detail
  const [adDetail, setAdDetail] = useState<any | null>(null);

  const level: Level = selectedAdset ? 'ads' : selectedCampaign ? 'adsets' : 'campaigns';

  const load = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    setError(null);
    try {
      let data: any;
      if (level === 'campaigns') {
        data = await callMeta<any>(`/${selectedAccountId}/campaigns`, {
          fields: CAMPAIGN_FIELDS,
          date_preset: datePreset,
          limit: 200,
        });
      } else if (level === 'adsets') {
        data = await callMeta<any>(`/${selectedAccountId}/adsets`, {
          fields: ADSET_FIELDS,
          date_preset: datePreset,
          limit: 200,
          filtering: JSON.stringify([
            { field: 'campaign.id', operator: 'EQUAL', value: selectedCampaign.id },
          ]),
        });
      } else {
        data = await callMeta<any>(`/${selectedAccountId}/ads`, {
          fields: AD_FIELDS,
          date_preset: datePreset,
          limit: 200,
          filtering: JSON.stringify([
            { field: 'adset.id', operator: 'EQUAL', value: selectedAdset.id },
          ]),
        });
      }
      setRows(data?.data || []);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch('');
    setStatusFilter('all');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, datePreset, level, selectedCampaign?.id, selectedAdset?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      if (!matchesStatus(r.status, statusFilter)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const handleExport = () => {
    exportCsv(
      `meta-${level}-${Date.now()}.csv`,
      filtered.map((r) => {
        const ins = flatInsights(r.insights);
        return {
          Name: r.name,
          Status: r.status,
          ...(level === 'campaigns' ? { Objective: r.objective } : {}),
          ...(level !== 'ads'
            ? {
                DailyBudget: r.daily_budget ? parseFloat(r.daily_budget) / 100 : '',
                LifetimeBudget: r.lifetime_budget ? parseFloat(r.lifetime_budget) / 100 : '',
              }
            : {}),
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

  const goToCampaigns = () => {
    setSelectedCampaign(null);
    setSelectedAdset(null);
  };
  const goToAdsets = () => {
    setSelectedAdset(null);
  };

  const title =
    level === 'campaigns'
      ? 'Kampagnen'
      : level === 'adsets'
      ? 'Anzeigengruppen'
      : 'Anzeigen';

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <MetaPageHeader
        title={title}
        subtitle={account?.name || 'Wähle ein Werbekonto'}
        onExportCsv={handleExport}
        onRefresh={load}
        refreshing={loading}
      />

      {/* Breadcrumb + Back */}
      {level !== 'campaigns' && (
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  onClick={goToCampaigns}
                  className="cursor-pointer hover:text-foreground"
                >
                  Alle Kampagnen
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              {level === 'adsets' ? (
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[320px] truncate">
                    {selectedCampaign?.name}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      onClick={goToAdsets}
                      className="cursor-pointer hover:text-foreground max-w-[280px] truncate"
                    >
                      {selectedCampaign?.name}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="max-w-[280px] truncate">
                      {selectedAdset?.name}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <Button
            variant="outline"
            size="sm"
            onClick={level === 'adsets' ? goToCampaigns : goToAdsets}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </div>
      )}

      {/* KPI bar */}
      <MetaKpiBar rows={filtered} currency={currency} loading={loading} />

      {/* Filter bar */}
      <MetaFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        count={filtered.length}
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
            {level === 'campaigns' && (
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
                <TableHead className="w-[40px]" />
              </TableRow>
            )}
            {level === 'adsets' && (
              <TableRow>
                <TableHead>Anzeigengruppe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impressionen</TableHead>
                <TableHead className="text-right">Klicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Reichweite</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            )}
            {level === 'ads' && (
              <TableRow>
                <TableHead className="w-[80px]">Vorschau</TableHead>
                <TableHead>Anzeigenname</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impressionen</TableHead>
                <TableHead className="text-right">Klicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={level === 'ads' ? 8 : 10}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!loading &&
              level === 'campaigns' &&
              filtered.map((r) => {
                const ins = flatInsights(r.insights);
                const badge = entityStatusBadge(r.status);
                const budget = r.daily_budget
                  ? `${formatBudgetMinor(r.daily_budget, currency)} / Tag`
                  : r.lifetime_budget
                  ? `${formatBudgetMinor(r.lifetime_budget, currency)} gesamt`
                  : '–';
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer group"
                    onClick={() => setSelectedCampaign(r)}
                  >
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
                    <TableCell className="text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </TableCell>
                  </TableRow>
                );
              })}

            {!loading &&
              level === 'adsets' &&
              filtered.map((r) => {
                const ins = flatInsights(r.insights);
                const badge = entityStatusBadge(r.status);
                const budget = r.daily_budget
                  ? `${formatBudgetMinor(r.daily_budget, currency)} / Tag`
                  : r.lifetime_budget
                  ? `${formatBudgetMinor(r.lifetime_budget, currency)} gesamt`
                  : '–';
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer group"
                    onClick={() => setSelectedAdset(r)}
                  >
                    <TableCell className="font-medium max-w-[300px] truncate">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{budget}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.spend, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.impressions)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.clicks)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPercent(ins.ctr)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.cpc, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.reach)}</TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </TableCell>
                  </TableRow>
                );
              })}

            {!loading &&
              level === 'ads' &&
              filtered.map((r) => {
                const ins = flatInsights(r.insights);
                const badge = entityStatusBadge(r.status);
                const thumb = r.creative?.thumbnail_url;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setAdDetail(r)}
                  >
                    <TableCell>
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="h-12 w-12 rounded object-cover border border-border"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded border border-border bg-muted flex items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium max-w-[320px] truncate">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.spend, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.impressions)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(ins.clicks)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPercent(ins.ctr)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(ins.cpc, currency)}</TableCell>
                  </TableRow>
                );
              })}

            {!loading && filtered.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={level === 'ads' ? 8 : 10} className="text-center text-muted-foreground py-8">
                  Keine Einträge für diese Auswahl.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <MetaAdDetailPanel
        open={!!adDetail}
        onOpenChange={(o) => !o && setAdDetail(null)}
        ad={adDetail}
        currency={currency}
        onStatusChanged={(id, newStatus) => {
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
          setAdDetail((prev: any) => (prev ? { ...prev, status: newStatus } : prev));
        }}
      />
    </div>
  );
}
