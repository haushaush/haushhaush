import { useEffect, useState, useMemo, useCallback } from 'react';
import { Werbebudgets } from '@/components/finanzen/Werbebudgets';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Search,
  ExternalLink, CheckCircle2, XCircle, FileText,
} from 'lucide-react';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E5E7', borderRadius: '8px', color: '#1D1D1F' };
const ALLOWED_TABS = ['uebersicht', 'rechnungen', 'werbebudgets'];

type Account = {
  id: string; iban: string | null; name: string | null; balance: number | null;
  currency: string | null; is_main: boolean; status: string | null;
};
type Invoice = {
  id: string; qonto_invoice_id: string; number: string | null; status: string | null;
  invoice_url: string | null; client_name: string | null; currency: string | null;
  total_amount: number | null; issue_date: string | null; due_date: string | null;
  paid_at: string | null; updated_at_qonto: string | null;
};
type Tx = {
  id: string; amount: number | null; side: string | null; label: string | null;
  status: string | null; settled_at: string | null; emitted_at: string | null;
};
type SyncStatus = {
  resource: string; last_synced_at: string | null; last_success_at: string | null; last_error: string | null;
};

type Range = 'this_month' | 'last_month' | 'this_year' | 'last_12m' | 'all';

const eur = (n: number | null | undefined) =>
  '€' + (Number(n || 0)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function rangeBounds(r: Range): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  switch (r) {
    case 'this_month': return { from: startOfMonth, to: null };
    case 'last_month': return { from: startOfLastMonth, to: endOfLastMonth };
    case 'this_year': return { from: startOfYear, to: null };
    case 'last_12m': return { from: twelveMonthsAgo, to: null };
    default: return { from: null, to: null };
  }
}

function inRange(dateStr: string | null, from: Date | null, to: Date | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export default function Finanzen() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab && ALLOWED_TABS.includes(tab) ? tab : 'uebersicht';
  const isMobile = useIsMobile();
  const { hasRole } = useAuth();
  const isAdmin = hasRole?.('admin') ?? false;
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [range, setRange] = useState<Range>('this_year');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [chartMode, setChartMode] = useState<'invoices' | 'bank'>('invoices');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [a, i, t, s] = await Promise.all([
      supabase.from('qonto_bank_accounts' as any).select('*').order('is_main', { ascending: false }),
      supabase.from('qonto_client_invoices' as any).select('*').order('issue_date', { ascending: false }),
      supabase.from('qonto_transactions_new' as any).select('*').order('settled_at', { ascending: false }).limit(5000),
      supabase.from('qonto_sync_status' as any).select('*'),
    ]);
    setAccounts((a.data as any) || []);
    setInvoices((i.data as any) || []);
    setTxs((t.data as any) || []);
    setSyncStatus((s.data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-qonto');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Qonto Sync abgeschlossen',
        description: `Konten: ${data.synced?.bank_accounts ?? 0} · TX: ${data.synced?.transactions ?? 0} · Rechnungen: ${data.synced?.invoices ?? 0}`,
      });
      await loadAll();
    } catch (e: any) {
      toast({ title: 'Qonto Sync fehlgeschlagen', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const { from, to } = useMemo(() => rangeBounds(range), [range]);
  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10)), []);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const mainAccount = accounts.find(a => a.is_main) || accounts[0];

  const unpaidInvoices = invoices.filter(i => i.status === 'unpaid');
  const openTotal = unpaidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const overdueInvoices = unpaidInvoices.filter(i => i.due_date && new Date(i.due_date) < today);
  const overdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  const paidInRange = invoices.filter(i => i.status === 'paid' && inRange(i.paid_at || i.issue_date, from, to));
  const cashCollected = paidInRange.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  // Current month revenue (paid invoices)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthPaid = invoices
    .filter(i => i.status === 'paid' && inRange(i.paid_at || i.issue_date, monthStart, null))
    .reduce((s, i) => s + Number(i.total_amount || 0), 0);

  const txsInRange = txs.filter(t => t.status === 'completed' && inRange(t.settled_at || t.emitted_at, from, to));
  const bankIn = txsInRange.filter(t => t.side === 'credit').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
  const bankOut = txsInRange.filter(t => t.side === 'debit').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);

  // Monthly chart (last 12 months)
  const monthly = useMemo(() => {
    const map: Record<string, { month: string; invoices: number; bank: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      map[key] = { month: key, invoices: 0, bank: 0 };
    }
    invoices.forEach(inv => {
      if (inv.status !== 'paid') return;
      const d = inv.paid_at || inv.issue_date;
      if (!d) return;
      const key = d.slice(0, 7);
      if (map[key]) map[key].invoices += Number(inv.total_amount || 0);
    });
    txs.forEach(t => {
      if (t.status !== 'completed' || t.side !== 'credit') return;
      const d = t.settled_at || t.emitted_at;
      if (!d) return;
      const key = d.slice(0, 7);
      if (map[key]) map[key].bank += Math.abs(Number(t.amount || 0));
    });
    return Object.values(map);
  }, [invoices, txs, today]);

  // Rechnungen filter
  const filteredInvoices = useMemo(() => {
    let out = invoices;
    if (filterStatus !== 'all') out = out.filter(i => i.status === filterStatus);
    if (filterOverdue) out = out.filter(i => i.status === 'unpaid' && i.due_date && new Date(i.due_date) < today);
    if (range !== 'all') out = out.filter(i => inRange(i.issue_date, from, to));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(i =>
        (i.number || '').toLowerCase().includes(q) ||
        (i.client_name || '').toLowerCase().includes(q)
      );
    }
    return out;
  }, [invoices, filterStatus, filterOverdue, range, from, to, search, today]);

  const statusBadge = (i: Invoice) => {
    const isOverdue = i.status === 'unpaid' && i.due_date && new Date(i.due_date) < today;
    if (i.status === 'paid') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Bezahlt</Badge>;
    if (i.status === 'canceled') return <Badge variant="outline">Storniert</Badge>;
    if (i.status === 'draft') return <Badge variant="secondary">Entwurf</Badge>;
    if (i.status === 'unpaid') return isOverdue
      ? <Badge variant="destructive">Überfällig</Badge>
      : <Badge className="bg-amber-100 text-amber-800 border-amber-200">Offen</Badge>;
    return <Badge variant="outline">{i.status}</Badge>;
  };

  const lastSync = syncStatus.find(s => s.resource === 'client_invoices')?.last_success_at
    || syncStatus.find(s => s.resource === 'bank_accounts')?.last_success_at;
  const lastError = syncStatus.find(s => s.last_error)?.last_error;

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  const hasQontoData = accounts.length > 0 || invoices.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Finanzen</h1>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-1">
              Letzter Qonto-Sync: {new Date(lastSync).toLocaleString('de-DE')}
            </p>
          )}
        </div>
        {isAdmin && (
          <Button onClick={runSync} disabled={syncing} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisiere…' : 'Qonto synchronisieren'}
          </Button>
        )}
      </div>

      {!hasQontoData && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Noch keine Qonto-Daten vorhanden. {isAdmin ? 'Starte oben den Sync.' : 'Bitte einen Admin, den Qonto-Sync auszulösen.'}
          </CardContent>
        </Card>
      )}

      {lastError && isAdmin && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 flex items-start gap-2 text-xs">
            <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-destructive">Letzter Sync-Fehler</p>
              <p className="text-muted-foreground">{lastError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={currentTab} onValueChange={v => navigate(v === 'uebersicht' ? '/finanzen' : `/finanzen/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
          <TabsTrigger value="werbebudgets">Werbebudgets</TabsTrigger>
        </TabsList>

        <TabsContent value="uebersicht" className="space-y-6 mt-4">
          {/* Bank accounts */}
          {accounts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />Qonto Konten
                </h3>
                <span className="text-sm font-bold text-primary">Gesamt: {eur(totalBalance)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {accounts.map(acc => (
                  <Card key={acc.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium">{acc.name || 'Konto'}</p>
                        {acc.is_main && <Badge variant="secondary" className="text-[9px]">HAUPT</Badge>}
                      </div>
                      <p className={`text-xl font-bold ${Number(acc.balance) < 100 ? 'text-warning' : ''}`}>
                        {eur(acc.balance)}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">{acc.iban}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Zeitraum */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Zeitraum:</span>
            <Select value={range} onValueChange={v => setRange(v as Range)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Dieser Monat</SelectItem>
                <SelectItem value="last_month">Letzter Monat</SelectItem>
                <SelectItem value="this_year">Dieses Jahr</SelectItem>
                <SelectItem value="last_12m">Letzte 12 Monate</SelectItem>
                <SelectItem value="all">Insgesamt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* KPI Kacheln */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Kontostand (gesamt)" value={eur(totalBalance)} icon={Wallet} subtitle={mainAccount?.name ? `Haupt: ${mainAccount.name}` : undefined} />
            <StatCard title="Offene Rechnungen" value={eur(openTotal)} icon={FileText} subtitle={`${unpaidInvoices.length} offen`} />
            <StatCard title="Überfällig" value={eur(overdueTotal)} icon={AlertTriangle} subtitle={`${overdueInvoices.length} Rechnungen`} />
            <StatCard title="Cash Collected" value={eur(cashCollected)} icon={CheckCircle2} subtitle={`bezahlte Rechnungen (${paidInRange.length})`} />
            <StatCard title="Umsatz Monat" value={eur(monthPaid)} icon={TrendingUp} subtitle="bezahlte Rechnungen dieser Monat" />
            <StatCard title="Bankeingänge" value={eur(bankIn)} icon={TrendingUp} subtitle="Qonto credit (completed)" />
            <StatCard title="Bankausgaben" value={eur(bankOut)} icon={TrendingDown} subtitle="Qonto debit (completed)" />
            <StatCard title="Rechnungen ↔ Bank" value={eur(cashCollected - bankIn)} icon={AlertTriangle} subtitle="Delta Invoices vs. Bank" />
          </div>

          {/* Monatschart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Monatsumsatz (letzte 12 Monate)</CardTitle>
              <Select value={chartMode} onValueChange={v => setChartMode(v as any)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoices">Rechnungen (bezahlt)</SelectItem>
                  <SelectItem value="bank">Bankeingänge</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                <BarChart data={monthly}>
                  <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} />
                  <YAxis stroke="#AEAEB2" fontSize={11} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur(Number(v))} />
                  <Bar dataKey={chartMode} fill="hsl(174, 90%, 31%)" name={chartMode === 'invoices' ? 'Bezahlt' : 'Bankeingänge'} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sync Debug */}
          {isAdmin && syncStatus.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Qonto Sync Status</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <div>Bankkonten: <strong>{accounts.length}</strong></div>
                <div>Rechnungen: <strong>{invoices.length}</strong></div>
                <div>Transaktionen (letzte 5000): <strong>{txs.length}</strong></div>
                {syncStatus.map(s => (
                  <div key={s.resource} className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground">{s.resource}</span>
                    <span>
                      {s.last_success_at ? new Date(s.last_success_at).toLocaleString('de-DE') : '—'}
                      {s.last_error && <span className="text-destructive ml-2">✗ {s.last_error.slice(0, 60)}</span>}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rechnungen" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Kunde oder Nr. suchen" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="paid">Bezahlt</SelectItem>
                <SelectItem value="unpaid">Offen</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
                <SelectItem value="canceled">Storniert</SelectItem>
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={v => setRange(v as Range)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="this_month">Dieser Monat</SelectItem>
                <SelectItem value="last_month">Letzter Monat</SelectItem>
                <SelectItem value="this_year">Dieses Jahr</SelectItem>
                <SelectItem value="last_12m">Letzte 12 Monate</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={filterOverdue ? 'default' : 'outline'} size="sm" onClick={() => setFilterOverdue(!filterOverdue)}>
              Nur überfällig
            </Button>
          </div>

          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nr.</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>Ausgestellt</TableHead>
                <TableHead>Fällig</TableHead>
                <TableHead>Bezahlt</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine Rechnungen gefunden</TableCell></TableRow>
                )}
                {filteredInvoices.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.number || '–'}</TableCell>
                    <TableCell className="text-muted-foreground">{i.client_name || '–'}</TableCell>
                    <TableCell>{statusBadge(i)}</TableCell>
                    <TableCell className="text-right font-medium">{eur(i.total_amount)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i.issue_date || '–'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i.due_date || '–'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i.paid_at || '–'}</TableCell>
                    <TableCell>
                      {i.invoice_url && (
                        <a href={i.invoice_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        <TabsContent value="werbebudgets" className="space-y-4 mt-4">
          <Werbebudgets />
        </TabsContent>
      </Tabs>
    </div>
  );
}
