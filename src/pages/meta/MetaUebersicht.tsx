import { useEffect, useState, useMemo } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaPageHeader } from '@/components/meta/MetaPageHeader';
import { MetaDetailPanel } from '@/components/meta/MetaDetailPanel';
import {
  formatAccountSpend,
  accountStatusBadge,
  exportCsv,
} from '@/components/meta/metaUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

const INSIGHT_FIELDS = 'spend,impressions,clicks,actions,cost_per_action_type';

export default function MetaUebersicht() {
  const { accounts, loadingAccounts, datePreset, setSelectedAccountId, callMeta, refreshAccounts, error } = useMetaAds();
  const [campaignCount, setCampaignCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // Per-account spend for the selected date range (in major currency units)
  const [spendByAccount, setSpendByAccount] = useState<Record<string, number>>({});
  const [loadingSpend, setLoadingSpend] = useState(false);

  useEffect(() => {
    if (accounts.length === 0) {
      setSpendByAccount({});
      setCampaignCount(null);
      return;
    }
    setLoadingSpend(true);
    setLoadingCount(true);

    // Fetch insights (spend) per account for the selected datePreset
    Promise.all(
      accounts.map((a) =>
        callMeta<any>(`/${a.id}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: datePreset,
          level: 'account',
        })
          .then((r) => {
            const row = r?.data?.[0];
            const spend = row ? parseFloat(row.spend || '0') : 0;
            return [a.id, spend] as [string, number];
          })
          .catch(() => [a.id, 0] as [string, number])
      )
    )
      .then((entries) => {
        const map: Record<string, number> = {};
        entries.forEach(([id, spend]) => (map[id] = spend));
        setSpendByAccount(map);
      })
      .finally(() => setLoadingSpend(false));

    // Fetch campaigns counts across owned accounts (cap at first 10 to limit API load)
    const owned = accounts.filter((a) => a.owned).slice(0, 10);
    Promise.all(
      owned.map((a) =>
        callMeta<any>(`/${a.id}/campaigns`, { fields: 'id', limit: 500, date_preset: datePreset })
          .then((r) => (r?.data || []).length)
          .catch(() => 0)
      )
    )
      .then((counts) => setCampaignCount(counts.reduce((a, b) => a + b, 0)))
      .finally(() => setLoadingCount(false));
  }, [accounts, datePreset, callMeta]);

  const totals = useMemo(() => {
    const totalSpent = Object.values(spendByAccount).reduce((sum, v) => sum + v, 0);
    const activeCount = accounts.filter((a) => a.account_status === 1).length;
    return { totalSpent, activeCount };
  }, [accounts, spendByAccount]);

  const handleExport = () => {
    exportCsv(
      `meta-konten-${Date.now()}.csv`,
      accounts.map((a) => ({
        Name: a.name,
        ID: a.id,
        Status: accountStatusBadge(a.account_status).label,
        Currency: a.currency || '',
        AmountSpent: spendByAccount[a.id] ?? 0,
        SpendCap: a.spend_cap ? parseFloat(a.spend_cap) / 100 : 0,
        Owned: a.owned ? 'Ja' : 'Nein',
        DateRange: datePreset,
      }))
    );
  };

  // Format major-unit currency (insights returns major units already, e.g. "123.45")
  const formatMajor = (amountMajor: number, currency = 'EUR') => {
    try {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: currency || 'EUR',
        maximumFractionDigits: 2,
      }).format(amountMajor);
    } catch {
      return `${amountMajor.toFixed(2)} ${currency}`;
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <MetaPageHeader
        title="Meta Ads Übersicht"
        subtitle="Alle Werbekonten mit Spend und Status"
        showAccountSelector={false}
        onExportCsv={handleExport}
        onRefresh={refreshAccounts}
        refreshing={loadingAccounts}
      />

      {error && (
        <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Fehler beim Laden der Werbekonten</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Gesamtes Ad Spend</p>
          {loadingAccounts || loadingSpend ? (
            <Skeleton className="h-8 w-32 mt-2" />
          ) : (
            <p className="text-2xl font-semibold mt-1">{formatMajor(totals.totalSpent, 'EUR')}</p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Aktive Werbekonten</p>
          {loadingAccounts ? (
            <Skeleton className="h-8 w-16 mt-2" />
          ) : (
            <p className="text-2xl font-semibold mt-1">
              {totals.activeCount} <span className="text-sm text-muted-foreground">/ {accounts.length}</span>
            </p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Kampagnen (eigene Konten)</p>
          {loadingCount ? (
            <Skeleton className="h-8 w-16 mt-2" />
          ) : (
            <p className="text-2xl font-semibold mt-1">{campaignCount ?? '–'}</p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">Amount Spent</TableHead>
              <TableHead className="text-right">Spend Cap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingAccounts &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loadingAccounts &&
              accounts.map((a) => {
                const badge = accountStatusBadge(a.account_status);
                const spend = spendByAccount[a.id];
                return (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedAccountId(a.id);
                      setDetail(a);
                    }}
                  >
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{a.owned ? 'Eigen' : 'Kunde'}</span>
                    </TableCell>
                    <TableCell>{a.currency || '–'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {loadingSpend && spend === undefined ? (
                        <Skeleton className="h-4 w-20 ml-auto" />
                      ) : (
                        formatMajor(spend ?? 0, a.currency || 'EUR')
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {a.spend_cap ? formatAccountSpend(a.spend_cap, a.currency) : '–'}
                    </TableCell>
                  </TableRow>
                );
              })}
            {!loadingAccounts && accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Keine Werbekonten gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <MetaDetailPanel
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.name || 'Werbekonto'}
        data={detail || {}}
      />
    </div>
  );
}
