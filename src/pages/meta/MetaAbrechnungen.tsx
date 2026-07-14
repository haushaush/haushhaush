import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { formatCurrency, accountStatusBadge } from '@/components/meta/metaUtils';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

type Snapshot = {
  meta_account_id: string;
  account_name: string | null;
  currency: string | null;
  account_status: string | null;
  amount_spent: number | null;
  balance: number | null;
  spend_cap: number | null;
  funding_source_details: any;
  business_name: string | null;
  synced_at: string;
};

type Preset = 'today' | 'last_7d' | 'last_30d' | 'this_month' | 'last_month' | 'this_year' | 'last_12m' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'last_7d', label: 'Letzte 7 Tage' },
  { value: 'last_30d', label: 'Letzte 30 Tage' },
  { value: 'this_month', label: 'Dieser Monat' },
  { value: 'last_month', label: 'Letzter Monat' },
  { value: 'this_year', label: 'Dieses Jahr' },
  { value: 'last_12m', label: 'Letzte 12 Monate' },
  { value: 'custom', label: 'Benutzerdefiniert' },
];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function rangeFor(p: Preset, custom?: { from: string; to: string }): { since: string; until: string } {
  const today = new Date();
  const t = ymd(today);
  const d = (n: number) => { const x = new Date(today); x.setDate(x.getDate() + n); return ymd(x); };
  const firstOfMonth = (offset = 0) => { const x = new Date(today.getFullYear(), today.getMonth() + offset, 1); return ymd(x); };
  const lastOfMonth = (offset = 0) => { const x = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0); return ymd(x); };
  switch (p) {
    case 'today': return { since: t, until: t };
    case 'last_7d': return { since: d(-6), until: t };
    case 'last_30d': return { since: d(-29), until: t };
    case 'this_month': return { since: firstOfMonth(0), until: t };
    case 'last_month': return { since: firstOfMonth(-1), until: lastOfMonth(-1) };
    case 'this_year': return { since: `${today.getFullYear()}-01-01`, until: t };
    case 'last_12m': { const x = new Date(today); x.setMonth(x.getMonth() - 11); x.setDate(1); return { since: ymd(x), until: t }; }
    case 'custom': return { since: custom?.from || d(-29), until: custom?.to || t };
  }
}

export default function MetaAbrechnungen() {
  const { callMeta } = useMetaAds();
  const { hasPermission, isAdmin } = usePermissions();
  const canManage = isAdmin || hasPermission('meta.billing.manage');

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preset, setPreset] = useState<Preset>('last_30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all'); // 'all' | account id
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [insights, setInsights] = useState<Record<string, any[]>>({}); // per account monthly
  const [loadingInsights, setLoadingInsights] = useState(false);

  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);

  async function loadSnapshots() {
    setLoading(true);
    const { data, error } = await supabase
      .from('meta_billing_account_snapshots')
      .select('*')
      .order('account_name', { ascending: true })
      .limit(2000);
    if (error) toast.error('Konnte Snapshots nicht laden: ' + error.message);
    setSnapshots((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { loadSnapshots(); }, []);

  // If we have no snapshots yet, trigger the first sync automatically for admins
  useEffect(() => {
    if (!loading && snapshots.length === 0 && canManage && !syncing) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-meta-billing', { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Sync fertig: ${data.accounts_checked} geprüft, ${data.accounts_updated} aktualisiert` +
        (data.unsupported_accounts ? `, ${data.unsupported_accounts} ohne Abrechnungsdaten` : '') +
        (data.errors?.length ? ` (${data.errors.length} Fehler)` : '')
      );
      await loadSnapshots();
    } catch (e) {
      toast.error('Sync fehlgeschlagen: ' + (e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return snapshots.filter((s) => {
      if (accountFilter !== 'all' && s.meta_account_id !== accountFilter) return false;
      if (currencyFilter !== 'all' && s.currency !== currencyFilter) return false;
      if (statusFilter !== 'all' && s.account_status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.account_name || '').toLowerCase().includes(q)
          && !(s.meta_account_id || '').toLowerCase().includes(q)
          && !(s.business_name || '').toLowerCase().includes(q)) return false;
      }
      const spent = (s.amount_spent || 0) / 100;
      if (minAmt && spent < Number(minAmt)) return false;
      if (maxAmt && spent > Number(maxAmt)) return false;
      return true;
    });
  }, [snapshots, accountFilter, currencyFilter, statusFilter, search, minAmt, maxAmt]);

  // Load insights per account for range
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (filteredAccounts.length === 0) { setInsights({}); return; }
      setLoadingInsights(true);
      const results: Record<string, any[]> = {};
      // Limit parallelism
      const list = filteredAccounts.slice(0, 60);
      for (const acc of list) {
        try {
          const res: any = await callMeta(`/${acc.meta_account_id}/insights`, {
            fields: 'spend,impressions,clicks,account_currency',
            time_range: JSON.stringify({ since: range.since, until: range.until }),
            time_increment: 'monthly',
            level: 'account',
          });
          results[acc.meta_account_id] = res?.data || [];
        } catch {
          results[acc.meta_account_id] = [];
        }
        if (cancelled) return;
      }
      if (!cancelled) { setInsights(results); setLoadingInsights(false); }
    }
    run();
    return () => { cancelled = true; };
  }, [filteredAccounts, range.since, range.until, callMeta]);

  // Aggregates
  const spendByCurrency = useMemo(() => {
    const m: Record<string, number> = {};
    for (const acc of filteredAccounts) {
      const cur = acc.currency || 'EUR';
      const rows = insights[acc.meta_account_id] || [];
      const sum = rows.reduce((s: number, r: any) => s + (parseFloat(r.spend || '0') || 0), 0);
      m[cur] = (m[cur] || 0) + sum;
    }
    return m;
  }, [filteredAccounts, insights]);

  const spendThisMonth = useMemo(() => {
    // request separate month insights? Compute from insights if present in range
    const m: Record<string, number> = {};
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    for (const acc of filteredAccounts) {
      const rows = insights[acc.meta_account_id] || [];
      for (const r of rows) {
        const start = (r.date_start || '').slice(0, 7);
        if (start === key) {
          const cur = acc.currency || 'EUR';
          m[cur] = (m[cur] || 0) + (parseFloat(r.spend || '0') || 0);
        }
      }
    }
    return m;
  }, [filteredAccounts, insights]);

  const capsByCurrency = useMemo(() => {
    const m: Record<string, number> = {};
    for (const acc of filteredAccounts) {
      if (!acc.spend_cap) continue;
      const cur = acc.currency || 'EUR';
      m[cur] = (m[cur] || 0) + (acc.spend_cap / 100);
    }
    return m;
  }, [filteredAccounts]);

  const activeCount = filteredAccounts.filter((a) => a.account_status === '1').length;
  const unsupportedCount = filteredAccounts.filter((a) => a.amount_spent == null && a.balance == null).length;
  const warnCount = filteredAccounts.filter((a) => {
    if (!a.spend_cap || !a.amount_spent) return false;
    return a.amount_spent / a.spend_cap >= 0.9;
  }).length;

  // Chart: monthly stacked spend
  const chartData = useMemo(() => {
    const buckets: Record<string, any> = {};
    for (const acc of filteredAccounts) {
      const rows = insights[acc.meta_account_id] || [];
      for (const r of rows) {
        const month = (r.date_start || '').slice(0, 7);
        if (!month) continue;
        if (!buckets[month]) buckets[month] = { month };
        const k = acc.account_name || acc.meta_account_id;
        buckets[month][k] = (buckets[month][k] || 0) + (parseFloat(r.spend || '0') || 0);
      }
    }
    return Object.values(buckets).sort((a: any, b: any) => a.month.localeCompare(b.month));
  }, [filteredAccounts, insights]);

  const topAccounts = useMemo(() => {
    return filteredAccounts
      .map((a) => ({
        acc: a,
        spend: (insights[a.meta_account_id] || []).reduce((s: number, r: any) => s + (parseFloat(r.spend || '0') || 0), 0),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);
  }, [filteredAccounts, insights]);

  const currencies = useMemo(() => Array.from(new Set(snapshots.map((s) => s.currency).filter(Boolean))) as string[], [snapshots]);
  const statuses = useMemo(() => Array.from(new Set(snapshots.map((s) => s.account_status).filter(Boolean))) as string[], [snapshots]);

  function fmtMulti(m: Record<string, number>) {
    const entries = Object.entries(m).filter(([, v]) => v > 0);
    if (entries.length === 0) return '–';
    return entries.map(([cur, val]) => formatCurrency(val, cur)).join(' · ');
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Abrechnungen & Zahlungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Werbekontenübergreifende Übersicht über Ausgaben, Salden und Abrechnungslimits — Daten aus Meta Ad Accounts & Insights.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button onClick={handleSync} disabled={syncing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Meta-Abrechnungen aktualisieren
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Zeitraum</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Von</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Bis</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Werbekonto</label>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Werbekonten</SelectItem>
                {snapshots.map((s) => (
                  <SelectItem key={s.meta_account_id} value={s.meta_account_id}>
                    {s.account_name || s.meta_account_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Suche</label>
            <Input placeholder="Name oder Account-ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Währung</label>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {statuses.map((s) => <SelectItem key={s} value={s}>{accountStatusBadge(Number(s)).label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Min. Ausgaben</label>
            <Input type="number" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Max. Ausgaben</label>
            <Input type="number" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} placeholder="∞" />
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gesamtausgaben (Zeitraum)" value={fmtMulti(spendByCurrency)} source="Meta Insights" />
        <KpiCard label="Ausgaben dieser Monat" value={fmtMulti(spendThisMonth)} source="Meta Insights" />
        <KpiCard label="Zugängliche Werbekonten" value={String(filteredAccounts.length)} source="Meta Ad Accounts" />
        <KpiCard label="Aktive Werbekonten" value={String(activeCount)} source="Meta Ad Accounts" />
        <KpiCard label="Summe Spend Caps" value={fmtMulti(capsByCurrency)} source="Meta Ad Accounts" />
        <KpiCard label="Konten mit Warnungen" value={String(warnCount)} source="Berechnet" />
        <KpiCard label="Ohne Abrechnungsdaten" value={String(unsupportedCount)} source="Meta Ad Accounts" />
        <KpiCard label="Letzter Sync" value={snapshots[0]?.synced_at ? new Date(snapshots[0].synced_at).toLocaleString('de-DE') : '–'} source="System" />
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Werbeausgaben</h2>
            <p className="text-xs text-muted-foreground">Monatlich, gruppiert nach Werbekonto — Quelle: Meta Insights ({range.since} → {range.until})</p>
          </div>
          {loadingInsights && <span className="text-xs text-muted-foreground">Lade Insights…</span>}
        </div>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Keine Ausgabendaten im gewählten Zeitraum.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: any) => formatCurrency(v)} />
              <Legend />
              {topAccounts.slice(0, 6).map((t, i) => {
                const name = t.acc.account_name || t.acc.meta_account_id;
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6'];
                return <Bar key={name} dataKey={name} stackId="a" fill={colors[i % colors.length]} />;
              })}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Per-account status */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Abrechnungsstatus je Werbekonto</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Werbekonto</TableHead>
                <TableHead>Account-ID</TableHead>
                <TableHead>Währung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Gesamtausgaben</TableHead>
                <TableHead className="text-right">Spend Cap</TableHead>
                <TableHead className="text-right">Verbleibendes Limit</TableHead>
                <TableHead>Zahlungsmethode</TableHead>
                <TableHead>Warnungen</TableHead>
                <TableHead>Letzter Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Lade…</TableCell></TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Keine Werbekonten. Klicke „Meta-Abrechnungen aktualisieren" oben rechts.</TableCell></TableRow>
              ) : filteredAccounts.map((a) => {
                const cur = a.currency || 'EUR';
                const badge = accountStatusBadge(Number(a.account_status));
                const spent = a.amount_spent != null ? a.amount_spent / 100 : null;
                const cap = a.spend_cap != null ? a.spend_cap / 100 : null;
                const remaining = cap != null && spent != null ? cap - spent : null;
                const warn: string[] = [];
                if (cap != null && spent != null && spent / cap >= 0.9) warn.push('Limit fast erreicht');
                if (a.amount_spent == null && a.balance == null) warn.push('Keine Abrechnungsdaten');
                if (a.account_status && a.account_status !== '1') warn.push(badge.label);
                if (!a.funding_source_details) warn.push('Zahlungsmethode unbekannt');
                const funding = a.funding_source_details as any;
                const paymentMethod = funding?.display_string || funding?.type_name || (funding ? 'verknüpft' : '–');
                return (
                  <TableRow key={a.meta_account_id}>
                    <TableCell className="font-medium">{a.account_name || '–'}<div className="text-xs text-muted-foreground">{a.business_name || ''}</div></TableCell>
                    <TableCell className="font-mono text-xs">{a.meta_account_id}</TableCell>
                    <TableCell>{cur}</TableCell>
                    <TableCell><Badge variant="outline" className={badge.className}>{badge.label}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{a.balance != null ? formatCurrency(a.balance / 100, cur) : '–'}</TableCell>
                    <TableCell className="text-right font-mono">{spent != null ? formatCurrency(spent, cur) : '–'}</TableCell>
                    <TableCell className="text-right font-mono">{cap != null ? formatCurrency(cap, cur) : '–'}</TableCell>
                    <TableCell className="text-right font-mono">{remaining != null ? formatCurrency(remaining, cur) : '–'}</TableCell>
                    <TableCell className="text-xs">{paymentMethod}</TableCell>
                    <TableCell>
                      {warn.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {warn.map((w) => (
                            <Badge key={w} variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />{w}
                            </Badge>
                          ))}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">–</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.synced_at).toLocaleString('de-DE')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Invoices / Payments */}
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Rechnungen</TabsTrigger>
          <TabsTrigger value="payments">Zahlungen</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <Card className="p-8">
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <Info className="h-8 w-8 text-muted-foreground" />
              <div>
                <h3 className="font-semibold">Keine Rechnungsdokumente über die Meta API</h3>
                <p className="text-sm text-muted-foreground max-w-xl mt-1">
                  Meta stellt für die verbundenen Werbekonten über die verwendete Graph API keine einzelnen Rechnungsdokumente bereit.
                  Rechnungen findest du im Meta-Abrechnungsbereich (Business Manager).
                </p>
              </div>
              <Button variant="outline" asChild>
                <a href="https://business.facebook.com/billing_hub/payment_activity" target="_blank" rel="noopener noreferrer">
                  Meta-Abrechnungsbereich öffnen <ExternalLink className="h-3 w-3 ml-2" />
                </a>
              </Button>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="payments">
          <Card className="p-8">
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <Info className="h-8 w-8 text-muted-foreground" />
              <div>
                <h3 className="font-semibold">Keine Zahlungsvorgänge über die Meta API</h3>
                <p className="text-sm text-muted-foreground max-w-xl mt-1">
                  Einzelne Zahlungsvorgänge werden über die aktuell verfügbare Meta Graph API nicht bereitgestellt.
                  Werbeausgaben (siehe oben) sind keine Zahlungen und werden hier nicht als solche dargestellt.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className="text-xl font-semibold mt-1 font-mono">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-2">Quelle: {source}</p>
    </Card>
  );
}
