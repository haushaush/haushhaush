import { useEffect, useMemo, useState } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaPageHeader } from '@/components/meta/MetaPageHeader';
import { MetaKpiBar } from '@/components/meta/MetaKpiBar';
import { MetaFilterBar, StatusFilter, matchesStatus } from '@/components/meta/MetaFilterBar';
import { MetaAdDetailPanel } from '@/components/meta/MetaAdDetailPanel';
import { MetaColumnPicker } from '@/components/meta/MetaColumnPicker';
import {
  ColumnId,
  DEFAULT_VISIBLE_ADS,
  DEFAULT_VISIBLE_COLUMNS,
  getColumnsForLevel,
} from '@/components/meta/metaColumns';
import { flatInsights, exportCsv } from '@/components/meta/metaUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const INSIGHT_FIELDS =
  'spend,impressions,clicks,ctr,cpc,cpm,cpp,reach,frequency,unique_clicks,unique_ctr,' +
  'actions,action_values,outbound_clicks,landing_page_views,' +
  'video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,' +
  'video_play_actions,video_3_sec_watched_actions,' +
  'purchase_roas,website_purchase_roas';

const CAMPAIGN_FIELDS = `id,name,status,objective,daily_budget,lifetime_budget,spend_cap,insights{${INSIGHT_FIELDS}}`;
const ADSET_FIELDS = `id,name,status,campaign_id,daily_budget,lifetime_budget,insights{${INSIGHT_FIELDS}}`;
const AD_FIELDS = `id,name,status,adset_id,campaign_id,creative{id,name,thumbnail_url,title,body,call_to_action_type},insights{${INSIGHT_FIELDS}}`;

const STORAGE_PREFIX = 'meta-cols-';

function loadCols(level: Level): ColumnId[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + level);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveCols(level: Level, ids: ColumnId[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + level, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

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
  const allColumns = useMemo(() => getColumnsForLevel(level), [level]);
  const defaults = level === 'ads' ? DEFAULT_VISIBLE_ADS : DEFAULT_VISIBLE_COLUMNS;

  // Visible columns per level (persisted)
  const [visibleByLevel, setVisibleByLevel] = useState<Record<Level, ColumnId[]>>(() => ({
    campaigns: loadCols('campaigns') ?? DEFAULT_VISIBLE_COLUMNS,
    adsets: loadCols('adsets') ?? DEFAULT_VISIBLE_COLUMNS,
    ads: loadCols('ads') ?? DEFAULT_VISIBLE_ADS,
  }));
  const visible = visibleByLevel[level];

  const setVisible = (ids: ColumnId[]) => {
    // Always include alwaysVisible columns
    const required = allColumns.filter((c) => c.alwaysVisible).map((c) => c.id);
    const merged = Array.from(new Set([...required, ...ids]));
    setVisibleByLevel((prev) => ({ ...prev, [level]: merged }));
    saveCols(level, merged);
  };

  const resetCols = () => {
    setVisibleByLevel((prev) => ({ ...prev, [level]: defaults }));
    saveCols(level, defaults);
  };

  // Render only visible columns, in their defined order
  const renderedColumns = useMemo(
    () => allColumns.filter((c) => visible.includes(c.id) || c.alwaysVisible),
    [allColumns, visible]
  );

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
          Spend: ins.spend || 0,
          Impressions: ins.impressions || 0,
          Clicks: ins.clicks || 0,
          CTR: ins.ctr || 0,
          CPC: ins.cpc || 0,
          CPM: ins.cpm || 0,
          Reach: ins.reach || 0,
          Frequency: ins.frequency || 0,
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
    level === 'campaigns' ? 'Kampagnen' : level === 'adsets' ? 'Anzeigengruppen' : 'Anzeigen';

  const colCount = renderedColumns.length + (level === 'campaigns' || level === 'adsets' ? 1 : 0); // +1 for chevron column

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <MetaPageHeader
        title={title}
        subtitle={account?.name || 'Wähle ein Werbekonto'}
        onExportCsv={handleExport}
        onRefresh={load}
        refreshing={loading}
        onAccountChange={() => {
          setSelectedCampaign(null);
          setSelectedAdset(null);
          setSearch('');
          setStatusFilter('all');
          setAdDetail(null);
        }}
      />

      {/* Breadcrumb + Back */}
      {level !== 'campaigns' && (
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={goToCampaigns} className="cursor-pointer hover:text-foreground">
                  Alle Kampagnen
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              {level === 'adsets' ? (
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[320px] truncate">{selectedCampaign?.name}</BreadcrumbPage>
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
                    <BreadcrumbPage className="max-w-[280px] truncate">{selectedAdset?.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <Button variant="outline" size="sm" onClick={level === 'adsets' ? goToCampaigns : goToAdsets}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </div>
      )}

      <MetaKpiBar rows={filtered} currency={currency} loading={loading} />

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <MetaFilterBar
            search={search}
            onSearchChange={setSearch}
            status={statusFilter}
            onStatusChange={setStatusFilter}
            count={filtered.length}
          />
        </div>
        <div className="ml-auto -mt-4">
          <MetaColumnPicker
            columns={allColumns}
            visible={visible}
            onChange={setVisible}
            onReset={resetCols}
          />
        </div>
      </div>

      {error && (
        <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {renderedColumns.map((col) => (
                  <TableHead
                    key={col.id}
                    className={`${col.align === 'right' ? 'text-right' : ''} ${col.width || ''}`}
                  >
                    {col.label}
                  </TableHead>
                ))}
                {level !== 'ads' && <TableHead className="w-[40px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colCount}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading &&
                filtered.map((r) => {
                  const isDrillable = level !== 'ads';
                  const onRowClick = () => {
                    if (level === 'campaigns') setSelectedCampaign(r);
                    else if (level === 'adsets') setSelectedAdset(r);
                    else setAdDetail(r);
                  };
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer group"
                      onClick={onRowClick}
                    >
                      {renderedColumns.map((col) => {
                        // Special-case the thumbnail (ads only)
                        if (col.id === 'thumbnail') {
                          const thumb = r.creative?.thumbnail_url;
                          return (
                            <TableCell key={col.id}>
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
                          );
                        }
                        return (
                          <TableCell key={col.id} className={col.align === 'right' ? 'text-right' : ''}>
                            {col.render(r, currency)}
                          </TableCell>
                        );
                      })}
                      {isDrillable && (
                        <TableCell className="text-right">
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}

              {!loading && filtered.length === 0 && !error && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                    Keine Einträge für diese Auswahl.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
