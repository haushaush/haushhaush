import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, ExternalLink, Mail, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/components/meta/metaUtils';

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

export default function MetaPaymentsTab() {
  const [rows, setRows] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (accountFilter !== 'all' && (r.meta_account_id || r.meta_account_id_numeric) !== accountFilter) return false;
      if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;
      if (!q) return true;
      return [
        r.account_name, r.meta_account_id, r.transaction_id, r.payment_method,
        r.billing_reason, r.email_subject,
      ].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, search, accountFilter, currencyFilter]);

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
          <Input
            placeholder="Suche: Konto, Transaktions-ID, Grund…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Werbekonto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Werbekonten</SelectItem>
              {accounts.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Währung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Währungen</SelectItem>
              {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {filtered.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Mail className="h-6 w-6 mx-auto mb-2 opacity-60" />
            <p>Noch keine Zahlungsbelege importiert.</p>
            <p className="text-xs mt-1">
              Belege werden automatisch aus Meta-Zahlungsbeleg-Mails über n8n importiert (Webhook{' '}
              <code className="bg-muted px-1 py-0.5 rounded">import-meta-payment-email</code>).
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Werbekonto</TableHead>
                <TableHead>Zahlungsmethode</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead>Kampagnen</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <React.Fragment key={r.id}>
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(r.id)}>
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {r.transaction_url && (
                          <a href={r.transaction_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${r.id}-detail`} className="bg-muted/30">
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
                            {r.email_subject && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span>{r.email_subject}</span>
                                {r.email_received_at && <span>· {fmtDate(r.email_received_at)}</span>}
                              </div>
                            )}
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
    </div>
  );
}
