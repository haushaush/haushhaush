import { useEffect, useState, useMemo } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaPageHeader } from '@/components/meta/MetaPageHeader';
import { MetaDetailPanel } from '@/components/meta/MetaDetailPanel';
import {
  formatAccountSpend,
  formatCurrency,
  accountStatusBadge,
  exportCsv,
} from '@/components/meta/metaUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

export default function MetaUebersicht() {
  const { accounts, loadingAccounts, datePreset, setSelectedAccountId, callMeta, refreshAccounts, error } = useMetaAds();
  const [campaignCount, setCampaignCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    if (accounts.length === 0) return;
    setLoadingCount(true);
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
    const totalSpentMinor = accounts.reduce((sum, a) => sum + parseFloat(a.amount_spent || '0'), 0);
    const activeCount = accounts.filter((a) => a.account_status === 1).length;
    return { totalSpentMinor, activeCount };
  }, [accounts]);

  const handleExport = () => {
    exportCsv(
      `meta-konten-${Date.now()}.csv`,
      accounts.map((a) => ({
        Name: a.name,
        ID: a.id,
        Status: accountStatusBadge(a.account_status).label,
        Currency: a.currency || '',
        AmountSpent: a.amount_spent ? parseFloat(a.amount_spent) / 100 : 0,
        SpendCap: a.spend_cap ? parseFloat(a.spend_cap) / 100 : 0,
        Owned: a.owned ? 'Ja' : 'Nein',
      }))
    );
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
          {loadingAccounts ? (
            <Skeleton className="h-8 w-32 mt-2" />
          ) : (
            <p className="text-2xl font-semibold mt-1">{formatAccountSpend(totals.totalSpentMinor, 'EUR')}</p>
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
                      {formatAccountSpend(a.amount_spent, a.currency)}
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
