import { useEffect, useState, useMemo, useCallback } from 'react';
import { Werbebudgets } from '@/components/finanzen/Werbebudgets';
import { QontoVerknuepfungen } from '@/components/finanzen/QontoVerknuepfungen';
import { LexofficeVerknuepfungen } from '@/components/finanzen/LexofficeVerknuepfungen';
import { LexofficeSyncCard } from '@/components/integrations/LexofficeSyncCard';
import { RechnungenListe } from '@/components/finanzen/RechnungenListe';
import { RechnungsAuswertung } from '@/components/finanzen/RechnungsAuswertung';
import { GemeinsameKennzahlen } from '@/components/finanzen/GemeinsameKennzahlen';
import { HealthKarte, FARBE } from '@/components/finanzen/HealthKarte';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Search,
  ExternalLink, CheckCircle2, XCircle, FileText, ChevronDown, Info,
  ArrowUpRight, ArrowDownRight, Users, Receipt, Landmark, PiggyBank,
  Database, ChevronLeft, ChevronRight,
} from 'lucide-react';

const ALLOWED_TABS = ['uebersicht', 'lexware', 'qonto', 'rechnungen', 'werbebudgets'];
type Range = 'this_month' | 'last_month' | 'this_year' | 'last_12m' | 'all' | 'custom';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E5E7', borderRadius: '8px', color: '#1D1D1F', fontSize: 12 };

const eur = (n: number | null | undefined) =>
  '€' + (Number(n || 0)).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eur2 = (n: number | null | undefined) =>
  '€' + (Number(n || 0)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null | undefined) =>
  n == null ? '–' : `${(n * 100).toFixed(1)} %`;
const num = (n: number | null | undefined) => (n == null ? '–' : Number(n).toLocaleString('de-DE'));

function rangeBounds(r: Range, custom?: { from: string; to: string }): { from: Date; to: Date } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  switch (r) {
    case 'this_month': return { from: startOfMonth, to: now };
    case 'last_month': return { from: startOfLastMonth, to: endOfLastMonth };
    case 'this_year': return { from: startOfYear, to: now };
    case 'last_12m': return { from: twelveMonthsAgo, to: now };
    case 'custom':
      return {
        from: custom?.from ? new Date(custom.from) : startOfMonth,
        to: custom?.to ? new Date(custom.to) : now,
      };
    default: return { from: new Date(2000, 0, 1), to: now };
  }
}

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string | null, b: Date) =>
  a ? Math.floor((b.getTime() - new Date(a).getTime()) / 86400000) : null;

// -------------------- KPI card --------------------
function Kpi({
  title, value, subtitle, source, icon: Icon, delta, warn, reliability = 'reliable',
}: {
  title: string; value: string; subtitle?: string; source?: string;
  icon?: any; delta?: { pct: number | null; label?: string };
  warn?: string; reliability?: 'reliable' | 'partial' | 'na';
}) {
  const relColor =
    reliability === 'na' ? 'bg-muted text-muted-foreground'
      : reliability === 'partial' ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-50 text-emerald-700';
  return (
    <Card className="relative">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            {source && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${relColor}`}>
                {source}
              </span>
            )}
            {warn && (
              <TooltipProvider><UiTooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3 w-3 text-amber-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{warn}</TooltipContent>
              </UiTooltip></TooltipProvider>
            )}
          </div>
          {delta && delta.pct != null && (
            <span className={`text-xs font-medium flex items-center gap-0.5 ${delta.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {delta.pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta.pct * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between mt-2 mb-3">
      <h2 className="text-lg font-semibold font-heading tracking-tight">{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

// -------------------- Types --------------------
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
type SyncStatus = {
  resource: string;
  last_success_at: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  fetched_count?: number | null;
  pages_loaded?: number | null;
  total_pages?: number | null;
  completed?: boolean | null;
  mode?: string | null;
  started_at?: string | null;
  triggered_by?: string | null;
};
type Dashboard = any;
type SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger_type: string;
  records_bank_accounts: number | null;
  records_transactions: number | null;
  records_invoices: number | null;
  error_message: string | null;
};

// -------------------- Page --------------------
export default function Finanzen() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab && ALLOWED_TABS.includes(tab) ? tab : 'uebersicht';
  const isMobile = useIsMobile();
  const { hasRole } = useAuth();
  const isAdmin = hasRole?.('admin') ?? false;
  const { toast } = useToast();

  const [range, setRange] = useState<Range>('this_year');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [aging, setAging] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topExpenses, setTopExpenses] = useState<any[]>([]);
  const [dq, setDq] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [chartMode, setChartMode] = useState<'net' | 'bank_in' | 'bank_out' | 'invoices_paid'>('net');
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceMetrics, setInvoiceMetrics] = useState<any>(null);
  const [dbInvoiceTotal, setDbInvoiceTotal] = useState(0);
  const [clientList, setClientList] = useState<string[]>([]);
  const [invoiceReload, setInvoiceReload] = useState(0);

  // Invoices tab state
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterClient, setFilterClient] = useState('all');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [pageIdx, setPageIdx] = useState<number>(0);

  const { from, to } = useMemo(() => rangeBounds(range, customRange), [range, customRange]);
  const fromISO = toISO(from), toISOd = toISO(to);

  const loadAggregates = useCallback(async () => {
    const [d, m, a, tc, te, q, s, runs] = await Promise.all([
      (supabase.rpc as any)('get_qonto_finance_dashboard', { p_start: fromISO, p_end: toISOd }),
      (supabase.rpc as any)('get_qonto_monthly_finance', { p_months: 12 }),
      (supabase.rpc as any)('get_qonto_receivables_aging'),
      (supabase.rpc as any)('get_qonto_top_customers', { p_start: fromISO, p_end: toISOd, p_limit: 10 }),
      (supabase.rpc as any)('get_qonto_top_expenses', { p_start: fromISO, p_end: toISOd, p_limit: 10 }),
      (supabase.rpc as any)('get_qonto_data_quality'),
      supabase.from('qonto_sync_status' as any).select('*'),
      supabase.from('qonto_sync_runs' as any).select('*').order('started_at', { ascending: false }).limit(20),
    ]);
    setDashboard(d.data || null);
    setMonthly((m.data as any[]) || []);
    setAging((a.data as any[]) || []);
    setTopCustomers((tc.data as any[]) || []);
    setTopExpenses((te.data as any[]) || []);
    setDq(q.data || null);
    setSyncStatus((s.data as any) || []);
    setSyncRuns(((runs as any)?.data as SyncRun[]) || []);
  }, [fromISO, toISOd]);

  const loadBase = useCallback(async () => {
    const [a, invoiceCount, clients] = await Promise.all([
      supabase.from('qonto_bank_accounts' as any).select('*').order('is_main', { ascending: false }),
      supabase.from('qonto_client_invoices' as any).select('id', { count: 'exact', head: true }),
      (supabase.rpc as any)('get_qonto_invoice_clients'),
    ]);
    setAccounts((a.data as any) || []);
    setDbInvoiceTotal(invoiceCount.count || 0);
    setClientList(((clients.data as any[]) || []).map(c => c.client_name).filter(Boolean));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadBase(), loadAggregates()]).finally(() => setLoading(false));
  }, [loadBase, loadAggregates]);

  const runSync = async (mode: 'incremental' | 'backfill' = 'incremental') => {
    setSyncing(true);
    try {
      const triggerType = mode === 'backfill' ? 'backfill' : 'manual';
      const body: Record<string, any> = { trigger_type: triggerType };
      if (mode === 'backfill') { body.mode = 'backfill'; body.since = '2020-01-01T00:00:00Z'; }
      const { data, error } = await supabase.functions.invoke('sync-qonto', {
        body,
        headers: { 'X-Sync-Trigger': triggerType },
      });
      if (error) {
        console.error('sync-qonto error', error);
        const ctx: any = (error as any).context;
        let detail = error.message || String(error);
        try {
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json();
            if (j?.error) detail = j.error;
          } else if (ctx && typeof ctx.text === 'function') {
            const t = await ctx.text();
            if (t) detail = t;
          }
        } catch { /* ignore */ }
        if (/Failed to (send|fetch)/i.test(detail)) {
          detail = 'Edge Function nicht erreichbar (Netzwerk oder CORS). Bitte erneut versuchen.';
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      toast({
        title: mode === 'backfill' ? 'Vollständiger Backfill gestartet' : 'Qonto Sync gestartet',
        description: 'Läuft im Hintergrund – Fortschritt siehe „Sync & Datenqualität”.',
      });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await Promise.all([loadBase(), loadAggregates(), ]); setInvoiceReload(k => k + 1);
        if (attempts >= (mode === 'backfill' ? 60 : 24)) { clearInterval(poll); setSyncing(false); }
      }, 5000);
    } catch (e: any) {
      console.error('sync-qonto exception', e);
      toast({ title: 'Qonto Sync fehlgeschlagen', description: String(e?.message || e), variant: 'destructive' });
      setSyncing(false);
    }
  };

  // Derived
  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10)), []);
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const mainAccount = accounts.find(a => a.is_main) || accounts[0];

  const cf = dashboard?.cashflow || {};
  const inv = dashboard?.invoices || {};
  const recv = dashboard?.receivables || {};

  const collectionRate = inv.issued_sum > 0 ? (inv.paid_sum || 0) / inv.issued_sum : null;
  const overdueRate = recv.open_sum > 0 ? (recv.overdue_sum || 0) / recv.open_sum : null;
  const deltaBank = (cf.inflow || 0) - (inv.paid_sum || 0);
  const cashflowDelta = cf.prev_net != null && cf.prev_net !== 0 ? ((cf.net || 0) - cf.prev_net) / Math.abs(cf.prev_net) : null;
  const revenueDelta = inv.prev_paid_sum != null && inv.prev_paid_sum !== 0 ? ((inv.paid_sum || 0) - inv.prev_paid_sum) / Math.abs(inv.prev_paid_sum) : null;

  const rollingAvg = (arr: any[], key: string, n: number, i: number) => {
    const slice = arr.slice(Math.max(0, i - n + 1), i + 1);
    return slice.reduce((s, r) => s + Number(r[key] || 0), 0) / Math.max(1, slice.length);
  };
  const monthlyEnriched = useMemo(() =>
    monthly.map((m, i) => ({
      ...m,
      bank_in: Number(m.bank_in), bank_out: Number(m.bank_out), net: Number(m.net),
      invoices_paid: Number(m.invoices_paid),
      rolling3: rollingAvg(monthly, chartMode, 3, i),
    })), [monthly, chartMode]);

  const monthValues = monthlyEnriched.map(m => Number(m.invoices_paid));
  const avgMonthlyRev = monthValues.length ? monthValues.reduce((s, v) => s + v, 0) / monthValues.length : 0;
  const highMonth = monthlyEnriched.reduce((a, b) => (Number(b.invoices_paid) > Number(a?.invoices_paid || -1) ? b : a), null as any);
  const lowMonth = monthlyEnriched.reduce((a, b) => (a && Number(b.invoices_paid) >= Number(a.invoices_paid) ? a : b), null as any);
  const posMonths = monthlyEnriched.filter(m => Number(m.net) > 0).length;
  const negMonths = monthlyEnriched.filter(m => Number(m.net) < 0).length;

  // Detect specialized accounts by name
  const findAcc = (regex: RegExp) => accounts.find(a => (a.name || '').match(regex));
  const reserveAcc = findAcc(/rücklage|reserve|steuer.?rücklage/i);
  const adsAcc = findAcc(/werbe|ads|marketing/i);
  const taxAcc = findAcc(/umsatzsteuer|ust|tax/i);
  const netLiquidity = reserveAcc ? totalBalance - Number(reserveAcc.balance || 0) : null;
  const reserveShare = reserveAcc && totalBalance > 0 ? Number(reserveAcc.balance || 0) / totalBalance : null;

  const invoiceSync = syncStatus.find(s => s.resource === 'client_invoices');
  const lastSuccessByType = (t: string) =>
    syncRuns.find(r => r.status === 'success' && r.trigger_type === t)?.finished_at
    || syncRuns.find(r => r.status === 'success' && r.trigger_type === t)?.started_at
    || null;
  const lastAnySync = syncRuns.find(r => r.status === 'success')?.finished_at
    || syncRuns.find(r => r.status === 'success')?.started_at
    || invoiceSync?.last_success_at
    || null;
  const lastAutoSync = lastSuccessByType('auto_cron');
  const lastManualSync = lastSuccessByType('manual');
  const lastBackfill = lastSuccessByType('backfill');
  const fmtDT = (v: string | null) => v ? new Date(v).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch keiner';

  const invoiceSyncIncomplete = !!invoiceSync && (
    !!invoiceSync.last_error
    || invoiceSync.completed === false
    || (!!invoiceSync.total_pages && !!invoiceSync.pages_loaded && invoiceSync.pages_loaded < invoiceSync.total_pages)
    || (dbInvoiceTotal <= 100 && invoiceSync.completed !== true)
  );

  if (loading) return (
    <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
    </div><Skeleton className="h-64" /></div>
  );

  const hasQontoData = accounts.length > 0 || dbInvoiceTotal > 0;
  const top3Share = topCustomers.length > 0 && (inv.paid_sum || 0) > 0
    ? topCustomers.slice(0, 3).reduce((s, c) => s + Number(c.total_paid), 0) / (inv.paid_sum || 1)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Finanzen</h1>
          <p className="text-xs text-muted-foreground">
            Qonto Finanzübersicht
            {lastAnySync && <> · Letzter Sync: <span className="font-medium text-foreground">{fmtDT(lastAnySync)}</span></>}
            <> · Letzter Auto-Sync: <span className={`font-medium ${lastAutoSync ? 'text-foreground' : 'text-amber-600'}`}>{fmtDT(lastAutoSync)}</span></>
            {lastManualSync && <> · Letzter manueller Sync: <span className="font-medium text-foreground">{fmtDT(lastManualSync)}</span></>}
            {lastBackfill && <> · Letzter Backfill: <span className="font-medium text-foreground">{fmtDT(lastBackfill)}</span></>}
            <> · Auto-Sync-Plan: täglich 06:00 & alle 3 h (09–21 Uhr)</>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Dieser Monat</SelectItem>
              <SelectItem value="last_month">Letzter Monat</SelectItem>
              <SelectItem value="this_year">Dieses Jahr</SelectItem>
              <SelectItem value="last_12m">Letzte 12 Monate</SelectItem>
              <SelectItem value="all">Insgesamt</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {range === 'custom' && (
            <>
              <Input type="date" value={customRange.from} onChange={e => setCustomRange({ ...customRange, from: e.target.value })} className="w-36 h-9 text-sm" />
              <Input type="date" value={customRange.to} onChange={e => setCustomRange({ ...customRange, to: e.target.value })} className="w-36 h-9 text-sm" />
            </>
          )}
          {isAdmin && (
            <>
              <Button onClick={() => runSync('incremental')} disabled={syncing} size="sm" className="h-9">
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Synchronisiere…' : 'Qonto Sync'}
              </Button>
              <Button
                onClick={() => {
                  if (confirm('Vollständigen Backfill starten? Holt ALLE historischen Rechnungen & Transaktionen (kann mehrere Minuten dauern).')) {
                    runSync('backfill');
                  }
                }}
                disabled={syncing}
                size="sm"
                variant="outline"
                className="h-9"
              >
                <Database className="h-4 w-4 mr-2" />
                Vollständiger Backfill
              </Button>
            </>
          )}
        </div>
      </div>

      {!hasQontoData && (
        <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Noch keine Qonto-Daten. {isAdmin ? 'Starte oben den Sync.' : 'Bitte einen Admin, den Sync auszulösen.'}
        </CardContent></Card>
      )}

      <Tabs value={currentTab}>
        {/* Navigation läuft über das linke Menü (Routen /finanzen/:tab) – keine eigene Tab-Leiste. */}

        {/* ============ ÜBERSICHT ============ */}
        <TabsContent value="uebersicht" className="space-y-8 mt-4 rounded-3xl bg-muted/40 p-4 sm:p-6">
          <RechnungsAuswertung quellen={['qonto', 'lexoffice']} quelleText="Qonto + lexoffice zusammengerechnet" />
          <p className="text-xs text-muted-foreground">Kontostand, Bankeingänge und Bankausgänge gibt es nur bei Qonto — sie stehen im Tab Qonto und werden hier nicht summiert.</p>
        </TabsContent>

        {/* ============ LEXWARE ============ */}
        <TabsContent value="lexware" className="space-y-8 mt-4">
          <GemeinsameKennzahlen quelle="lexoffice" from={range === 'all' ? null : fromISO} to={range === 'all' ? null : toISOd} />
          <div className="space-y-4">
            <SectionTitle title="Nur in lexoffice" />
            {isAdmin && <LexofficeSyncCard />}
            <RechnungsAuswertung quellen={['lexoffice']} quelleText="lexoffice Rechnungen" nurZusatz
              verlaufHinweis={`lexoffice liefert kein Zahldatum, darum bleibt „Bezahlt” im Verlauf leer`} />
            <p className="text-xs text-muted-foreground">Liquidität und Cashflow gibt es nur bei Qonto — lexoffice führt kein Bankkonto.</p>
          </div>
        </TabsContent>

        {/* ============ QONTO ============ */}
        <TabsContent value="qonto" className="space-y-6 mt-4">

          <GemeinsameKennzahlen quelle="qonto" from={range === 'all' ? null : fromISO} to={range === 'all' ? null : toISOd} />

          <SectionTitle title="Nur in Qonto" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi title="Kontostand gesamt" value={eur(totalBalance)} icon={Wallet} source="Qonto Konten"
              subtitle={mainAccount?.name ? `Haupt: ${mainAccount.name}` : undefined} />
            <Kpi title="Netto-Cashflow" value={eur(cf.net)} icon={cf.net >= 0 ? TrendingUp : TrendingDown} source="Qonto Bank"
              delta={cashflowDelta != null ? { pct: cashflowDelta } : undefined}
              subtitle={`Zeitraum · ${num(cf.inflow_count)} ein / ${num(cf.outflow_count)} aus`} />
            <Kpi title="Cash-Ergebnis" value={eur(cf.net)} icon={PiggyBank} source="Qonto Bank"
              subtitle="Einnahmen − Ausgaben"
              warn="Cash-basiertes Ergebnis, keine Buchhaltungs-/Steuergröße." />
          </div>

          {/* A. LIQUIDITÄT */}
          <div>
            <SectionTitle title="A · Liquidität" subtitle="Qonto Konten" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <HealthKarte titel="Gesamt-Guthaben" farbe={FARBE.primaer} wert={eur(totalBalance)}
                satz={`Summe über ${accounts.length} Konten.`} />
              <HealthKarte titel="Netto-Liquidität" farbe={FARBE.gruen} wert={netLiquidity != null ? eur(netLiquidity) : '—'}
                satz={netLiquidity != null ? 'Guthaben ohne Rücklagen-Konto.' : 'Kein Rücklagen-Konto erkannt — nicht berechenbar.'} />
              <HealthKarte titel="Rücklagen-Anteil" farbe={FARBE.grau} wert={reserveShare != null ? pct(reserveShare) : '—'}
                satz={reserveShare != null ? 'Anteil des Rücklagen-Kontos am Gesamt-Guthaben.' : 'Kein Rücklagen-Konto erkannt — nicht berechenbar.'} />
            </div>
            <HealthKarte titel="Konten" farbe={FARBE.primaer}
              satz={[adsAcc ? `Werbebudget-Konto ${eur(adsAcc.balance)}` : null, taxAcc ? `Umsatzsteuer-Konto ${eur(taxAcc.balance)}` : null].filter(Boolean).join(' · ') || 'Nach Kontostand sortiert, größtes oben.'}>
              <div className="mt-4 divide-y">
                {[...accounts].sort((a, b) => {
                  const x = Number(a.balance || 0), y = Number(b.balance || 0);
                  if ((x === 0) !== (y === 0)) return x === 0 ? 1 : -1;
                  return y - x;
                }).map(a => {
                  const bal = Number(a.balance || 0);
                  const leer = bal === 0;
                  const zweck = a === reserveAcc ? 'Rücklagen' : a === taxAcc ? 'Umsatzsteuer' : a === adsAcc ? 'Werbebudget' : a.is_main ? 'Haupt' : null;
                  const anteil = totalBalance > 0 && bal > 0 ? Math.min(100, (bal / totalBalance) * 100) : 0;
                  return (
                    <TooltipProvider key={a.id}>
                      <div className={`py-3 ${leer ? 'pl-6 opacity-60' : ''}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate font-medium text-sm">{a.name || 'Konto'}</span>
                              {a.is_main && <Badge variant="secondary" className="text-[9px] h-4">HAUPT</Badge>}
                              <UiTooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground font-mono truncate">{a.iban ? '…' + a.iban.slice(-6) : ''}</span>
                                </TooltipTrigger>
                                <TooltipContent className="font-mono text-xs">{a.iban}</TooltipContent>
                              </UiTooltip>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{zweck ?? 'Verwendungszweck nicht erkannt'}</p>
                          </div>
                          <span className={`tabular-nums font-medium shrink-0 ${bal < 100 && !leer ? 'text-amber-600' : ''}`}>{eur2(a.balance)}</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${anteil}%` }} />
                        </div>
                      </div>
                    </TooltipProvider>
                  );
                })}
                {accounts.length === 0 && <p className="text-xs text-muted-foreground py-3">Keine Konten synchronisiert.</p>}
              </div>
            </HealthKarte>
          </div>

          {/* B. CASHFLOW */}
          <div>
            <SectionTitle title="B · Cashflow" subtitle={`${fromISO} → ${toISOd}`} />
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              <Kpi title="Bankeingänge" value={eur(cf.inflow)} icon={ArrowUpRight} source="Qonto Bank"
                subtitle={`${num(cf.inflow_count)} Zahlungen`} />
              <Kpi title="Bankausgänge" value={eur(cf.outflow)} icon={ArrowDownRight} source="Qonto Bank"
                subtitle={`${num(cf.outflow_count)} Zahlungen`} />
              <Kpi title="Ø Zahlungseingang" value={eur(cf.avg_inflow)} source="Qonto Bank" />
              <Kpi title="Ø Zahlungsausgang" value={eur(cf.avg_outflow)} source="Qonto Bank" />
              <Kpi title="Größter Eingang" value={eur(cf.max_inflow)} source="Qonto Bank" />
              <Kpi title="Größter Ausgang" value={eur(cf.max_outflow)} source="Qonto Bank" />
            </div>
          </div>

          {/* CHART */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm">Monatsentwicklung (letzte 12 Monate)</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {highMonth && lowMonth ? `Hoch: ${highMonth.month} · Tief: ${lowMonth.month}` : ''}
                </p>
              </div>
              <Select value={chartMode} onValueChange={v => setChartMode(v as any)}>
                <SelectTrigger className="w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="net">Netto-Cashflow</SelectItem>
                  <SelectItem value="bank_in">Bankeingänge</SelectItem>
                  <SelectItem value="bank_out">Bankausgänge</SelectItem>
                  <SelectItem value="invoices_paid">Bezahlte Rechnungen</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {monthlyEnriched.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Keine Monatsdaten.</p>
              ) : (
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
                  <ComposedChart data={monthlyEnriched}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F7" />
                    <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} />
                    <YAxis stroke="#AEAEB2" fontSize={11} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur2(Number(v))} />
                    <Bar dataKey={chartMode} radius={[4, 4, 0, 0]}>
                      {monthlyEnriched.map((m, i) => (
                        <Cell key={i} fill={chartMode === 'net' && Number(m.net) < 0 ? '#dc2626' : 'hsl(174, 90%, 31%)'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="rolling3" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <div className="grid grid-cols-4 gap-3 mt-3 text-xs">
                <div><span className="text-muted-foreground">Ø Monatsumsatz:</span> <span className="font-medium">{eur(avgMonthlyRev)}</span></div>
                <div><span className="text-muted-foreground">Positive Monate:</span> <span className="font-medium">{posMonths}</span></div>
                <div><span className="text-muted-foreground">Negative Monate:</span> <span className="font-medium">{negMonths}</span></div>
                <div><span className="text-muted-foreground">Rolling 3M (Ø):</span> <span className="font-medium">{eur(monthlyEnriched.at(-1)?.rolling3 || 0)}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* C. RECHNUNGEN & CASH COLLECTED */}
          <div>
            <SectionTitle title="C · Rechnungen & Cash Collected" subtitle="Qonto Rechnungen" />
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              <Kpi title="Bank-Eingänge" value={eur(cf.inflow)} source="Qonto Bank" subtitle="Vergleichsbasis" />
              <Kpi title="Δ Bank − Rechnungen" value={eur(deltaBank)} source="Qonto"
                warn="Differenz zwischen Bankeingängen und bezahlten Rechnungen kann auf nicht-Rechnungsumsatz oder fehlende Zuordnung hindeuten." />
              <Kpi title="Ø Rechnungsbetrag" value={eur(inv.issued_count ? (inv.issued_sum || 0) / inv.issued_count : 0)}
                source="Qonto Rechnungen" reliability={inv.issued_count ? 'reliable' : 'na'} />
              <Kpi title="Ø Zahlungsdauer"
                value={inv.avg_days_to_pay != null ? `${Number(inv.avg_days_to_pay).toFixed(1)} T` : '–'}
                source="Qonto Rechnungen"
                subtitle="issue → paid"
                reliability={inv.avg_days_to_pay != null ? 'reliable' : 'na'} />
              <Kpi title="Größte offene" value={eur(recv.largest_open)} source="Qonto Rechnungen" />
              <Kpi title="Älteste offene" value={recv.oldest_open_issue || '–'} source="Qonto Rechnungen"
                subtitle={recv.oldest_open_issue ? `${daysBetween(recv.oldest_open_issue, today)} Tage` : ''} />
            </div>
          </div>

          {/* H. FORDERUNGSALTER */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">H · Forderungsalter</CardTitle></CardHeader>
              <CardContent>
                {aging.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Keine offenen Forderungen.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={aging}>
                        <XAxis dataKey="bucket" stroke="#AEAEB2" fontSize={11} />
                        <YAxis stroke="#AEAEB2" fontSize={11} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur2(Number(v))} />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                          {aging.map((a, i) => (
                            <Cell key={i} fill={a.bucket === '60+' ? '#dc2626' : a.bucket === '31-60' ? '#f59e0b' : 'hsl(174, 90%, 31%)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-5 gap-1 mt-2 text-xs text-center">
                      {aging.map(a => (
                        <div key={a.bucket}>
                          <p className="text-muted-foreground">{a.bucket}T</p>
                          <p className="font-medium">{num(a.count)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Top Kunden */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Top 10 Kunden</CardTitle>
                {top3Share != null && (
                  <span className="text-xs text-muted-foreground">Top-3-Anteil: <strong>{pct(top3Share)}</strong></span>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {topCustomers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Keine bezahlten Rechnungen im Zeitraum.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="h-8 text-xs">Kunde</TableHead>
                      <TableHead className="h-8 text-xs text-right">Rechnungen</TableHead>
                      <TableHead className="h-8 text-xs text-right">Umsatz</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {topCustomers.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-1.5 text-sm truncate max-w-[200px]">{c.client_name}</TableCell>
                          <TableCell className="py-1.5 text-sm text-right">{num(c.invoice_count)}</TableCell>
                          <TableCell className="py-1.5 text-sm text-right font-medium tabular-nums">{eur(c.total_paid)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* E. AUSGABEN & Top Empfänger */}
          <div>
            <SectionTitle title="E · Ausgaben & Top Empfänger" subtitle="Qonto Banktransaktionen" />
            <Card>
              <CardContent className="p-0">
                {topExpenses.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Keine Ausgaben im Zeitraum.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="h-8 text-xs">Empfänger / Label</TableHead>
                      <TableHead className="h-8 text-xs">Kategorie</TableHead>
                      <TableHead className="h-8 text-xs text-right">Anzahl</TableHead>
                      <TableHead className="h-8 text-xs text-right">Gesamt</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {topExpenses.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-1.5 text-sm truncate max-w-[300px]">{e.label}</TableCell>
                          <TableCell className="py-1.5 text-xs text-muted-foreground">{e.category}</TableCell>
                          <TableCell className="py-1.5 text-sm text-right">{num(e.count)}</TableCell>
                          <TableCell className="py-1.5 text-sm text-right font-medium tabular-nums">{eur(e.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* G. USt Indikatoren */}
          <div>
            <SectionTitle title="G · Umsatzsteuer-Indikatoren" subtitle="Indikator, keine Steuerberechnung" />
            {taxAcc ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi title="USt-Konto Stand" value={eur(taxAcc.balance)} source="Qonto Konto"
                  warn="Reiner Kontostand – kein Steuerbescheid." />
                <Kpi title="USt/Umsatz-Verhältnis"
                  value={inv.paid_sum ? pct(Number(taxAcc.balance || 0) / Number(inv.paid_sum)) : '–'}
                  source="Qonto" reliability={inv.paid_sum ? 'partial' : 'na'}
                  warn="Grobe Näherung, keine echte USt-Quote." />
              </div>
            ) : (
              <Card className="border-dashed"><CardContent className="p-4 text-xs text-muted-foreground">
                Nicht berechenbar – Qonto-Daten enthalten kein eindeutiges USt-Konto oder USt-Kategorien.
              </CardContent></Card>
            )}
          </div>

          {/* I. DATENQUALITÄT (collapsible) */}
          <Collapsible>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="h-4 w-4" />Sync & Datenqualität
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 text-xs space-y-3">
                  {dq && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {[
                        ['Bankkonten', dq.accounts_count],
                        ['Rechnungen', dq.invoices_count],
                        ['Transaktionen', dq.transactions_count],
                        ['Rechnungen ohne Kunde', dq.invoices_no_client],
                        ['Rechnungen ohne Fälligkeit', dq.invoices_no_due_date],
                        ['Bezahlt ohne paid_at', dq.paid_no_paid_at],
                        ['Tx ohne Kategorie', dq.tx_no_category],
                        ['Tx ohne Label', dq.tx_no_label],
                        ['Mögliche Duplikate', dq.possible_duplicate_tx],
                      ].map(([label, v]) => (
                        <div key={String(label)} className="border rounded p-2">
                          <p className="text-muted-foreground text-xs">{label}</p>
                          <p className="font-semibold tabular-nums">{num(Number(v))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t pt-2">
                    <p className="font-medium mb-2">Sync-Status je Ressource</p>
                    <div className="space-y-1.5">
                      {syncStatus.map(s => {
                        const isDone = s.completed === true;
                        const isRunning = s.completed === false && !s.last_error;
                        const dot = s.last_error ? 'bg-red-500' : isDone ? 'bg-emerald-500' : isRunning ? 'bg-amber-500 animate-pulse' : 'bg-muted';
                        return (
                          <div key={s.resource} className="border rounded p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${dot}`} />
                                <span className="font-medium">{s.resource}</span>
                                {s.mode && <Badge variant="outline" className="text-xs py-0 h-4">{s.mode}</Badge>}
                                {s.triggered_by && (
                                  <Badge variant="outline" className="text-xs py-0 h-4">
                                    {s.triggered_by === 'cron' ? 'automatisch' : 'manuell'}
                                  </Badge>
                                )}
                                {isDone && <span className="text-xs text-emerald-700">✓ vollständig</span>}
                                {isRunning && <span className="text-xs text-amber-700">läuft…</span>}
                                {s.completed === false && !isRunning && s.last_error && <span className="text-xs text-destructive">✗ unvollständig</span>}
                              </div>
                              <span className="text-muted-foreground">
                                {s.last_success_at ? new Date(s.last_success_at).toLocaleString('de-DE') : '—'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground pl-4">
                              {s.pages_loaded != null && <span>Seiten: <strong className="text-foreground tabular-nums">{s.pages_loaded}{s.total_pages ? ` / ${s.total_pages}` : ''}</strong></span>}
                              {s.fetched_count != null && <span>Datensätze: <strong className="text-foreground tabular-nums">{num(s.fetched_count)}</strong></span>}
                            </div>
                            {s.last_error && (
                              <p className="text-xs text-destructive mt-1 pl-4 break-all">✗ {s.last_error.slice(0, 200)}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="border-t pt-2">
                      <p className="font-medium mb-2">Sync-Historie (letzte 20 Läufe)</p>
                      {syncRuns.length === 0 ? (
                        <p className="text-muted-foreground text-xs">Noch keine Sync-Läufe protokolliert.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="h-7 text-xs">Start</TableHead>
                                <TableHead className="h-7 text-xs">Ende</TableHead>
                                <TableHead className="h-7 text-xs">Typ</TableHead>
                                <TableHead className="h-7 text-xs">Status</TableHead>
                                <TableHead className="h-7 text-xs text-right">Rechn.</TableHead>
                                <TableHead className="h-7 text-xs text-right">Trans.</TableHead>
                                <TableHead className="h-7 text-xs text-right">Konten</TableHead>
                                <TableHead className="h-7 text-xs">Fehler</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {syncRuns.map(r => (
                                <TableRow key={r.id}>
                                  <TableCell className="py-1 text-xs whitespace-nowrap">{fmtDT(r.started_at)}</TableCell>
                                  <TableCell className="py-1 text-xs whitespace-nowrap">{r.finished_at ? fmtDT(r.finished_at) : '—'}</TableCell>
                                  <TableCell className="py-1">
                                    <Badge variant="outline" className="text-xs py-0 h-4">
                                      {r.trigger_type === 'auto_cron' ? 'automatisch' : r.trigger_type === 'backfill' ? 'Backfill' : 'manuell'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-1">
                                    <Badge
                                      variant="outline"
                                      className={`text-xs py-0 h-4 ${
                                        r.status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : r.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                      }`}
                                    >
                                      {r.status === 'success' ? '✓ ok' : r.status === 'failed' ? '✗ fehlgeschlagen' : 'läuft'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-1 text-xs text-right tabular-nums">{num(r.records_invoices || 0)}</TableCell>
                                  <TableCell className="py-1 text-xs text-right tabular-nums">{num(r.records_transactions || 0)}</TableCell>
                                  <TableCell className="py-1 text-xs text-right tabular-nums">{num(r.records_bank_accounts || 0)}</TableCell>
                                  <TableCell className="py-1 text-xs text-destructive max-w-[240px] truncate" title={r.error_message || ''}>
                                    {r.error_message ? r.error_message.slice(0, 80) : ''}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        {/* ============ RECHNUNGEN ============ */}
        <TabsContent value="rechnungen" className="space-y-4 mt-4">
          <RechnungenListe from={range === 'all' ? null : fromISO} to={range === 'all' ? null : toISOd} reloadKey={invoiceReload} qontoSyncUnvollstaendig={invoiceSyncIncomplete} />
        </TabsContent>

        <TabsContent value="werbebudgets" className="space-y-4 mt-4">
          <Werbebudgets />
        </TabsContent>

      </Tabs>
    </div>
  );
}
