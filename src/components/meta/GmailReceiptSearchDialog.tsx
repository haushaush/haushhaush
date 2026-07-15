import React, { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2, MailSearch, CheckCircle2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/components/meta/metaUtils';

type Preview = {
  gmail_id?: string | null;
  transaction_id?: string | null;
  account_name?: string | null;
  meta_account_id?: string | null;
  meta_account_id_numeric?: string | null;
  transaction_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  payment_status_label?: string | null;
  email_subject?: string | null;
  email_received_at?: string | null;
  already_imported?: boolean;
  [key: string]: any;
};

function parseDeAmount(v: string): number | null {
  if (!v) return null;
  const cleaned = v.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '–';
  try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return String(iso); }
}

export type GmailSearchCriteria = {
  transaction_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  amount?: string | null;
  meta_account_id?: string | null;
  account_name?: string | null;
};

export default function GmailReceiptSearchDialog({
  open, onOpenChange, onImported, initialCriteria, initialResults,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
  initialCriteria?: GmailSearchCriteria;
  initialResults?: Preview[];
}) {
  const [txnId, setTxnId] = useState(initialCriteria?.transaction_id || '');
  const [dateFrom, setDateFrom] = useState(initialCriteria?.date_from || '');
  const [dateTo, setDateTo] = useState(initialCriteria?.date_to || '');
  const [amount, setAmount] = useState(initialCriteria?.amount || '');
  const [metaAccountId, setMetaAccountId] = useState(initialCriteria?.meta_account_id || '');
  const [accountName, setAccountName] = useState(initialCriteria?.account_name || '');

  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Preview[] | null>(initialResults ?? null);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    (initialResults || []).forEach((r, i) => {
      if (!r.already_imported) s.add((r.gmail_id || r.transaction_id || `idx-${i}`) as string);
    });
    return s;
  });

  // Re-sync when dialog is opened with new initial values
  React.useEffect(() => {
    if (!open) return;
    if (initialCriteria) {
      setTxnId(initialCriteria.transaction_id || '');
      setDateFrom(initialCriteria.date_from || '');
      setDateTo(initialCriteria.date_to || '');
      setAmount(initialCriteria.amount || '');
      setMetaAccountId(initialCriteria.meta_account_id || '');
      setAccountName(initialCriteria.account_name || '');
    }
    if (initialResults) {
      setResults(initialResults);
      const s = new Set<string>();
      initialResults.forEach((r, i) => {
        if (!r.already_imported) s.add((r.gmail_id || r.transaction_id || `idx-${i}`) as string);
      });
      setSelected(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rowKey = (r: Preview, i: number) =>
    (r.gmail_id || r.transaction_id || `idx-${i}`) as string;

  const selectableCount = useMemo(
    () => (results || []).filter((r) => !r.already_imported).length,
    [results]
  );
  const allSelected =
    (results?.length ?? 0) > 0 &&
    (results || []).every((r, i) => r.already_imported || selected.has(rowKey(r, i)));

  function reset() {
    setResults(null); setSelected(new Set());
  }

  async function runSearch() {
    if (!txnId && !dateFrom && !dateTo && !amount && !metaAccountId && !accountName) {
      toast.error('Bitte mindestens ein Suchkriterium angeben.');
      return;
    }
    setSearching(true);
    reset();
    try {
      const { data, error } = await supabase.functions.invoke('gmail-search-meta-receipts', {
        body: {
          action: 'search',
          transaction_id: txnId || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          amount: parseDeAmount(amount),
          meta_account_id: metaAccountId || null,
          account_name: accountName || null,
        },
      });
      if (error) {
        const details = (error as any)?.context ? await (error as any).context.text().catch(() => null) : null;
        throw new Error(details || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const list: Preview[] = (data as any)?.results || [];
      setResults(list);
      // preselect all non-imported
      const pre = new Set<string>();
      list.forEach((r, i) => { if (!r.already_imported) pre.add(rowKey(r, i)); });
      setSelected(pre);
      if (list.length === 0) toast.info('Keine Treffer in Gmail gefunden.');
    } catch (e: any) {
      toast.error('Suche fehlgeschlagen: ' + (e?.message || e));
    } finally {
      setSearching(false);
    }
  }

  async function runImport() {
    if (!results) return;
    const items = results.filter((r, i) => selected.has(rowKey(r, i)) && !r.already_imported);
    if (items.length === 0) {
      toast.error('Keine Treffer zum Import ausgewählt.');
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-search-meta-receipts', {
        body: { action: 'import', items },
      });
      if (error) {
        const details = (error as any)?.context ? await (error as any).context.text().catch(() => null) : null;
        throw new Error(details || error.message);
      }
      const upserted = (data as any)?.upserted ?? 0;
      const failed = (data as any)?.failed ?? 0;
      if (failed > 0) toast.warning(`${upserted} importiert, ${failed} fehlgeschlagen.`);
      else toast.success(`${upserted} Zahlungsbeleg${upserted === 1 ? '' : 'e'} importiert.`);
      onImported?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Import fehlgeschlagen: ' + (e?.message || e));
    } finally {
      setImporting(false);
    }
  }

  function toggleAll() {
    if (!results) return;
    if (allSelected) {
      setSelected(new Set());
    } else {
      const s = new Set<string>();
      results.forEach((r, i) => { if (!r.already_imported) s.add(rowKey(r, i)); });
      setSelected(s);
    }
  }

  function toggleOne(k: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailSearch className="h-4 w-4" /> Historischen Meta-Zahlungsbeleg suchen
          </DialogTitle>
          <DialogDescription>
            Durchsuche gezielt Meta-Zahlungsbelege in Gmail und importiere nur die benötigten Treffer.
          </DialogDescription>
        </DialogHeader>

        {/* Search form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Transaktions-ID</Label>
            <Input
              placeholder="z. B. 27951790884507869-27902250049461958"
              value={txnId}
              onChange={(e) => setTxnId(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Datum von</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Datum bis</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Betrag</Label>
            <Input
              inputMode="decimal"
              placeholder="z. B. 10,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Meta Account ID</Label>
            <Input
              placeholder="act_2070598240224366"
              value={metaAccountId}
              onChange={(e) => setMetaAccountId(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Werbekonto-Name</Label>
            <Input
              placeholder="z. B. Alexander Stursberg"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={runSearch} disabled={searching} className="h-8">
            {searching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
            In Gmail suchen
          </Button>
          {results !== null && (
            <span className="text-[11px] text-muted-foreground">
              {results.length} Treffer · {selectableCount} importierbar · {selected.size} ausgewählt
            </span>
          )}
        </div>

        {/* Results preview */}
        {results !== null && (
          <div className="border rounded-md flex-1 overflow-hidden min-h-[200px]">
            <ScrollArea className="h-[380px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        disabled={selectableCount === 0}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Datum</TableHead>
                    <TableHead className="text-xs">Werbekonto</TableHead>
                    <TableHead className="text-xs">Transaktions-ID</TableHead>
                    <TableHead className="text-xs text-right">Betrag</TableHead>
                    <TableHead className="text-xs">Betreff</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                        Keine Treffer in Gmail.
                      </TableCell>
                    </TableRow>
                  ) : results.map((r, i) => {
                    const k = rowKey(r, i);
                    const disabled = !!r.already_imported;
                    return (
                      <TableRow key={k} className={disabled ? 'opacity-60' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(k)}
                            onCheckedChange={() => toggleOne(k)}
                            disabled={disabled}
                          />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.transaction_date || r.email_received_at)}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{r.account_name || '–'}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {r.meta_account_id || (r.meta_account_id_numeric ? `act_${r.meta_account_id_numeric}` : '–')}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono break-all max-w-[180px]">{r.transaction_id || '–'}</TableCell>
                        <TableCell className="text-right text-xs font-mono tabular-nums">
                          {r.amount != null ? formatCurrency(Number(r.amount), r.currency || 'EUR') : '–'}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground max-w-[220px] truncate" title={r.email_subject || ''}>
                          {r.email_subject || '–'}
                        </TableCell>
                        <TableCell>
                          {disabled ? (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Bereits importiert
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Neu</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={importing}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            onClick={runImport}
            disabled={importing || !results || selected.size === 0}
          >
            {importing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
            {selected.size > 0 ? `${selected.size} importieren` : 'Ausgewählte importieren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
