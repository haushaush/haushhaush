import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, AlertTriangle, ExternalLink, Info, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { formatCurrency, accountStatusBadge } from '@/components/meta/metaUtils';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import MetaDiagnosticPanel from '@/components/meta/MetaDiagnosticPanel';

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

type Invoice = {
  id: string;
  meta_invoice_id: string;
  meta_business_id: string | null;
  meta_account_id: string | null;
  account_name: string | null;
  billing_period: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  status_mapped: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  document_url: string | null;
  entity: string | null;
  synced_at: string;
};

type Preset =
  | 'today' | 'last_7d' | 'last_30d' | 'this_month' | 'last_month'
  | 'this_year' | 'last_12m' | 'maximum' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'last_7d', label: 'Letzte 7 Tage' },
  { value: 'last_30d', label: 'Letzte 30 Tage' },
  { value: 'this_month', label: 'Dieser Monat' },
  { value: 'last_month', label: 'Letzter Monat' },
  { value: 'this_year', label: 'Dieses Jahr' },
  { value: 'last_12m', label: 'Letzte 12 Monate' },
  { value: 'maximum', label: 'Insgesamt' },
  { value: 'custom', label: 'Benutzerdefiniert' },
];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function rangeFor(p: Preset, custom?: { from: string; to: string }): { since?: string; until?: string; maximum?: boolean } {
  const today = new Date();
  const t = ymd(today);
  const d = (n: number) => { const x = new Date(today); x.setDate(x.getDate() + n); return ymd(x); };
  const firstOfMonth = (offset = 0) => ymd(new Date(today.getFullYear(), today.getMonth() + offset, 1));
  const lastOfMonth = (offset = 0) => ymd(new Date(today.getFullYear(), today.getMonth() + offset + 1, 0));
  switch (p) {
    case 'today': return { since: t, until: t };
    case 'last_7d': return { since: d(-6), until: t };
    case 'last_30d': return { since: d(-29), until: t };
    case 'this_month': return { since: firstOfMonth(0), until: t };
    case 'last_month': return { since: firstOfMonth(-1), until: lastOfMonth(-1) };
    case 'this_year': return { since: `${today.getFullYear()}-01-01`, until: t };
    case 'last_12m': { const x = new Date(today); x.setMonth(x.getMonth() - 11); x.setDate(1); return { since: ymd(x), until: t }; }
    case 'maximum': return { maximum: true };
    case 'custom': return { since: custom?.from || d(-29), until: custom?.to || t };
  }
}

type DiagState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; invoicesSupported: boolean; token: boolean }
  | { status: 'error'; message: string };

const STATUS_LABEL: Record<string, string> = {
  paid: 'Bezahlt',
  open: 'Offen',
  failed: 'Fehlgeschlagen',
  pending: 'Ausstehend',
  canceled: 'Storniert',
  unknown: 'Unbekannt',
};

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  open: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  failed: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  pending: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  canceled: 'bg-muted text-muted-foreground border-border',
  unknown: 'bg-muted text-muted-foreground border-border',
};

function statusLabel(s: string | null | undefined) {
  const k = String(s ?? 'unknown').toLowerCase();
  return STATUS_LABEL[k] ?? s ?? '–';
}
function statusStyle(s: string | null | undefined) {
  const k = String(s ?? 'unknown').toLowerCase();
  return STATUS_STYLE[k] ?? STATUS_STYLE.unknown;
}

export default function MetaAbrechnungen() {
  const { callMeta } = useMetaAds();
  const { hasPermission, isAdmin } = usePermissions();
  const canManage = isAdmin || hasPermission('meta.billing.manage');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'rechnungen' || tabParam === 'zahlungen' ? tabParam : 'uebersicht';
  const setActiveTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'uebersicht') next.delete('tab'); else next.set('tab', v);
    setSearchParams(next, { replace: true });
  };
  const [backfilling, setBackfilling] = useState(false);


  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preset, setPreset] = useState<Preset>('last_30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [insights, setInsights] = useState<Record<string, any[]>>({});
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [diag, setDiag] = useState<DiagState>({ status: 'idle' });

  // Invoice tab filters
  const [invStatus, setInvStatus] = useState<string>('all');
  const [invAccount, setInvAccount] = useState<string>('all');
  const [invMin, setInvMin] = useState('');
  const [invMax, setInvMax] = useState('');
  const [invSearch, setInvSearch] = useState('');
  const [invRange, setInvRange] = useState<Preset>('maximum');
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState<25 | 50 | 100>(25);

  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const invPeriod = useMemo(() => rangeFor(invRange, { from: customFrom, to: customTo }), [invRange, customFrom, customTo]);

  async function loadSnapshots() {
    const { data, error } = await supabase
      .from('meta_billing_account_snapshots')
      .select('*')
      .order('account_name', { ascending: true })
      .limit(2000);
    if (error) toast.error('Konnte Snapshots nicht laden: ' + error.message);
    setSnapshots((data as any) || []);
  }

  async function loadInvoices() {
    const { data, error } = await (supabase as any)
      .from('meta_billing_invoices')
      .select('*')
      .order('invoice_date', { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) {
      // Silently ignore for non-admins / not-yet-populated
      setInvoices([]);
      return;
    }
    setInvoices((data as any) || []);
  }

  const runDiagnostic = useCallback(async () => {
    setDiag({ status: 'loading' });
    try {
      const { data, error } = await supabase.functions.invoke('debug-meta-billing', { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDiag({
        status: 'ready',
        invoicesSupported: !!data?.tests?.invoices?.supported,
        token: !!data?.tests?.token?.valid,
      });
    } catch (e) {
      setDiag({ status: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadSnapshots(), loadInvoices()]);
      setLoading(false);
    })();
    runDiagnostic();
  }, [runDiagnostic]);

  useEffect(() => {
    if (!loading && snapshots.length === 0 && canManage && !syncing) handleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-meta-billing', { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const invPart = data.invoices_endpoint === 'ok' || data.invoices_endpoint === 'ok_fallback'
        ? `, ${data.invoices_upserted}/${data.invoices_fetched} Rechnungen`
        : (data.invoices_endpoint ? `, Rechnungen: ${data.invoices_endpoint}` : '');
      toast.success(
        `Sync fertig: ${data.accounts_checked} Konten geprüft, ${data.accounts_updated} aktualisiert${invPart}` +
        (data.errors?.length ? ` (${data.errors.length} Fehler)` : '')
      );
      await Promise.all([loadSnapshots(), loadInvoices()]);
      runDiagnostic();
    } catch (e) {
      toast.error('Sync fehlgeschlagen: ' + (e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleBackfill() {
    if (!confirm('Historischen Backfill starten? Es werden bis zu 60 Monate an Business-Rechnungen von Meta geladen. Das kann einige Minuten dauern.')) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-meta-billing', { body: { months: 60, backfill: true } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const invPart = data.invoices_endpoint === 'ok' || data.invoices_endpoint === 'ok_fallback'
        ? `${data.invoices_upserted}/${data.invoices_fetched} Rechnungen`
        : `Rechnungen: ${data.invoices_endpoint}`;
      toast.success(`Backfill fertig (${data.months_back} Monate): ${invPart}`);
      await loadInvoices();
      runDiagnostic();
    } catch (e) {
      toast.error('Backfill fehlgeschlagen: ' + (e as Error).message);
    } finally {
      setBackfilling(false);
    }
  }


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

  // Insights loader
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (filteredAccounts.length === 0) { setInsights({}); return; }
      setLoadingInsights(true);
      const results: Record<string, any[]> = {};
      const list = filteredAccounts.slice(0, 60);
      for (const acc of list) {
        try {
          const params: Record<string, any> = {
            fields: 'spend,impressions,clicks,account_currency',
            time_increment: 'monthly',
            level: 'account',
          };
          if (range.maximum) {
            params.date_preset = 'maximum';
          } else if (range.since && range.until) {
            params.time_range = JSON.stringify({ since: range.since, until: range.until });
          }
          const res: any = await callMeta(`/${acc.meta_account_id}/insights`, params);
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
  }, [filteredAccounts, range.since, range.until, range.maximum, callMeta]);

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
    const m: Record<string, number> = {};
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    for (const acc of filteredAccounts) {
      const rows = insights[acc.meta_account_id] || [];
      for (const r of rows) {
        if ((r.date_start || '').slice(0, 7) === key) {
          const cur = acc.currency || 'EUR';
          m[cur] = (m[cur] || 0) + (parseFloat(r.spend || '0') || 0);
        }
      }
    }
    return m;
  }, [filteredAccounts, insights]);

  const availableHistory = useMemo(() => {
    let min: string | null = null; let max: string | null = null;
    for (const acc of filteredAccounts) {
      for (const r of insights[acc.meta_account_id] || []) {
        const d = r.date_start;
        if (!d) continue;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    }
    return { min, max };
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

  const balanceByCurrency = useMemo(() => {
    const m: Record<string, number> = {};
    for (const acc of filteredAccounts) {
      if (acc.balance == null) continue;
      const cur = acc.currency || 'EUR';
      m[cur] = (m[cur] || 0) + (acc.balance / 100);
    }
    return m;
  }, [filteredAccounts]);

  // Per-account invoice aggregates (from real business invoice records).
  type AcctAgg = {
    openAmount: number;
    failedAmount: number;
    unsettledAmount: number; // open + failed + pending
    paidAmount: number;
    openCount: number;
    failedCount: number;
    pendingCount: number;
    paidCount: number;
    currencies: Set<string>;
  };
  const invoicesByAccount = useMemo(() => {
    const map = new Map<string, AcctAgg>();
    const push = (key: string) => {
      if (!map.has(key)) map.set(key, {
        openAmount: 0, failedAmount: 0, unsettledAmount: 0, paidAmount: 0,
        openCount: 0, failedCount: 0, pendingCount: 0, paidCount: 0,
        currencies: new Set(),
      });
      return map.get(key)!;
    };
    for (const inv of invoices) {
      const key = inv.meta_account_id || '__unassigned__';
      const agg = push(key);
      if (inv.currency) agg.currencies.add(inv.currency);
      const amt = inv.amount ?? 0;
      switch ((inv.status_mapped || '').toLowerCase()) {
        case 'paid':
          agg.paidAmount += amt; agg.paidCount++; break;
        case 'open':
          agg.openAmount += amt; agg.openCount++; agg.unsettledAmount += amt; break;
        case 'failed':
          agg.failedAmount += amt; agg.failedCount++; agg.unsettledAmount += amt; break;
        case 'pending':
          agg.pendingCount++; agg.unsettledAmount += amt; break;
      }
    }
    return map;
  }, [invoices]);

  const activeCount = filteredAccounts.filter((a) => a.account_status === '1').length;
  const unsupportedCount = filteredAccounts.filter((a) => a.amount_spent == null && a.balance == null).length;
  const warnCount = filteredAccounts.filter((a) => {
    if (!a.spend_cap || !a.amount_spent) return false;
    return a.amount_spent / a.spend_cap >= 0.9;
  }).length;

  const chartData = useMemo(() => {
    const buckets: Record<string, any> = {};
    for (const acc of filteredAccounts) {
      for (const r of insights[acc.meta_account_id] || []) {
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

  function fmtInvoiceMoney(amount: number, currencies: Set<string>) {
    if (amount === 0) return '–';
    if (currencies.size === 1) return formatCurrency(amount, Array.from(currencies)[0]);
    if (currencies.size === 0) return formatCurrency(amount, 'EUR');
    // Mixed currencies — do not add up ambiguously.
    return `${amount.toFixed(2)} (gemischt)`;
  }

  // Global invoice KPIs (per currency, from real records).
  const invoiceKpis = useMemo(() => {
    const groupByCur = (pred: (i: Invoice) => boolean) => {
      const m: Record<string, { count: number; sum: number }> = {};
      for (const i of invoices) {
        if (!pred(i)) continue;
        const cur = i.currency || 'EUR';
        m[cur] = m[cur] || { count: 0, sum: 0 };
        m[cur].count += 1;
        m[cur].sum += i.amount ?? 0;
      }
      return m;
    };
    const total = groupByCur(() => true);
    const open = groupByCur((i) => i.status_mapped === 'open');
    const failed = groupByCur((i) => i.status_mapped === 'failed');
    const paid = groupByCur((i) => i.status_mapped === 'paid');
    const pending = groupByCur((i) => i.status_mapped === 'pending');
    const asSum = (m: Record<string, { sum: number }>) => Object.fromEntries(Object.entries(m).map(([c, v]) => [c, v.sum]));
    const asCount = (m: Record<string, { count: number }>) => Object.values(m).reduce((a, b) => a + b.count, 0);
    return {
      totalCount: asCount(total), totalSum: asSum(total),
      openCount: asCount(open), openSum: asSum(open),
      failedCount: asCount(failed), failedSum: asSum(failed),
      paidCount: asCount(paid), paidSum: asSum(paid),
      pendingCount: asCount(pending), pendingSum: asSum(pending),
    };
  }, [invoices]);

  const invoicesSupported = diag.status === 'ready' && diag.invoicesSupported;
  const hasInvoices = invoices.length > 0;

  const rangeLabel = range.maximum
    ? 'Insgesamt (max. verfügbare Historie)'
    : `${range.since} → ${range.until}`;

  // Invoice tab filtered rows
  const invoicesFiltered = useMemo(() => {
    return invoices.filter((i) => {
      if (invStatus !== 'all' && (i.status_mapped || 'unknown') !== invStatus) return false;
      if (invAccount !== 'all') {
        if (invAccount === '__unassigned__') { if (i.meta_account_id) return false; }
        else if (i.meta_account_id !== invAccount) return false;
      }
      if (invMin && (i.amount ?? -Infinity) < Number(invMin)) return false;
      if (invMax && (i.amount ?? Infinity) > Number(invMax)) return false;
      if (invSearch) {
        const q = invSearch.toLowerCase();
        const hit = [i.meta_invoice_id, i.account_name, i.entity, i.payment_reference, i.billing_period]
          .some((v) => (v || '').toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (!invPeriod.maximum && invPeriod.since && invPeriod.until && i.invoice_date) {
        if (i.invoice_date < invPeriod.since || i.invoice_date > invPeriod.until) return false;
      }
      return true;
    });
  }, [invoices, invStatus, invAccount, invMin, invMax, invSearch, invPeriod]);

  const invoicesPageCount = Math.max(1, Math.ceil(invoicesFiltered.length / invPageSize));
  const invoicesPage = invoicesFiltered.slice((invPage - 1) * invPageSize, invPage * invPageSize);
  useEffect(() => { setInvPage(1); }, [invStatus, invAccount, invMin, invMax, invSearch, invRange]);

  return (
    <TooltipProvider>
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Abrechnungen & Zahlungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Werbekontenübergreifende Übersicht — Werbeausgaben (Meta Insights), Abrechnungskonto-Daten (Meta Ad Accounts) und echte Rechnungen aus <code className="text-xs">/business_invoices</code>.
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
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span>
            Zeitraum: <strong>{rangeLabel}</strong>
            {range.maximum && availableHistory.min && availableHistory.max && (
              <> · Verfügbare Daten: {availableHistory.min} bis {availableHistory.max}</>
            )}
          </span>
        </div>
      </Card>

      {/* Werbeausgaben KPIs */}
      <section>
        <SectionHeader title="Werbeausgaben" source="Meta Insights" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Gesamtausgaben (Zeitraum)" value={fmtMulti(spendByCurrency)} source="Meta Insights" />
          <KpiCard label="Ausgaben dieser Monat" value={fmtMulti(spendThisMonth)} source="Meta Insights" />
          <KpiCard label="Zugängliche Werbekonten" value={String(filteredAccounts.length)} source="Meta Ad Accounts" />
          <KpiCard label="Aktive Werbekonten" value={String(activeCount)} source="Meta Ad Accounts" />
        </div>
      </section>

      {/* Abrechnungskonto KPIs */}
      <section>
        <SectionHeader title="Abrechnungskonto" source="Meta Ad Accounts" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Saldo (gesamt)" value={fmtMulti(balanceByCurrency)} source="Meta Ad Accounts" />
          <KpiCard label="Summe Spend Caps" value={fmtMulti(capsByCurrency)} source="Meta Ad Accounts" />
          <KpiCard label="Konten mit Warnungen" value={String(warnCount)} source="Berechnet" />
          <KpiCard label="Ohne Abrechnungsdaten" value={String(unsupportedCount)} source="Meta Ad Accounts" />
        </div>
      </section>

      {/* Rechnungen KPIs — from real business_invoices */}
      <section>
        <SectionHeader
          title="Rechnungen"
          source={hasInvoices ? 'Meta Business Invoices' : (invoicesSupported ? 'Meta Business Invoices · Sync ausstehend' : 'Nicht über Meta API verfügbar')}
          unavailable={!invoicesSupported && !hasInvoices}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Abrechnungen gesamt" value={hasInvoices ? String(invoiceKpis.totalCount) : (invoicesSupported ? '–' : 'n/a')} source="Business Invoices" />
          <KpiCard label="Gesamtbetrag" value={hasInvoices ? fmtMulti(invoiceKpis.totalSum) : '–'} source="Business Invoices" />
          <KpiCard label="Offene Abrechnungen" value={hasInvoices ? String(invoiceKpis.openCount) : '–'} source="Business Invoices" />
          <KpiCard label="Offener Betrag" value={hasInvoices ? fmtMulti(invoiceKpis.openSum) : '–'} source="Business Invoices" />
          <KpiCard label="Fehlgeschlagene Abrechnungen" value={hasInvoices ? String(invoiceKpis.failedCount) : '–'} source="Business Invoices" />
          <KpiCard label="Fehlgeschlagener Betrag" value={hasInvoices ? fmtMulti(invoiceKpis.failedSum) : '–'} source="Business Invoices" />
          <KpiCard label="Bezahlte Abrechnungen" value={hasInvoices ? String(invoiceKpis.paidCount) : '–'} source="Business Invoices" />
          <KpiCard label="Bezahlter Betrag" value={hasInvoices ? fmtMulti(invoiceKpis.paidSum) : '–'} source="Business Invoices" />
        </div>
      </section>

      {/* Chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Werbeausgaben — Monatsentwicklung</h2>
            <p className="text-xs text-muted-foreground">Quelle: Meta Insights · {rangeLabel}</p>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Abrechnungsstatus je Werbekonto</h2>
          <span className="text-xs text-muted-foreground">Saldo aus Ad Account · Beträge aus Business Invoices</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Werbekonto</TableHead>
                <TableHead>Account-ID</TableHead>
                <TableHead>Währung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Offener Betrag</TableHead>
                <TableHead className="text-right">Fehlgeschlagen</TableHead>
                <TableHead className="text-right">Unsettled ges.</TableHead>
                <TableHead className="text-center">Offen · Fehler</TableHead>
                <TableHead className="text-right">Spend Cap</TableHead>
                <TableHead>Zahlungsmethode</TableHead>
                <TableHead>Warnungen</TableHead>
                <TableHead>Letzter Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">Lade…</TableCell></TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">Keine Werbekonten. Klicke „Meta-Abrechnungen aktualisieren" oben rechts.</TableCell></TableRow>
              ) : filteredAccounts.map((a) => {
                const cur = a.currency || 'EUR';
                const badge = accountStatusBadge(Number(a.account_status));
                const spent = a.amount_spent != null ? a.amount_spent / 100 : null;
                const cap = a.spend_cap != null ? a.spend_cap / 100 : null;
                const agg = invoicesByAccount.get(a.meta_account_id);
                const warn: string[] = [];
                if (cap != null && spent != null && spent / cap >= 0.9) warn.push('Limit fast erreicht');
                if (a.amount_spent == null && a.balance == null) warn.push('Keine Abrechnungsdaten');
                if (a.account_status && a.account_status !== '1') warn.push(badge.label);
                if (agg && agg.failedCount > 0) warn.push(`${agg.failedCount} fehlgeschlagene Abrechnung${agg.failedCount === 1 ? '' : 'en'}`);
                if (agg && agg.openCount > 0) warn.push(`${agg.openCount} offene Abrechnung${agg.openCount === 1 ? '' : 'en'}`);
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
                    <TableCell className="text-right font-mono">{agg && agg.openAmount > 0 ? fmtInvoiceMoney(agg.openAmount, agg.currencies) : '–'}</TableCell>
                    <TableCell className="text-right font-mono text-rose-600">{agg && agg.failedAmount > 0 ? fmtInvoiceMoney(agg.failedAmount, agg.currencies) : '–'}</TableCell>
                    <TableCell className="text-right font-mono">{agg && agg.unsettledAmount > 0 ? fmtInvoiceMoney(agg.unsettledAmount, agg.currencies) : '–'}</TableCell>
                    <TableCell className="text-center text-xs">
                      {agg ? `${agg.openCount} · ${agg.failedCount}` : '–'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{cap != null ? formatCurrency(cap, cur) : '–'}</TableCell>
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

      {/* Invoices Tab */}
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Rechnungen ({invoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Zahlungen</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          {!invoicesSupported && !hasInvoices ? (
            <UnavailableCard kind="invoices" diagLoading={diag.status === 'loading'} />
          ) : !hasInvoices ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Business-Invoices-Endpunkt verfügbar, aber noch keine Datensätze synchronisiert.
              {canManage && <div className="mt-3"><Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>Jetzt synchronisieren</Button></div>}
            </Card>
          ) : (
            <Card className="p-4 space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <Select value={invStatus} onValueChange={setInvStatus}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="open">Offen / Unsettled</SelectItem>
                    <SelectItem value="paid">Bezahlt</SelectItem>
                    <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                    <SelectItem value="pending">Ausstehend</SelectItem>
                    <SelectItem value="canceled">Storniert</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={invAccount} onValueChange={setInvAccount}>
                  <SelectTrigger><SelectValue placeholder="Werbekonto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Werbekonten</SelectItem>
                    <SelectItem value="__unassigned__">Nicht zugeordnet</SelectItem>
                    {snapshots.map((s) => (
                      <SelectItem key={s.meta_account_id} value={s.meta_account_id}>
                        {s.account_name || s.meta_account_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={invRange} onValueChange={(v) => setInvRange(v as Preset)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Mindestbetrag" value={invMin} onChange={(e) => setInvMin(e.target.value)} />
                <Input type="number" placeholder="Maximalbetrag" value={invMax} onChange={(e) => setInvMax(e.target.value)} />
                <Input placeholder="ID / Konto / Referenz" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Abrechnungs-ID</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Werbekonto</TableHead>
                      <TableHead>Account-ID</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead>Währung</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Zahlungsmethode</TableHead>
                      <TableHead>Referenz</TableHead>
                      <TableHead>Letzter Sync</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesPage.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Keine Rechnungen entsprechen den Filtern.</TableCell></TableRow>
                    ) : invoicesPage.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.meta_invoice_id}</TableCell>
                        <TableCell className="text-xs">{i.invoice_date || '–'}{i.due_date && <div className="text-muted-foreground">fällig: {i.due_date}</div>}</TableCell>
                        <TableCell>{i.account_name || (i.meta_account_id ? '–' : <span className="text-muted-foreground italic">Nicht zugeordnet</span>)}</TableCell>
                        <TableCell className="font-mono text-xs">{i.meta_account_id || '–'}</TableCell>
                        <TableCell className="text-right font-mono">{i.amount != null ? formatCurrency(i.amount, i.currency || 'EUR') : '–'}</TableCell>
                        <TableCell className="text-xs">{i.currency || '–'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusStyle(i.status_mapped)}>{statusLabel(i.status_mapped)}</Badge>
                          {i.status && String(i.status).toLowerCase() !== String(i.status_mapped).toLowerCase() && (
                            <div className="text-[10px] text-muted-foreground mt-1">Meta: {i.status}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{i.payment_method || '–'}</TableCell>
                        <TableCell className="text-xs">{i.payment_reference || '–'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(i.synced_at).toLocaleString('de-DE')}</TableCell>
                        <TableCell>
                          {i.document_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={i.document_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Pro Seite:</span>
                  <Select value={String(invPageSize)} onValueChange={(v) => { setInvPageSize(Number(v) as 25 | 50 | 100); setInvPage(1); }}>
                    <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span>Seite {invPage} von {invoicesPageCount} · {invoicesFiltered.length} Einträge</span>
                  <Button variant="outline" size="sm" className="h-7" disabled={invPage <= 1} onClick={() => setInvPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-3 w-3" /></Button>
                  <Button variant="outline" size="sm" className="h-7" disabled={invPage >= invoicesPageCount} onClick={() => setInvPage((p) => Math.min(invoicesPageCount, p + 1))}><ChevronRight className="h-3 w-3" /></Button>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments">
          <UnavailableCard kind="payments" diagLoading={diag.status === 'loading'} />
        </TabsContent>
      </Tabs>

      {/* Admin: Data quality summary */}
      {isAdmin && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Datenqualität — Business Invoices</h2>
          <DataQualityGrid invoices={invoices} />
        </Card>
      )}

      {isAdmin && <MetaDiagnosticPanel />}
    </div>
    </TooltipProvider>
  );
}

function SectionHeader({ title, source, unavailable }: { title: string; source: string; unavailable?: boolean }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <span className={`text-[11px] ${unavailable ? 'text-amber-600' : 'text-muted-foreground'}`}>{source}</span>
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

function UnavailableCard({ kind, diagLoading }: { kind: 'invoices' | 'payments'; diagLoading: boolean }) {
  const heading = kind === 'invoices'
    ? 'Keine einzelnen Rechnungsdatensätze über die Meta API'
    : 'Keine einzelnen Zahlungsvorgänge über die Meta API';
  const body = kind === 'invoices'
    ? 'Der aktuell verbundene Meta-Zugriff liefert keine Business-Invoice-Datensätze für dieses Business oder es fehlt eine Berechtigung. Rechnungen findest du im Meta-Abrechnungsbereich. Werbeausgaben werden hier nicht als Rechnungen dargestellt.'
    : 'Einzelne Zahlungsvorgänge werden über die aktuell verfügbare Meta Graph API nicht bereitgestellt. Werbeausgaben werden hier nicht als Zahlungen dargestellt.';
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center text-center gap-3 py-6">
        <Info className="h-8 w-8 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">{diagLoading ? 'Prüfe Verfügbarkeit…' : heading}</h3>
          {!diagLoading && <p className="text-sm text-muted-foreground max-w-xl mt-1">{body}</p>}
        </div>
        {!diagLoading && kind === 'invoices' && (
          <Button variant="outline" asChild>
            <a href="https://business.facebook.com/billing_hub/payment_activity" target="_blank" rel="noopener noreferrer">
              Meta-Abrechnungsbereich öffnen <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}

function DataQualityGrid({ invoices }: { invoices: Invoice[] }) {
  const total = invoices.length;
  const attributed = invoices.filter((i) => !!i.meta_account_id).length;
  const noAmount = invoices.filter((i) => i.amount == null).length;
  const noCurrency = invoices.filter((i) => !i.currency).length;
  const statusBuckets = invoices.reduce((m: Record<string, { c: number; sum: number }>, i) => {
    const k = i.status_mapped || 'unknown';
    m[k] = m[k] || { c: 0, sum: 0 };
    m[k].c++; m[k].sum += i.amount ?? 0;
    return m;
  }, {});
  const rawStatuses = Array.from(new Set(invoices.map((i) => i.status).filter(Boolean))) as string[];

  const items = [
    { label: 'Business-Invoices gesamt', value: String(total) },
    { label: 'Mit Account-Zuordnung', value: String(attributed) },
    { label: 'Ohne Account-Zuordnung', value: String(total - attributed) },
    { label: 'Ohne Betrag', value: String(noAmount) },
    { label: 'Ohne Währung', value: String(noCurrency) },
    { label: 'Original-Statuswerte', value: rawStatuses.join(', ') || '–' },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
        {items.map((it) => (
          <div key={it.label} className="p-2 rounded border">
            <div className="text-muted-foreground">{it.label}</div>
            <div className="font-mono font-medium">{it.value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
        {Object.entries(statusBuckets).map(([status, v]) => (
          <div key={status} className="p-2 rounded border">
            <div className="text-muted-foreground">{statusLabel(status)}</div>
            <div className="font-mono font-medium">{v.c} · {v.sum.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
