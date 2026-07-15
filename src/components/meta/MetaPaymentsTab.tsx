import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronDown, ChevronRight, ExternalLink, Mail, RefreshCw, Info, FileDown,
  ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, RotateCcw, X, MailSearch,
  Search, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

type DateRangeKey = 'all' | 'today' | '7d' | '30d' | '90d' | 'ytd' | 'custom';
type SortKey = 'transaction_date' | 'account_name' | 'amount' | 'payment_method' | 'payment_status' | 'campaign_count';
type SortDir = 'asc' | 'desc';

const DEFAULT_STATE = {
  search: '',
  accountFilter: 'all',
  currencyFilter: 'all',
  statusFilter: 'all',
  dateRange: 'all' as DateRangeKey,
  customFrom: '',
  customTo: '',
  minAmount: '',
  maxAmount: '',
  paymentMethodFilter: 'all',
  hasCampaignsFilter: 'all' as 'all' | 'with' | 'without',
  hasPdfFilter: 'all' as 'all' | 'yes' | 'no',
};

function computeRangeStart(key: DateRangeKey): number | null {
  const now = new Date();
  switch (key) {
    case 'today': {
      const d = new Date(now); d.setHours(0,0,0,0); return d.getTime();
    }
    case '7d': return now.getTime() - 7 * 24 * 3600 * 1000;
    case '30d': return now.getTime() - 30 * 24 * 3600 * 1000;
    case '90d': return now.getTime() - 90 * 24 * 3600 * 1000;
    case 'ytd': return new Date(now.getFullYear(), 0, 1).getTime();
    default: return null;
  }
}

// ── Confirmed search parser ────────────────────────────────────────
type ParsedCriteria = {
  transactionId: string | null;
  metaAccountId: string | null;
  accountNumeric: string | null;
  date: string | null;      // ISO yyyy-mm-dd
  amount: number | null;    // parsed as EUR
  amountRaw: string | null; // de format "46,00"
  remainingText: string;    // leftover, potential account name
};

function parseConfirmedQuery(input: string): ParsedCriteria {
  let text = ` ${input.trim()} `;
  const out: ParsedCriteria = {
    transactionId: null, metaAccountId: null, accountNumeric: null,
    date: null, amount: null, amountRaw: null, remainingText: '',
  };

  // Transaction ID: 12+ digits - 12+ digits
  const txn = text.match(/\b(\d{10,}-\d{10,})\b/);
  if (txn) { out.transactionId = txn[1]; text = text.replace(txn[0], ' '); }

  // Meta account id (act_ prefix or standalone long numeric 10-17 digits)
  const acct = text.match(/\bact_(\d{6,})\b/i);
  if (acct) {
    out.metaAccountId = `act_${acct[1]}`;
    out.accountNumeric = acct[1];
    text = text.replace(acct[0], ' ');
  } else {
    const num = text.match(/\b(\d{10,17})\b/);
    if (num) {
      out.metaAccountId = `act_${num[1]}`;
      out.accountNumeric = num[1];
      text = text.replace(num[0], ' ');
    }
  }

  // Date dd.mm.yyyy
  const date = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (date) {
    const dd = date[1].padStart(2, '0');
    const mm = date[2].padStart(2, '0');
    out.date = `${date[3]}-${mm}-${dd}`;
    text = text.replace(date[0], ' ');
  }

  // Amount: 1.234,56 or 46,00 (with optional € / EUR)
  const amt = text.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|EUR)?/i);
  if (amt) {
    out.amountRaw = amt[1];
    const n = parseFloat(amt[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) out.amount = n;
    text = text.replace(amt[0], ' ');
  }

  // Strip standalone € / EUR / PayPal noise words for remainingText check
  const remaining = text.replace(/\b(€|EUR|PayPal)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  out.remainingText = remaining;
  return out;
}

function isGmailQualified(p: ParsedCriteria): boolean {
  if (p.transactionId) return true;
  if (p.metaAccountId) return true;
  if (p.date) return true;
  const hasName = p.remainingText.length >= 3;
  if (hasName) return true;
  // amount alone is not enough
  return false;
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
  const initialApplied = searchParams.get('search') || '';

  // ── Confirmed-search states ──────────────────────────────────────
  const [draftSearch, setDraftSearch] = useState<string>(initialApplied);
  const [appliedSearch, setAppliedSearch] = useState<string>(initialApplied);
  const [gmailSearching, setGmailSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState<'idle' | 'local' | 'gmail'>('idle');
  const searchInFlightRef = useRef(false);

  const [accountFilter, setAccountFilter] = useState<string>(DEFAULT_STATE.accountFilter);
  const [currencyFilter, setCurrencyFilter] = useState<string>(DEFAULT_STATE.currencyFilter);
  const [statusFilter, setStatusFilter] = useState<string>(DEFAULT_STATE.statusFilter);
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_STATE.dateRange);
  const [customFrom, setCustomFrom] = useState<string>(DEFAULT_STATE.customFrom);
  const [customTo, setCustomTo] = useState<string>(DEFAULT_STATE.customTo);
  const [minAmount, setMinAmount] = useState<string>(DEFAULT_STATE.minAmount);
  const [maxAmount, setMaxAmount] = useState<string>(DEFAULT_STATE.maxAmount);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>(DEFAULT_STATE.paymentMethodFilter);
  const [hasCampaignsFilter, setHasCampaignsFilter] = useState<typeof DEFAULT_STATE.hasCampaignsFilter>(DEFAULT_STATE.hasCampaignsFilter);
  const [hasPdfFilter, setHasPdfFilter] = useState<typeof DEFAULT_STATE.hasPdfFilter>(DEFAULT_STATE.hasPdfFilter);

  // Inline Gmail search (structured criteria row)
  const [gTxnId, setGTxnId] = useState('');
  const [gDateFrom, setGDateFrom] = useState('');
  const [gDateTo, setGDateTo] = useState('');
  const [gAmount, setGAmount] = useState('');
  const [gMetaAccountId, setGMetaAccountId] = useState('');
  const [gAccountName, setGAccountName] = useState('');
  const [gmailInlineLoading, setGmailInlineLoading] = useState(false);

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

  const filtered = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();
    const rangeStart = computeRangeStart(dateRange);
    const customFromTs = dateRange === 'custom' && customFrom ? new Date(customFrom).getTime() : null;
    const customToTs = dateRange === 'custom' && customTo ? new Date(customTo).getTime() + 24 * 3600 * 1000 - 1 : null;
    const minA = minAmount ? Number(minAmount.replace(',', '.')) : null;
    const maxA = maxAmount ? Number(maxAmount.replace(',', '.')) : null;

    return rows.filter((r) => {
      if (accountFilter !== 'all' && (r.meta_account_id || r.meta_account_id_numeric) !== accountFilter) return false;
      if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;
      if (statusFilter !== 'all') {
        const s = (r.payment_status || r.payment_status_label || '').trim();
        if (s !== statusFilter) return false;
      }
      if (paymentMethodFilter !== 'all' && r.payment_method !== paymentMethodFilter) return false;

      if (rangeStart != null) {
        const t = r.transaction_date ? new Date(r.transaction_date).getTime() : null;
        if (t == null || t < rangeStart) return false;
      }
      if (customFromTs != null) {
        const t = r.transaction_date ? new Date(r.transaction_date).getTime() : null;
        if (t == null || t < customFromTs) return false;
      }
      if (customToTs != null) {
        const t = r.transaction_date ? new Date(r.transaction_date).getTime() : null;
        if (t == null || t > customToTs) return false;
      }

      if (minA != null && !Number.isNaN(minA)) {
        if (r.amount == null || r.amount < minA) return false;
      }
      if (maxA != null && !Number.isNaN(maxA)) {
        if (r.amount == null || r.amount > maxA) return false;
      }

      if (hasCampaignsFilter !== 'all') {
        const count = r.campaign_count ?? (r.campaigns?.length ?? 0);
        if (hasCampaignsFilter === 'with' && count <= 0) return false;
        if (hasCampaignsFilter === 'without' && count > 0) return false;
      }

      if (hasPdfFilter !== 'all') {
        const ok = canGeneratePdf(r);
        if (hasPdfFilter === 'yes' && !ok) return false;
        if (hasPdfFilter === 'no' && ok) return false;
      }

      if (!q) return true;
      return [
        r.account_name, r.meta_account_id, r.transaction_id, r.payment_method,
        r.billing_reason, r.email_subject,
      ].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [
    rows, appliedSearch, accountFilter, currencyFilter, statusFilter, dateRange,
    customFrom, customTo, minAmount, maxAmount, paymentMethodFilter,
    hasCampaignsFilter, hasPdfFilter,
  ]);

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

  // URL sync (only for confirmed appliedSearch)
  useEffect(() => {
    const current = searchParams.get('search') || '';
    if (appliedSearch === current) return;
    const next = new URLSearchParams(searchParams);
    if (appliedSearch) next.set('search', appliedSearch);
    else next.delete('search');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch]);

  const clearSearch = () => {
    setDraftSearch('');
    setAppliedSearch('');
  };

  const resetAll = () => {
    setDraftSearch('');
    setAppliedSearch('');
    setAccountFilter(DEFAULT_STATE.accountFilter);
    setCurrencyFilter(DEFAULT_STATE.currencyFilter);
    setStatusFilter(DEFAULT_STATE.statusFilter);
    setDateRange(DEFAULT_STATE.dateRange);
    setCustomFrom(DEFAULT_STATE.customFrom);
    setCustomTo(DEFAULT_STATE.customTo);
    setMinAmount(DEFAULT_STATE.minAmount);
    setMaxAmount(DEFAULT_STATE.maxAmount);
    setPaymentMethodFilter(DEFAULT_STATE.paymentMethodFilter);
    setHasCampaignsFilter(DEFAULT_STATE.hasCampaignsFilter);
    setHasPdfFilter(DEFAULT_STATE.hasPdfFilter);
    setGTxnId(''); setGDateFrom(''); setGDateTo(''); setGAmount('');
    setGMetaAccountId(''); setGAccountName('');
  };

  // Local match against currently loaded rows for a confirmed query
  function localMatches(text: string, parsed: ParsedCriteria): PaymentReceipt[] {
    const q = text.trim().toLowerCase();
    return rows.filter((r) => {
      if (parsed.transactionId && r.transaction_id === parsed.transactionId) return true;
      if (parsed.metaAccountId && (r.meta_account_id === parsed.metaAccountId ||
          r.meta_account_id_numeric === parsed.accountNumeric)) return true;
      // Composite text match
      const hay = [
        r.account_name, r.meta_account_id, r.meta_account_id_numeric,
        r.transaction_id, r.payment_method, r.billing_reason, r.email_subject,
        r.transaction_date, r.amount != null ? String(r.amount) : null,
        r.amount != null ? r.amount.toFixed(2).replace('.', ',') : null,
      ].filter(Boolean).join(' ').toLowerCase();
      if (q && hay.includes(q)) return true;
      // Date + amount pair
      if (parsed.date) {
        const iso = r.transaction_date ? r.transaction_date.slice(0, 10) : null;
        if (iso === parsed.date) {
          if (parsed.amount == null || (r.amount != null && Math.abs(r.amount - parsed.amount) < 0.01)) return true;
        }
      }
      if (parsed.remainingText && r.account_name &&
          r.account_name.toLowerCase().includes(parsed.remainingText.toLowerCase())) {
        if (parsed.amount == null || (r.amount != null && Math.abs(r.amount - parsed.amount) < 0.01)) return true;
      }
      return false;
    });
  }

  async function runGmailFallback(parsed: ParsedCriteria, rawText: string) {
    const criteria: GmailSearchCriteria = {
      transaction_id: parsed.transactionId || null,
      date_from: parsed.date || null,
      date_to: parsed.date || null,
      amount: parsed.amountRaw || null,
      meta_account_id: parsed.metaAccountId || null,
      account_name: parsed.remainingText || null,
    };
    setSearchPhase('gmail');
    setGmailSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-search-meta-receipts', {
        body: {
          action: 'search',
          transaction_id: criteria.transaction_id,
          date_from: criteria.date_from,
          date_to: criteria.date_to,
          amount: parsed.amount,
          meta_account_id: criteria.meta_account_id,
          account_name: criteria.account_name,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const list: any[] = (data as any)?.results || [];
      const importable = list.filter((r) => !r.already_imported);

      if (importable.length === 0) {
        toast.info(list.length > 0
          ? 'Gmail-Treffer sind bereits importiert.'
          : `Kein Treffer für „${rawText}" — weder lokal noch in Gmail.`);
        return;
      }
      if (importable.length === 1) {
        // Auto-import the single hit
        const { data: imp, error: impErr } = await supabase.functions.invoke('gmail-search-meta-receipts', {
          body: { action: 'import', items: importable },
        });
        if (impErr) throw new Error(impErr.message);
        const upserted = (imp as any)?.upserted ?? 0;
        if (upserted > 0) {
          toast.success('Gmail-Treffer automatisch importiert.');
          await load();
        } else {
          toast.warning('Import fehlgeschlagen.');
        }
        return;
      }
      // Multiple → open dialog with preview
      setSearchDialogInitial({ criteria, results: list });
      setSearchDialogOpen(true);
      toast.info(`${list.length} Gmail-Treffer — bitte auswählen.`);
    } catch (e: any) {
      toast.error('Gmail-Suche fehlgeschlagen: ' + (e?.message || e));
    } finally {
      setGmailSearching(false);
      setSearchPhase('idle');
    }
  }

  const handleSearchSubmit = async () => {
    if (searchInFlightRef.current || gmailSearching) return;
    const normalized = draftSearch.trim();
    if (!normalized) return;
    searchInFlightRef.current = true;
    try {
      setSearchPhase('local');
      setAppliedSearch(normalized);
      const parsed = parseConfirmedQuery(normalized);
      const hits = localMatches(normalized, parsed);
      if (hits.length > 0) {
        setSearchPhase('idle');
        return;
      }
      if (!isGmailQualified(parsed)) {
        toast.info('Kein lokaler Treffer. Bitte Datum, Werbekonto oder Account-ID ergänzen, um Gmail zu durchsuchen.');
        setSearchPhase('idle');
        return;
      }
      await runGmailFallback(parsed, normalized);
    } finally {
      searchInFlightRef.current = false;
    }
  };

  function parseDeAmountLocal(v: string): number | null {
    if (!v) return null;
    const n = parseFloat(v.trim().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function normalizeMetaAccountId(v: string): string | null {
    const t = v.trim();
    if (!t) return null;
    if (/^act_/i.test(t)) return t;
    if (/^\d{6,}$/.test(t)) return `act_${t}`;
    return t;
  }

  const inlineGmailHasAny = !!(
    gTxnId.trim() || gDateFrom || gDateTo || gAmount.trim() ||
    gMetaAccountId.trim() || gAccountName.trim()
  );

  const clearInlineGmail = () => {
    setGTxnId(''); setGDateFrom(''); setGDateTo(''); setGAmount('');
    setGMetaAccountId(''); setGAccountName('');
  };

  async function runInlineGmailSearch() {
    if (gmailInlineLoading || gmailSearching) return;
    if (!inlineGmailHasAny) {
      toast.error('Bitte mindestens ein Gmail-Suchkriterium angeben.');
      return;
    }
    const metaId = normalizeMetaAccountId(gMetaAccountId);
    const parsed: ParsedCriteria = {
      transactionId: gTxnId.trim() || null,
      metaAccountId: metaId,
      accountNumeric: metaId ? metaId.replace(/^act_/i, '') : null,
      date: gDateFrom || gDateTo || null,
      amount: parseDeAmountLocal(gAmount),
      amountRaw: gAmount.trim() || null,
      remainingText: gAccountName.trim(),
    };
    // Reuse fallback logic but with explicit date_from/date_to
    setGmailInlineLoading(true);
    try {
      const criteria: GmailSearchCriteria = {
        transaction_id: parsed.transactionId,
        date_from: gDateFrom || null,
        date_to: gDateTo || null,
        amount: parsed.amountRaw,
        meta_account_id: parsed.metaAccountId,
        account_name: parsed.remainingText || null,
      };
      const { data, error } = await supabase.functions.invoke('gmail-search-meta-receipts', {
        body: {
          action: 'search',
          transaction_id: criteria.transaction_id,
          date_from: criteria.date_from,
          date_to: criteria.date_to,
          amount: parsed.amount,
          meta_account_id: criteria.meta_account_id,
          account_name: criteria.account_name,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const list: any[] = (data as any)?.results || [];
      const importable = list.filter((r) => !r.already_imported);
      if (list.length === 0) {
        toast.info('Keine Treffer in Gmail gefunden.');
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
        if (upserted > 0) {
          toast.success('Gmail-Treffer automatisch importiert.');
          await load();
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
      setGmailInlineLoading(false);
    }
  }

  const activeFilterCount =
    (appliedSearch ? 1 : 0) +
    (accountFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (dateRange !== 'all' ? 1 : 0) +
    (currencyFilter !== 'all' ? 1 : 0) +
    (paymentMethodFilter !== 'all' ? 1 : 0) +
    (minAmount ? 1 : 0) +
    (maxAmount ? 1 : 0) +
    (hasCampaignsFilter !== 'all' ? 1 : 0) +
    (hasPdfFilter !== 'all' ? 1 : 0);

  const advancedCount =
    (currencyFilter !== 'all' ? 1 : 0) +
    (paymentMethodFilter !== 'all' ? 1 : 0) +
    (minAmount ? 1 : 0) +
    (maxAmount ? 1 : 0) +
    (hasCampaignsFilter !== 'all' ? 1 : 0) +
    (hasPdfFilter !== 'all' ? 1 : 0);

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

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center max-w-sm w-full sm:w-auto">
            <Input
              placeholder="Konto, Account-ID, Transaktions-ID, Betrag oder Datum eingeben …"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
              className="h-8 pr-14 text-xs w-[320px] max-w-full"
              disabled={gmailSearching}
            />
            {draftSearch && !gmailSearching && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-8 text-muted-foreground hover:text-foreground p-1"
                aria-label="Suche löschen"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-0 h-8 px-2"
              onClick={handleSearchSubmit}
              disabled={!draftSearch.trim() || gmailSearching}
              aria-label="Suchen"
              title="Suchen (Enter)"
            >
              {gmailSearching
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Werbekonto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Werbekonten</SelectItem>
              {accounts.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {statuses.map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeKey)}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Zeitraum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Gesamter Zeitraum</SelectItem>
              <SelectItem value="today">Heute</SelectItem>
              <SelectItem value="7d">Letzte 7 Tage</SelectItem>
              <SelectItem value="30d">Letzte 30 Tage</SelectItem>
              <SelectItem value="90d">Letzte 90 Tage</SelectItem>
              <SelectItem value="ytd">Dieses Jahr</SelectItem>
              <SelectItem value="custom">Benutzerdefiniert…</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <SlidersHorizontal className="h-3 w-3 mr-1" />
                Weitere Filter
                {advancedCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{advancedCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-3 space-y-3" align="start">
              {dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Von</Label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Bis</Label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Betrag min</Label>
                  <Input inputMode="decimal" placeholder="0,00" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Betrag max</Label>
                  <Input inputMode="decimal" placeholder="∞" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Währung</Label>
                <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Währungen</SelectItem>
                    {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Zahlungsmethode</Label>
                <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Methoden</SelectItem>
                    {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Kampagnen</Label>
                  <Select value={hasCampaignsFilter} onValueChange={(v) => setHasCampaignsFilter(v as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="with">Mit Kampagnen</SelectItem>
                      <SelectItem value="without">Ohne Kampagnen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">PDF verfügbar</Label>
                  <Select value={hasPdfFilter} onValueChange={(v) => setHasPdfFilter(v as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="yes">Nur mit PDF</SelectItem>
                      <SelectItem value="no">Nur ohne PDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={resetAll}
            disabled={activeFilterCount === 0}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Zurücksetzen
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => { setSearchDialogInitial({}); setSearchDialogOpen(true); }}>
            <MailSearch className="h-3 w-3 mr-1" /> Zahlungsbeleg in Gmail suchen
          </Button>

          <span className="text-[11px] text-muted-foreground ml-auto">
            {sorted.length} von {rows.length}
          </span>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t">
            {appliedSearch && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                Suche: „{appliedSearch}"
                <button onClick={clearSearch}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {accountFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                {accounts.find(([id]) => id === accountFilter)?.[1] || accountFilter}
                <button onClick={() => setAccountFilter('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {statusFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                Status: {statuses.find(([k]) => k === statusFilter)?.[1] || statusFilter}
                <button onClick={() => setStatusFilter('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {dateRange !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                Zeitraum: {dateRange}
                <button onClick={() => setDateRange('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {currencyFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                {currencyFilter}
                <button onClick={() => setCurrencyFilter('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {paymentMethodFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                {paymentMethodFilter}
                <button onClick={() => setPaymentMethodFilter('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {(minAmount || maxAmount) && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                Betrag {minAmount || '0'}–{maxAmount || '∞'}
                <button onClick={() => { setMinAmount(''); setMaxAmount(''); }}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {hasCampaignsFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                {hasCampaignsFilter === 'with' ? 'Mit Kampagnen' : 'Ohne Kampagnen'}
                <button onClick={() => setHasCampaignsFilter('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
            {hasPdfFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                {hasPdfFilter === 'yes' ? 'Mit PDF' : 'Ohne PDF'}
                <button onClick={() => setHasPdfFilter('all')}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}
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
                    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(r.id)}>
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
