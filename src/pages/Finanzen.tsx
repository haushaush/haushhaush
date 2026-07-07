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

const ALLOWED_TABS = ['uebersicht', 'rechnungen', 'werbebudgets'];
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
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
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
            <span className={`text-[11px] font-medium flex items-center gap-0.5 ${delta.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
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
  const [invoiceLoading, setInvoiceLoading] = useState(false);

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
      const triggerHeader = mode === 'backfill' ? 'backfill' : 'manual';
      const { data, error } = await supabase.functions.invoke('sync-qonto', {
        body: mode === 'backfill' ? { mode: 'backfill', since: '2020-01-01T00:00:00Z' } : {},
        headers: { 'X-Sync-Trigger': triggerHeader },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: mode === 'backfill' ? 'Vollständiger Backfill gestartet' : 'Qonto Sync gestartet',
        description: 'Läuft im Hintergrund – Fortschritt siehe „Sync & Datenqualität".',
      });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await Promise.all([loadBase(), loadAggregates(), loadInvoicePage(), loadInvoiceMetrics()]);
        if (attempts >= (mode === 'backfill' ? 60 : 24)) { clearInterval(poll); setSyncing(false); }
      }, 5000);
    } catch (e: any) {
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

  // Reset page when filters change
  useEffect(() => { setPageIdx(0); }, [filterStatus, filterOverdue, filterClient, search, range, pageSize]);

  const cleanSearch = search.trim().replace(/[%(),]/g, ' ');

  const buildInvoiceQuery = useCallback((withCount = true) => {
    let query = supabase
      .from('qonto_client_invoices' as any)
      .select('*', withCount ? { count: 'exact' } : undefined)
      .order('issue_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (range !== 'all') query = query.gte('issue_date', fromISO).lte('issue_date', toISOd);
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterOverdue) query = query.eq('status', 'unpaid').lt('due_date', toISO(today));
    if (filterClient !== 'all') query = query.eq('client_name', filterClient);
    if (cleanSearch) query = query.or(`number.ilike.%${cleanSearch}%,client_name.ilike.%${cleanSearch}%`);

    return query;
  }, [range, fromISO, toISOd, filterStatus, filterOverdue, filterClient, cleanSearch, today]);

  const loadInvoicePage = useCallback(async () => {
    setInvoiceLoading(true);
    const fromRow = pageIdx * pageSize;
    const toRow = fromRow + pageSize - 1;
    const { data, count, error } = await buildInvoiceQuery(true).range(fromRow, toRow);
    if (!error) {
      setInvoices((data as any) || []);
      setInvoiceTotal(count || 0);
    }
    setInvoiceLoading(false);
  }, [buildInvoiceQuery, pageIdx, pageSize]);

  const loadInvoiceMetrics = useCallback(async () => {
    const { data } = await (supabase.rpc as any)('get_qonto_invoice_metrics', {
      p_start: range === 'all' ? null : fromISO,
      p_end: range === 'all' ? null : toISOd,
      p_status: filterStatus === 'all' ? null : filterStatus,
      p_overdue: filterOverdue,
      p_client: filterClient === 'all' ? null : filterClient,
      p_search: cleanSearch || null,
    });
    setInvoiceMetrics(data || null);
  }, [range, fromISO, toISOd, filterStatus, filterOverdue, filterClient, cleanSearch]);

  useEffect(() => {
    Promise.all([loadInvoicePage(), loadInvoiceMetrics()]);
  }, [loadInvoicePage, loadInvoiceMetrics]);

  useEffect(() => {
    if (pageIdx > 0 && invoiceTotal > 0 && pageIdx * pageSize >= invoiceTotal) {
      setPageIdx(Math.max(0, Math.ceil(invoiceTotal / pageSize) - 1));
    }
  }, [invoiceTotal, pageIdx, pageSize]);

  const invSummary = useMemo(() => {
    return {
      openS: Number(invoiceMetrics?.open_amount || 0),
      overS: Number(invoiceMetrics?.overdue_amount || 0),
      paidS: Number(invoiceMetrics?.paid_amount || 0),
      totalS: Number(invoiceMetrics?.total_amount || 0),
      count: Number(invoiceMetrics?.filtered_count ?? invoiceTotal),
    };
  }, [invoiceMetrics, invoiceTotal]);

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

  if (loading) return (
    <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
    </div><Skeleton className="h-64" /></div>
  );

  const hasQontoData = accounts.length > 0 || dbInvoiceTotal > 0 || invoices.length > 0;
  const top3Share = topCustomers.length > 0 && (inv.paid_sum || 0) > 0
    ? topCustomers.slice(0, 3).reduce((s, c) => s + Number(c.total_paid), 0) / (inv.paid_sum || 1)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Finanzen</h1>
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

      <Tabs value={currentTab} onValueChange={v => navigate(v === 'uebersicht' ? '/finanzen' : `/finanzen/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
          <TabsTrigger value="werbebudgets">Werbebudgets</TabsTrigger>
        </TabsList>

        {/* ============ ÜBERSICHT ============ */}
        <TabsContent value="uebersicht" className="space-y-6 mt-4">

          {/* HERO KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi title="Kontostand gesamt" value={eur(totalBalance)} icon={Wallet} source="Qonto Konten"
              subtitle={mainAccount?.name ? `Haupt: ${mainAccount.name}` : undefined} />
            <Kpi title="Netto-Cashflow" value={eur(cf.net)} icon={cf.net >= 0 ? TrendingUp : TrendingDown} source="Qonto Bank"
              delta={cashflowDelta != null ? { pct: cashflowDelta } : undefined}
              subtitle={`Zeitraum · ${num(cf.inflow_count)} ein / ${num(cf.outflow_count)} aus`} />
            <Kpi title="Cash Collected" value={eur(inv.paid_sum)} icon={CheckCircle2} source="Qonto Rechnungen"
              subtitle={`${num(inv.paid_count)} bezahlte Rechnungen`}
              delta={revenueDelta != null ? { pct: revenueDelta } : undefined} />
            <Kpi title="Offene Forderungen" value={eur(recv.open_sum)} icon={Receipt} source="Qonto Rechnungen"
              subtitle={`${num(recv.open_n)} offen`} />
            <Kpi title="Überfällig" value={eur(recv.overdue_sum)} icon={AlertTriangle} source="Qonto Rechnungen"
              subtitle={`${num(recv.overdue_n)} Rechnungen · ${pct(overdueRate)}`} />
            <Kpi title="Cash-Ergebnis" value={eur(cf.net)} icon={PiggyBank} source="Qonto Bank"
              subtitle="Einnahmen − Ausgaben"
              warn="Cash-basiertes Ergebnis, keine Buchhaltungs-/Steuergröße." />
          </div>

          {/* A. LIQUIDITÄT */}
          <div>
            <SectionTitle title="A · Liquidität" subtitle="Qonto Konten" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-1">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Gesamt-Guthaben</p>
                  <p className="text-3xl font-semibold tabular-nums mt-1">{eur(totalBalance)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{accounts.length} Konten</p>
                  <div className="mt-4 space-y-2 border-t pt-3">
                    {netLiquidity != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Netto-Liquidität (ohne Rücklagen)</span>
                        <span className="font-medium tabular-nums">{eur(netLiquidity)}</span>
                      </div>
                    )}
                    {reserveShare != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Rücklagen-Anteil</span>
                        <span className="font-medium">{pct(reserveShare)}</span>
                      </div>
                    )}
                    {adsAcc && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Werbebudget-Konto</span>
                        <span className="font-medium tabular-nums">{eur(adsAcc.balance)}</span>
                      </div>
                    )}
                    {taxAcc && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Umsatzsteuer-Konto</span>
                        <span className="font-medium tabular-nums">{eur(taxAcc.balance)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">Konten</p>
                  <div className="divide-y">
                    {accounts.map(a => (
                      <TooltipProvider key={a.id}>
                        <div className="flex items-center justify-between py-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <Landmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate font-medium">{a.name || 'Konto'}</span>
                            {a.is_main && <Badge variant="secondary" className="text-[9px] h-4">HAUPT</Badge>}
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-muted-foreground font-mono truncate">
                                  {a.iban ? '…' + a.iban.slice(-6) : ''}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="font-mono text-xs">{a.iban}</TooltipContent>
                            </UiTooltip>
                          </div>
                          <span className={`tabular-nums font-medium ${Number(a.balance) < 100 ? 'text-amber-600' : ''}`}>
                            {eur2(a.balance)}
                          </span>
                        </div>
                      </TooltipProvider>
                    ))}
                    {accounts.length === 0 && <p className="text-xs text-muted-foreground py-3">Keine Konten synchronisiert.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
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
                <p className="text-[11px] text-muted-foreground mt-0.5">
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
              <div className="grid grid-cols-4 gap-3 mt-3 text-[11px]">
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
              <Kpi title="Bezahlt (Rechnungen)" value={eur(inv.paid_sum)} source="Qonto Rechnungen" subtitle={`${num(inv.paid_count)} Stück`} />
              <Kpi title="Bank-Eingänge" value={eur(cf.inflow)} source="Qonto Bank" subtitle="Vergleichsbasis" />
              <Kpi title="Δ Bank − Rechnungen" value={eur(deltaBank)} source="Qonto"
                warn="Differenz zwischen Bankeingängen und bezahlten Rechnungen kann auf nicht-Rechnungsumsatz oder fehlende Zuordnung hindeuten." />
              <Kpi title="Collection Rate" value={pct(collectionRate)} source="Qonto Rechnungen"
                subtitle="bezahlt ÷ ausgestellt"
                reliability={inv.issued_sum ? 'reliable' : 'na'} />
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
                    <div className="grid grid-cols-5 gap-1 mt-2 text-[10px] text-center">
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
                  <span className="text-[11px] text-muted-foreground">Top-3-Anteil: <strong>{pct(top3Share)}</strong></span>
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
                          <p className="text-muted-foreground text-[10px]">{label}</p>
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
                                {s.mode && <Badge variant="outline" className="text-[10px] py-0 h-4">{s.mode}</Badge>}
                                {s.triggered_by && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                                    {s.triggered_by === 'cron' ? 'automatisch' : 'manuell'}
                                  </Badge>
                                )}
                                {isDone && <span className="text-[10px] text-emerald-700">✓ vollständig</span>}
                                {isRunning && <span className="text-[10px] text-amber-700">läuft…</span>}
                                {s.completed === false && !isRunning && s.last_error && <span className="text-[10px] text-destructive">✗ unvollständig</span>}
                              </div>
                              <span className="text-muted-foreground">
                                {s.last_success_at ? new Date(s.last_success_at).toLocaleString('de-DE') : '—'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-muted-foreground pl-4">
                              {s.pages_loaded != null && <span>Seiten: <strong className="text-foreground tabular-nums">{s.pages_loaded}{s.total_pages ? ` / ${s.total_pages}` : ''}</strong></span>}
                              {s.fetched_count != null && <span>Datensätze: <strong className="text-foreground tabular-nums">{num(s.fetched_count)}</strong></span>}
                            </div>
                            {s.last_error && (
                              <p className="text-[10px] text-destructive mt-1 pl-4 break-all">✗ {s.last_error.slice(0, 200)}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        {/* ============ RECHNUNGEN ============ */}
        <TabsContent value="rechnungen" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi title="Offen" value={eur(invSummary.openS)} source="Qonto Rechnungen" />
            <Kpi title="Überfällig" value={eur(invSummary.overS)} source="Qonto Rechnungen" />
            <Kpi title="Bezahlt (Filter)" value={eur(invSummary.paidS)} source="Qonto Rechnungen" />
            <Kpi title="Summe gefiltert" value={eur(invSummary.totalS)} source="Qonto Rechnungen" subtitle={`${num(invSummary.count)} Einträge`} />
          </div>

          {invoiceSyncIncomplete && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Qonto-Rechnungssync wirkt unvollständig. Starte als Admin einen vollständigen Backfill; die Tabelle zeigt nur Daten, die bereits in der Datenbank gespeichert sind.
                </span>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Kunde oder Nr. suchen" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="paid">Bezahlt</SelectItem>
                <SelectItem value="unpaid">Offen</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
                <SelectItem value="canceled">Storniert</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Kunde" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {clientList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                <TableHead className="text-right">Überfällig (T)</TableHead>
                <TableHead>Zuletzt aktual.</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {!invoiceLoading && invoices.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Keine Rechnungen gefunden</TableCell></TableRow>
                )}
                {invoiceLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Lade Rechnungen…</TableCell></TableRow>
                )}
                {invoices.map(i => {
                  const overdueDays = i.status === 'unpaid' && i.due_date && new Date(i.due_date) < today
                    ? Math.floor((today.getTime() - new Date(i.due_date).getTime()) / 86400000)
                    : null;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.number || '–'}</TableCell>
                      <TableCell className="text-muted-foreground">{i.client_name || '–'}</TableCell>
                      <TableCell>{statusBadge(i)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{eur2(i.total_amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{i.issue_date || '–'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{i.due_date || '–'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{i.paid_at || '–'}</TableCell>
                      <TableCell className="text-right text-xs">
                        {overdueDays != null ? <span className="text-red-600 font-medium">{overdueDays}</span> : '–'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {i.updated_at_qonto ? new Date(i.updated_at_qonto).toLocaleDateString('de-DE') : '–'}
                      </TableCell>
                      <TableCell>
                        {i.invoice_url && (
                          <a href={i.invoice_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* Pagination footer — nur Tabellen-Pagination. KPIs oben nutzen alle gefilterten Rechnungen laut DB-Count/RPC. */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
            <div className="text-muted-foreground">
              {invoiceTotal === 0
                ? '0 Rechnungen'
                : `${pageIdx * pageSize + 1}–${Math.min(invoiceTotal, (pageIdx + 1) * pageSize)} von ${invoiceTotal}`}
              {' · KPIs oben basieren auf allen '}<strong>{num(invSummary.count)}</strong>{' gefilterten Rechnungen'}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Pro Seite:</span>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={pageIdx === 0} onClick={() => setPageIdx(p => Math.max(0, p - 1))}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="tabular-nums">
                {pageIdx + 1} / {Math.max(1, Math.ceil(invoiceTotal / pageSize))}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={(pageIdx + 1) * pageSize >= invoiceTotal}
                onClick={() => setPageIdx(p => p + 1)}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {isAdmin && (
            <div className="px-4 py-3 border-t text-[11px] text-muted-foreground grid grid-cols-2 md:grid-cols-5 gap-2">
              <span>DB gesamt: <strong className="text-foreground tabular-nums">{num(dbInvoiceTotal)}</strong></span>
              <span>Gefiltert laut Count: <strong className="text-foreground tabular-nums">{num(invoiceTotal)}</strong></span>
              <span>Geladene Zeilen: <strong className="text-foreground tabular-nums">{num(invoices.length)}</strong></span>
              <span>Page Size: <strong className="text-foreground tabular-nums">{pageSize}</strong></span>
              <span>Seite: <strong className="text-foreground tabular-nums">{pageIdx + 1}</strong></span>
            </div>
          )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="werbebudgets" className="space-y-4 mt-4">
          <Werbebudgets />
        </TabsContent>
      </Tabs>
    </div>
  );
}
