import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronDown, ChevronRight, ExternalLink, Mail, RefreshCw, Info, FileDown,
  ArrowUp, ArrowDown, ArrowUpDown, RotateCcw,
  Search, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';

import { formatCurrency } from '@/components/meta/metaUtils';
import GmailReceiptSearchDialog, { type GmailSearchCriteria } from '@/components/meta/GmailReceiptSearchDialog';
import { generatePaymentReceiptPdf, canGeneratePdf } from '@/components/meta/generatePaymentReceiptPdf';

export type PaymentReceipt = {
  id: string;
  account_name: string | null;
  meta_account_id: string | null;
  meta_account_id_numeric: string | null;
  transaction_id: string | null;
  transaction_date: string | null;
  amount: number | null;
  currency: string | null;
  payment_status: string | null;
  payment_status_label: string | null;
  period_start_raw: string | null;
  period_end_raw: string | null;
  billing_reason: string | null;
  product_type: string | null;
  payment_method: string | null;
  transaction_url: string | null;
  campaigns: Array<{
    name?: string;
    results?: number | string;
    result_type?: string;
    amount?: number | string;
    currency?: string;
  }> | null;
  campaign_count: number | null;
  gmail_id: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return '–';
  try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

type SortKey = 'transaction_date' | 'account_name' | 'amount' | 'payment_method' | 'payment_status' | 'campaign_count';
type SortDir = 'asc' | 'desc';

type SearchFilters = {
  transactionId: string;
  dateFrom: string;   // YYYY-MM-DD
  dateTo: string;     // YYYY-MM-DD
  amount: string;     // de format e.g. "46,00"
  metaAccountId: string;
  accountName: string;
};

const EMPTY_FILTERS: SearchFilters = {
  transactionId: '',
  dateFrom: '',
  dateTo: '',
  amount: '',
  metaAccountId: '',
  accountName: '',
};

function parseDeAmount(v: string): number | null {
  if (!v) return null;
  const n = parseFloat(v.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeMetaAccountNumeric(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(?:act_)?(\d+)$/i);
  return m ? m[1] : t.replace(/^act_/i, '');
}

function normalizeName(v: string | null | undefined): string {
  return (v || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasAnyFilter(f: SearchFilters): boolean {
  return !!(f.transactionId.trim() || f.dateFrom || f.dateTo || f.amount.trim() ||
            f.metaAccountId.trim() || f.accountName.trim());
}

export default function MetaPaymentsTab() {
  const [rows, setRows] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchDialogInitial, setSearchDialogInitial] = useState<{
    criteria?: GmailSearchCriteria; results?: any[];
  }>({});

  const [searchParams, setSearchParams] = useSearchParams();

  // ── Confirmed-search states ──────────────────────────────────────
  const initialFilters: SearchFilters = {
    transactionId: searchParams.get('txn') || '',
    dateFrom: searchParams.get('from') || '',
    dateTo: searchParams.get('to') || '',
    amount: searchParams.get('amount') || '',
    metaAccountId: searchParams.get('acct') || '',
    accountName: searchParams.get('name') || '',
  };
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(initialFilters);
  const [gmailSearching, setGmailSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [noResultsMsg, setNoResultsMsg] = useState<string | null>(null);
  const searchInFlightRef = useRef(false);


  const [sortKey, setSortKey] = useState<SortKey>('transaction_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('meta_payment_receipts')
      .select('*')
      .order('transaction_date', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (error) {
      toast.error('Konnte Zahlungen nicht laden: ' + error.message);
      setRows([]);
    } else {
      setRows((data as PaymentReceipt[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel('meta_payment_receipts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meta_payment_receipts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const accounts = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const key = r.meta_account_id || r.meta_account_id_numeric || '';
      if (!key) continue;
      if (!m.has(key)) m.set(key, r.account_name || key);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const currencies = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.currency) s.add(r.currency);
    return Array.from(s).sort();
  }, [rows]);

  const statuses = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const key = (r.payment_status || r.payment_status_label || '').trim();
      if (!key) continue;
      if (!m.has(key)) m.set(key, r.payment_status_label || key);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const paymentMethods = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.payment_method) s.add(r.payment_method);
    return Array.from(s).sort();
  }, [rows]);

  function matchesFilters(r: PaymentReceipt, f: SearchFilters): boolean {
    // Transaction ID (exact)
    if (f.transactionId.trim()) {
      if ((r.transaction_id || '').trim() !== f.transactionId.trim()) return false;
    }
    // Date range: compare against transaction_date, email_received_at, period_start_raw, period_end_raw
    if (f.dateFrom || f.dateTo) {
      const fromMs = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00').getTime() : null;
      const toMs = f.dateTo ? new Date(f.dateTo + 'T23:59:59.999').getTime() : (fromMs != null ? new Date(f.dateFrom + 'T23:59:59.999').getTime() : null);
      const candidates: (string | null)[] = [
        r.transaction_date, r.email_received_at, r.period_start_raw, r.period_end_raw,
      ];
      const hit = candidates.some((v) => {
        if (!v) return false;
        const t = new Date(v).getTime();
        if (!Number.isFinite(t)) return false;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        return true;
      });
      if (!hit) return false;
    }
    // Amount (± 0.01 tolerance)
    if (f.amount.trim()) {
      const target = parseDeAmount(f.amount);
      if (target == null) return false;
      if (r.amount == null || Math.abs(r.amount - target) >= 0.01) return false;
    }
    // Meta account id (accept both act_ / numeric)
    if (f.metaAccountId.trim()) {
      const numeric = normalizeMetaAccountNumeric(f.metaAccountId);
      const rowNumeric = r.meta_account_id_numeric ||
        (r.meta_account_id ? r.meta_account_id.replace(/^act_/i, '') : null);
      if (!numeric || rowNumeric !== numeric) return false;
    }
    // Account name (case-insensitive, space-normalized, substring)
    if (f.accountName.trim()) {
      const needle = normalizeName(f.accountName);
      const hay = normalizeName(r.account_name);
      if (!hay.includes(needle)) return false;
    }
    return true;
  }

  const filtered = useMemo(() => {
    if (!hasAnyFilter(appliedFilters)) return rows;
    return rows.filter((r) => matchesFilters(r, appliedFilters));
  }, [rows, appliedFilters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const get = (r: PaymentReceipt): any => {
        switch (sortKey) {
          case 'transaction_date': return r.transaction_date ? new Date(r.transaction_date).getTime() : 0;
          case 'account_name': return (r.account_name || '').toLowerCase();
          case 'amount': return r.amount ?? -Infinity;
          case 'payment_method': return (r.payment_method || '').toLowerCase();
          case 'payment_status': return (r.payment_status_label || r.payment_status || '').toLowerCase();
          case 'campaign_count': return r.campaign_count ?? (r.campaigns?.length ?? 0);
        }
      };
      const av = get(a); const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const kpis = useMemo(() => {
    const totalByCur: Record<string, number> = {};
    for (const r of filtered) {
      const cur = r.currency || 'EUR';
      totalByCur[cur] = (totalByCur[cur] || 0) + (r.amount || 0);
    }
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    const last30 = filtered.filter((r) => r.transaction_date && new Date(r.transaction_date).getTime() >= monthAgo);
    const last30Sum: Record<string, number> = {};
    for (const r of last30) {
      const cur = r.currency || 'EUR';
      last30Sum[cur] = (last30Sum[cur] || 0) + (r.amount || 0);
    }
    return { totalByCur, count: filtered.length, last30Count: last30.length, last30Sum };
  }, [filtered]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'transaction_date' || key === 'amount' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // URL sync (only for confirmed appliedFilters)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const set = (k: string, v: string) => { if (v) next.set(k, v); else next.delete(k); };
    set('txn', appliedFilters.transactionId);
    set('from', appliedFilters.dateFrom);
    set('to', appliedFilters.dateTo);
    set('amount', appliedFilters.amount);
    set('acct', appliedFilters.metaAccountId);
    set('name', appliedFilters.accountName);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  const resetAll = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setNoResultsMsg(null);
  };

  async function runGmailFallback(f: SearchFilters) {
    const numeric = normalizeMetaAccountNumeric(f.metaAccountId);
    const criteria: GmailSearchCriteria = {
      transaction_id: f.transactionId.trim() || null,
      date_from: f.dateFrom || null,
      date_to: f.dateTo || f.dateFrom || null,
      amount: f.amount.trim() || null,
      meta_account_id: numeric ? `act_${numeric}` : null,
      account_name: f.accountName.trim() || null,
    };
    setGmailSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-search-meta-receipts', {
        body: {
          action: 'search',
          transaction_id: criteria.transaction_id,
          date_from: criteria.date_from,
          date_to: criteria.date_to,
          amount: parseDeAmount(f.amount),
          meta_account_id: criteria.meta_account_id,
          account_name: criteria.account_name,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const list: any[] = (data as any)?.results || [];
      const importable = list.filter((r) => !r.already_imported);

      if (list.length === 0) {
        setNoResultsMsg('Keine passende Zahlung gefunden. Die Suche ergab weder im Portal noch in Gmail einen Treffer.');
        return;
      }
      if (importable.length === 0) {
        toast.info('Alle Gmail-Treffer sind bereits importiert.');
        return;
      }
      if (importable.length === 1) {
        const { data: imp, error: impErr } = await supabase.functions.invoke('gmail-search-meta-receipts', {
          body: { action: 'import', items: importable },
        });
        if (impErr) throw new Error(impErr.message);
        const upserted = (imp as any)?.upserted ?? 0;
        const importedId = (imp as any)?.results?.[0]?.id ?? null;
        if (upserted > 0) {
          toast.success('Zahlungsbeleg in Gmail gefunden und importiert.');
          await load();
          if (importedId) {
            setHighlightId(importedId);
            setTimeout(() => setHighlightId(null), 4000);
          }
        } else {
          toast.warning('Import fehlgeschlagen.');
        }
        return;
      }
      setSearchDialogInitial({ criteria, results: list });
      setSearchDialogOpen(true);
      toast.info(`${list.length} Gmail-Treffer — bitte auswählen.`);
    } catch (e: any) {
      toast.error('Gmail-Suche fehlgeschlagen: ' + (e?.message || e));
    } finally {
      setGmailSearching(false);
    }
  }

  const handleSearchSubmit = async () => {
    if (searchInFlightRef.current || gmailSearching) return;
    if (!hasAnyFilter(draftFilters)) {
      resetAll();
      return;
    }
    searchInFlightRef.current = true;
    setNoResultsMsg(null);
    try {
      const applied = { ...draftFilters };
      setAppliedFilters(applied);
      const localHits = rows.filter((r) => matchesFilters(r, applied));
      if (localHits.length > 0) return; // local hit → do NOT call Gmail
      await runGmailFallback(applied);
    } finally {
      searchInFlightRef.current = false;
    }
  };

  const onFieldKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSearchSubmit(); }
  };

  const activeFilterCount = hasAnyFilter(appliedFilters) ? 1 : 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Belege gesamt</p>
          <p className="text-xl font-semibold mt-1 font-mono tabular-nums">{kpis.count}</p>
          <p className="text-[10px] text-muted-foreground mt-2">Quelle: n8n / Gmail Import</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Summe Zahlungen</p>
          <p className="text-xl font-semibold mt-1 font-mono tabular-nums">
            {Object.keys(kpis.totalByCur).length === 0
              ? '–'
              : Object.entries(kpis.totalByCur).map(([c, v]) => formatCurrency(v, c)).join(' · ')}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2">Nach aktuellen Filtern</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Letzte 30 Tage</p>
          <p className="text-xl font-semibold mt-1 font-mono tabular-nums">
            {kpis.last30Count} · {Object.entries(kpis.last30Sum).map(([c, v]) => formatCurrency(v, c)).join(' · ') || '–'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2">Belege in den letzten 30 Tagen</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Werbekonten</p>
          <p className="text-xl font-semibold mt-1 font-mono tabular-nums">{accounts.length}</p>
          <p className="text-[10px] text-muted-foreground mt-2">Mit importierten Belegen</p>
        </Card>
      </div>

      {/* Filters — one single bar, six fields + Suchen + Zurücksetzen */}
      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
          <div className="lg:col-span-3">
            <Label className="text-[10px] uppercase text-muted-foreground">Transaktions-ID</Label>
            <Input
              placeholder="z. B. 27951790884507869-27902250049461958"
              value={draftFilters.transactionId}
              onChange={(e) => setDraftFilters((s) => ({ ...s, transactionId: e.target.value }))}
              onKeyDown={onFieldKeyDown}
              className="h-8 text-xs font-mono"
              disabled={gmailSearching}
            />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Datum von</Label>
            <Input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(e) => setDraftFilters((s) => ({ ...s, dateFrom: e.target.value }))}
              onKeyDown={onFieldKeyDown}
              className="h-8 text-xs"
              disabled={gmailSearching}
            />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Datum bis</Label>
            <Input
              type="date"
              value={draftFilters.dateTo}
              onChange={(e) => setDraftFilters((s) => ({ ...s, dateTo: e.target.value }))}
              onKeyDown={onFieldKeyDown}
              className="h-8 text-xs"
              disabled={gmailSearching}
            />
          </div>
          <div className="lg:col-span-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Betrag</Label>
            <Input
              inputMode="decimal"
              placeholder="z. B. 46,00"
              value={draftFilters.amount}
              onChange={(e) => setDraftFilters((s) => ({ ...s, amount: e.target.value }))}
              onKeyDown={onFieldKeyDown}
              className="h-8 text-xs"
              disabled={gmailSearching}
            />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Meta Account ID</Label>
            <Input
              placeholder="z. B. act_2070598240224366"
              value={draftFilters.metaAccountId}
              onChange={(e) => setDraftFilters((s) => ({ ...s, metaAccountId: e.target.value }))}
              onKeyDown={onFieldKeyDown}
              className="h-8 text-xs font-mono"
              disabled={gmailSearching}
            />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Werbekonto-Name</Label>
            <Input
              placeholder="z. B. Alexander Stursberg"
              value={draftFilters.accountName}
              onChange={(e) => setDraftFilters((s) => ({ ...s, accountName: e.target.value }))}
              onKeyDown={onFieldKeyDown}
              className="h-8 text-xs"
              disabled={gmailSearching}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button
            size="sm"
            className="h-8"
            onClick={handleSearchSubmit}
            disabled={!hasAnyFilter(draftFilters) || gmailSearching}
          >
            {gmailSearching
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Search className="h-3.5 w-3.5 mr-1" />}
            Suchen
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={resetAll}
            disabled={!hasAnyFilter(draftFilters) && !hasAnyFilter(appliedFilters)}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Zurücksetzen
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
          </Button>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {sorted.length} von {rows.length}
          </span>
        </div>

        {gmailSearching && (
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Kein Treffer im Portal – Gmail wird durchsucht …
          </div>
        )}
        {noResultsMsg && !gmailSearching && (
          <div className="mt-3 pt-3 border-t text-xs">
            <p className="font-medium">Keine passende Zahlung gefunden.</p>
            <p className="text-muted-foreground">Die Suche ergab weder im Portal noch in Gmail einen Treffer.</p>
          </div>
        )}
      </Card>


      {/* Table */}
      <Card className="overflow-hidden">
        {sorted.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Mail className="h-6 w-6 mx-auto mb-2 opacity-60" />
            <p>{rows.length === 0 ? 'Noch keine Zahlungsbelege importiert.' : 'Keine Zahlungen entsprechen den Filtern.'}</p>
            {rows.length === 0 && (
              <p className="text-xs mt-1">
                Belege werden automatisch aus Meta-Zahlungsbeleg-Mails über n8n importiert (Webhook{' '}
                <code className="bg-muted px-1 py-0.5 rounded">import-meta-payment-email</code>).
              </p>
            )}
            {rows.length > 0 && activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="mt-3 h-7 text-xs" onClick={resetAll}>
                <RotateCcw className="h-3 w-3 mr-1" /> Filter zurücksetzen
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('transaction_date')}>
                    Datum <SortIcon k="transaction_date" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('account_name')}>
                    Werbekonto <SortIcon k="account_name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('payment_method')}>
                    Zahlungsmethode <SortIcon k="payment_method" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button className="inline-flex items-center gap-1 hover:text-foreground ml-auto" onClick={() => toggleSort('amount')}>
                    Betrag <SortIcon k="amount" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('payment_status')}>
                    Status <SortIcon k="payment_status" />
                  </button>
                </TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('campaign_count')}>
                    Kampagnen <SortIcon k="campaign_count" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <React.Fragment key={r.id}>
                    <TableRow className={`cursor-pointer hover:bg-muted/40 ${highlightId === r.id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : ''}`} onClick={() => toggle(r.id)}>
                      <TableCell>{isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.transaction_date)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.account_name || '–'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.meta_account_id || r.meta_account_id_numeric || '–'}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.payment_method || '–'}</TableCell>
                      <TableCell className="text-right text-xs font-mono tabular-nums">
                        {r.amount != null ? formatCurrency(r.amount, r.currency || 'EUR') : '–'}
                      </TableCell>
                      <TableCell>
                        {r.payment_status_label || r.payment_status ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                            {r.payment_status_label || r.payment_status}
                          </Badge>
                        ) : '–'}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {r.period_start_raw && r.period_end_raw
                          ? <>{r.period_start_raw} – {r.period_end_raw}</>
                          : '–'}
                      </TableCell>
                      <TableCell className="text-xs">{r.campaign_count ?? (r.campaigns?.length ?? 0)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-right whitespace-nowrap">
                        {r.transaction_url ? (
                          <a
                            href={r.transaction_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Meta-Zahlungsbeleg in neuem Tab öffnen"
                            className="inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" /> Zur Rechnung
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={8} className="py-3">
                          <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <div className="text-[10px] uppercase text-muted-foreground">Transaktions-ID</div>
                                <div className="font-mono break-all">{r.transaction_id || '–'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase text-muted-foreground">Grund</div>
                                <div>{r.billing_reason || '–'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase text-muted-foreground">Produkt</div>
                                <div>{r.product_type || '–'}</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              {r.email_subject ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span>{r.email_subject}</span>
                                  {r.email_received_at && <span>· {fmtDate(r.email_received_at)}</span>}
                                </div>
                              ) : <span />}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                disabled={!canGeneratePdf(r)}
                                onClick={() => {
                                  try { generatePaymentReceiptPdf(r); }
                                  catch (e: any) { toast.error('PDF konnte nicht erzeugt werden: ' + (e?.message || e)); }
                                }}
                              >
                                <FileDown className="h-3 w-3 mr-1" /> PDF herunterladen
                              </Button>
                            </div>
                            {Array.isArray(r.campaigns) && r.campaigns.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase text-muted-foreground mb-1">Kampagnenaufschlüsselung</div>
                                <div className="border rounded overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Kampagne</TableHead>
                                        <TableHead className="text-xs text-right">Ergebnisse</TableHead>
                                        <TableHead className="text-xs">Typ</TableHead>
                                        <TableHead className="text-xs text-right">Betrag</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {r.campaigns.map((c, i) => (
                                        <TableRow key={i}>
                                          <TableCell className="text-xs">{c.name || '–'}</TableCell>
                                          <TableCell className="text-xs text-right font-mono tabular-nums">
                                            {c.results != null ? Number(c.results).toLocaleString('de-DE') : '–'}
                                          </TableCell>
                                          <TableCell className="text-xs">{c.result_type || '–'}</TableCell>
                                          <TableCell className="text-xs text-right font-mono tabular-nums">
                                            {c.amount != null ? formatCurrency(Number(c.amount), c.currency || r.currency || 'EUR') : '–'}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        Zahlungsbelege werden über n8n aus Meta-Bestätigungsmails
        (<code className="bg-muted px-1 rounded">noreply@business-updates.facebook.com</code>) importiert. Idempotent per Gmail-ID.
      </p>

      <GmailReceiptSearchDialog
        open={searchDialogOpen}
        onOpenChange={(v) => {
          setSearchDialogOpen(v);
          if (!v) setSearchDialogInitial({});
        }}
        onImported={load}
        initialCriteria={searchDialogInitial.criteria}
        initialResults={searchDialogInitial.results as any}
      />
    </div>
  );
}
