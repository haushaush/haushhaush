import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RefreshCw, Search, SlidersHorizontal, ChevronDown, FileText, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, accountStatusBadge } from '@/components/meta/metaUtils';
import { usePermissions } from '@/hooks/usePermissions';
import MetaDiagnosticPanel from '@/components/meta/MetaDiagnosticPanel';
import type { PaymentReceipt } from '@/components/meta/MetaPaymentsTab';
import { generatePaymentReceiptPdf, canGeneratePdf } from '@/components/meta/generatePaymentReceiptPdf';
import { HealthKarte, HEALTH_KARTE, FARBE } from '@/components/finanzen/HealthKarte';

/**
 * Meta Belege: eine Suche über alle Zahlungsbelege (meta_payment_receipts).
 * Karten beziehen sich auf das aktuelle Suchergebnis. Konten-Status aus meta_billing_account_snapshots.
 */
type Snapshot = {
  meta_account_id: string; account_name: string | null; currency: string | null; account_status: string | null;
  amount_spent: number | null; balance: number | null; spend_cap: number | null; business_name: string | null; synced_at: string;
};

type Preset = 'today' | 'last_7d' | 'last_30d' | 'this_month' | 'last_month' | 'this_year' | 'last_12m' | 'maximum' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'maximum', label: 'Insgesamt' }, { value: 'today', label: 'Heute' }, { value: 'last_7d', label: 'Letzte 7 Tage' },
  { value: 'last_30d', label: 'Letzte 30 Tage' }, { value: 'this_month', label: 'Dieser Monat' }, { value: 'last_month', label: 'Letzter Monat' },
  { value: 'this_year', label: 'Dieses Jahr' }, { value: 'last_12m', label: 'Letzte 12 Monate' }, { value: 'custom', label: 'Benutzerdefiniert' },
];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function rangeFor(p: Preset, c: { from: string; to: string }): { since?: string; until?: string } {
  const t = new Date(); const today = ymd(t);
  const d = (n: number) => { const x = new Date(t); x.setDate(x.getDate() + n); return ymd(x); };
  const first = (o: number) => ymd(new Date(t.getFullYear(), t.getMonth() + o, 1));
  switch (p) {
    case 'today': return { since: today, until: today };
    case 'last_7d': return { since: d(-6), until: today };
    case 'last_30d': return { since: d(-29), until: today };
    case 'this_month': return { since: first(0), until: today };
    case 'last_month': return { since: first(-1), until: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) };
    case 'this_year': return { since: `${t.getFullYear()}-01-01`, until: today };
    case 'last_12m': return { since: first(-11), until: today };
    case 'custom': return { since: c.from || undefined, until: c.to || undefined };
    default: return {};
  }
}

const datum = (iso: string | null) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const betragText = (n: number | null | undefined) => n == null ? '' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normId = (s: string | null | undefined) => (s || '').toLowerCase().replace(/^act_/, '');
function fmtMulti(m: Record<string, number>) {
  const e = Object.entries(m);
  return e.length ? e.map(([c, v]) => formatCurrency(v, c)).join(' · ') : '–';
}
const SCHRITT = 50;

export default function MetaAbrechnungen() {
  const { hasPermission, isAdmin } = usePermissions();
  const canManage = isAdmin || hasPermission('meta.billing.manage');

  const [rows, setRows] = useState<PaymentReceipt[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [kundenJeKonto, setKundenJeKonto] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [q, setQ] = useState('');
  const [filterOffen, setFilterOffen] = useState(false);
  const [preset, setPreset] = useState<Preset>('maximum');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [konto, setKonto] = useState('all');
  const [minAmt, setMinAmt] = useState('');
  const [anzahl, setAnzahl] = useState(SCHRITT);
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [kontenOffen, setKontenOffen] = useState(false);

  useEffect(() => { document.title = 'Meta Belege · Finanzen'; }, []);

  async function loadReceipts() {
    const all: PaymentReceipt[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await (supabase as any).from('meta_payment_receipts').select('*')
        .order('transaction_date', { ascending: false, nullsFirst: false }).range(from, from + 999);
      if (error) { toast.error('Belege konnten nicht geladen werden: ' + error.message); break; }
      all.push(...((data || []) as PaymentReceipt[]));
      if (!data || data.length < 1000) break;
    }
    setRows(all);
  }
  async function loadSnapshots() {
    const { data, error } = await supabase.from('meta_billing_account_snapshots').select('*').order('account_name').limit(2000);
    if (error) toast.error('Konnte Snapshots nicht laden: ' + error.message);
    setSnapshots((data as any) || []);
  }
  async function loadKunden() {
    const { data, error } = await supabase.from('kunde_meta_accounts').select('meta_account_id, client_id, clients(name)').limit(5000);
    if (error) { console.error('kunde_meta_accounts', error); return; }
    const m = new Map<string, string[]>();
    for (const r of (data || []) as any[]) {
      const name = r.clients?.name; if (!name || !r.meta_account_id) continue;
      const k = normId(r.meta_account_id);
      const l = m.get(k) || []; if (!l.includes(name)) l.push(name); m.set(k, l);
    }
    setKundenJeKonto(m);
  }

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadReceipts(), loadSnapshots(), loadKunden()]); setLoading(false); })();
    const ch = supabase.channel('meta_payment_receipts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meta_payment_receipts' }, () => loadReceipts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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
      toast.success(`Sync fertig: ${data.accounts_checked} Konten geprüft, ${data.accounts_updated} aktualisiert${invPart}` +
        (data.errors?.length ? ` (${data.errors.length} Fehler)` : ''));
      await Promise.all([loadSnapshots(), loadReceipts()]);
    } catch (e) {
      toast.error('Sync fehlgeschlagen: ' + (e as Error).message);
    } finally { setSyncing(false); }
  }

  const kundenVon = (r: PaymentReceipt) => kundenJeKonto.get(normId(r.meta_account_id)) || kundenJeKonto.get(normId(r.meta_account_id_numeric)) || [];

  const konten = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) { const k = r.meta_account_id || r.meta_account_id_numeric || ''; if (k && !m.has(k)) m.set(k, r.account_name || k); }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);

  const treffer = useMemo(() => {
    const s = q.trim().toLowerCase();
    const min = minAmt.trim() ? Number(minAmt.replace(/\./g, '').replace(',', '.')) : null;
    return rows.filter(r => {
      const tag = (r.transaction_date || '').slice(0, 10);
      if (range.since && (!tag || tag < range.since)) return false;
      if (range.until && (!tag || tag > range.until)) return false;
      if (konto !== 'all' && (r.meta_account_id || r.meta_account_id_numeric) !== konto) return false;
      if (min != null && !isNaN(min) && (r.amount ?? 0) < min) return false;
      if (!s) return true;
      const heu = [
        r.account_name, r.meta_account_id, r.meta_account_id_numeric, r.transaction_id,
        ...kundenVon(r), ...(r.campaigns || []).map(c => c.name),
        betragText(r.amount), datum(r.transaction_date),
      ].filter(Boolean).join(' ').toLowerCase();
      return heu.includes(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, range.since, range.until, konto, minAmt, kundenJeKonto]);

  useEffect(() => { setAnzahl(SCHRITT); }, [q, range.since, range.until, konto, minAmt]);

  const karten = useMemo(() => {
    const summe: Record<string, number> = {};
    let von: string | null = null; let bis: string | null = null;
    for (const r of treffer) {
      const c = r.currency || 'EUR'; summe[c] = (summe[c] || 0) + (r.amount ?? 0);
      const d = r.transaction_date; if (!d) continue;
      if (!von || d < von) von = d; if (!bis || d > bis) bis = d;
    }
    return { summe, von, bis };
  }, [treffer]);

  // Konten-Status (unverändert berechnet wie bisher, aus Snapshots)
  const kontoStatus = useMemo(() => {
    const sum = (f: (s: Snapshot) => number | null) => {
      const m: Record<string, number> = {};
      for (const a of snapshots) { const v = f(a); if (v == null) continue; const c = a.currency || 'EUR'; m[c] = (m[c] || 0) + v / 100; }
      return m;
    };
    return {
      saldo: sum(a => a.balance), caps: sum(a => a.spend_cap || null),
      warn: snapshots.filter(a => a.spend_cap && a.amount_spent && a.amount_spent / a.spend_cap >= 0.9).length,
      ohne: snapshots.filter(a => a.amount_spent == null && a.balance == null).length,
      aktiv: snapshots.filter(a => a.account_status === '1').length,
    };
  }, [snapshots]);

  const toggle = (id: string) => setOffen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filterAktiv = preset !== 'maximum' || konto !== 'all' || !!minAmt;

  return (
    <div className="space-y-8 rounded-3xl bg-muted/40 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Meta Belege</h1>
          <p className="text-sm text-muted-foreground">Zahlungsbelege von Meta · {loading ? 'lade …' : `${rows.length.toLocaleString('de-DE')} Belege`}</p>
        </div>
        {canManage && (
          <Button onClick={handleSync} disabled={syncing} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Aktualisiere…' : 'Meta-Abrechnungen aktualisieren'}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Kunde, Werbekonto, Kampagne, Betrag oder Datum"
              className="h-12 rounded-2xl pl-11 bg-card text-base" aria-label="Belege durchsuchen" />
          </div>
          <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setFilterOffen(o => !o)} aria-expanded={filterOffen}>
            <SlidersHorizontal className="h-4 w-4 mr-2" />Filter{filterAktiv ? ' ·' : ''}
          </Button>
        </div>
        {filterOffen && (
          <div className={`${HEALTH_KARTE} grid grid-cols-1 md:grid-cols-3 gap-4`}>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Zeitraum</label>
              <Select value={preset} onValueChange={v => setPreset(v as Preset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              {preset === 'custom' && (
                <div className="flex gap-2">
                  <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} aria-label="Von" />
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} aria-label="Bis" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Werbekonto</label>
              <Select value={konto} onValueChange={setKonto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Werbekonten</SelectItem>
                  {konten.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Mindestbetrag</label>
              <Input inputMode="decimal" value={minAmt} onChange={e => setMinAmt(e.target.value)} placeholder="z. B. 100,00" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <HealthKarte titel="Summe der Treffer" farbe={FARBE.primaer} wert={loading ? '…' : fmtMulti(karten.summe)} satz="tatsächlich an Meta gezahlt" />
          <HealthKarte titel="Anzahl Belege" farbe={FARBE.gruen} wert={loading ? '…' : treffer.length.toLocaleString('de-DE')} satz={`von ${rows.length.toLocaleString('de-DE')} Belegen insgesamt`} />
          <HealthKarte titel="Zeitraum" farbe={FARBE.grau} wert={karten.von ? `${datum(karten.von)} – ${datum(karten.bis)}` : '–'} satz="ältester bis neuester Treffer" className="[&>p:nth-of-type(2)]:text-2xl" />
        </div>
        <p className="text-xs text-muted-foreground">Werbeausgaben je Kampagne liegen nicht im Portal — der Meta-Sync schreibt keine Insights. Die Beträge hier sind die tatsächlich an Meta gezahlten Beträge aus den Zahlungsbelegen.</p>
      </div>

      <div className={`${HEALTH_KARTE} p-0 sm:p-0 overflow-hidden`}>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Lade Belege …</p>
          : treffer.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Keine Belege zu dieser Suche.</p>
          : (
            <ul className="divide-y divide-border/60">
              {treffer.slice(0, anzahl).map(r => {
                const kunden = kundenVon(r);
                const kampagnen = r.campaigns || [];
                const n = r.campaign_count ?? kampagnen.length;
                const auf = offen.has(r.id);
                return (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">
                          <span className="tabular-nums text-muted-foreground">{datum(r.transaction_date)}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className="font-medium">{r.account_name || r.meta_account_id || '–'}</span>
                          <span className="text-muted-foreground"> · {kunden.length ? kunden.join(', ') : 'kein Kunde zugeordnet'}</span>
                        </p>
                        {n > 0 ? (
                          <button onClick={() => toggle(r.id)} aria-expanded={auf} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            {n} Kampagne{n === 1 ? '' : 'n'}<ChevronDown className={`h-3 w-3 transition-transform ${auf ? 'rotate-180' : ''}`} />
                          </button>
                        ) : <p className="mt-1 text-xs text-muted-foreground">keine Kampagnen im Beleg</p>}
                      </div>
                      <p className="text-base font-semibold tabular-nums shrink-0">{r.amount != null ? formatCurrency(r.amount, r.currency || 'EUR') : '–'}</p>
                      {r.transaction_url
                        ? <a href={r.transaction_url} target="_blank" rel="noopener noreferrer" title="Beleg öffnen" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><FileText className="h-4 w-4" /></a>
                        : <span className="shrink-0 p-1.5 text-muted-foreground/40" title="kein Beleg-Link"><FileText className="h-4 w-4" /></span>}
                    </div>
                    {auf && (
                      <div className="mt-3 ml-1 space-y-2">
                        {kampagnen.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {kampagnen.map((c, i) => (
                              <li key={i} className="flex justify-between gap-4">
                                <span className="truncate">{c.name || '–'}</span>
                                <span className="tabular-nums shrink-0">{c.amount != null ? formatCurrency(Number(c.amount), c.currency || r.currency || 'EUR') : '–'}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-xs text-muted-foreground">Kampagnennamen sind im Beleg nicht enthalten.</p>}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-muted-foreground font-mono break-all">Transaktions-ID {r.transaction_id || '–'}</span>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!canGeneratePdf(r)}
                            onClick={() => { try { generatePaymentReceiptPdf(r); } catch (e: any) { toast.error('PDF konnte nicht erzeugt werden: ' + (e?.message || e)); } }}>
                            <FileDown className="h-3 w-3 mr-1" />PDF herunterladen
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        {treffer.length > anzahl && (
          <div className="p-4 text-center border-t border-border/60">
            <Button variant="outline" size="sm" onClick={() => setAnzahl(a => a + SCHRITT)}>
              Mehr anzeigen ({(treffer.length - anzahl).toLocaleString('de-DE')} weitere)
            </Button>
          </div>
        )}
      </div>

      <Collapsible open={kontenOffen} onOpenChange={setKontenOffen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground hover:text-foreground">
          Konten-Status<ChevronDown className={`h-3.5 w-3.5 transition-transform ${kontenOffen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <HealthKarte titel="Saldo (gesamt)" farbe={FARBE.primaer} wert={fmtMulti(kontoStatus.saldo)} satz="aus den Werbekonten" />
            <HealthKarte titel="Summe Spend Caps" farbe={FARBE.grau} wert={fmtMulti(kontoStatus.caps)} satz="aus den Werbekonten" />
            <HealthKarte titel="Konten mit Warnungen" farbe={FARBE.rot} wert={String(kontoStatus.warn)} satz="Ausgaben ≥ 90 % des Spend Caps" />
            <HealthKarte titel="Ohne Abrechnungsdaten" farbe={FARBE.grau} wert={String(kontoStatus.ohne)} satz={`${snapshots.length} zugängliche, ${kontoStatus.aktiv} aktive Werbekonten`} />
          </div>
          <div className={`${HEALTH_KARTE} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground text-left">
                  <th className="py-2 pr-4 font-semibold">Werbekonto</th><th className="py-2 pr-4 font-semibold">Account-ID</th>
                  <th className="py-2 pr-4 font-semibold">Status</th><th className="py-2 pr-4 font-semibold text-right">Saldo</th>
                  <th className="py-2 pr-4 font-semibold text-right">Spend Cap</th><th className="py-2 pr-4 font-semibold">Warnung</th>
                  <th className="py-2 font-semibold">Letzter Sync</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Keine Werbekonten. „Meta-Abrechnungen aktualisieren“ oben rechts lädt sie.</td></tr>
                ) : snapshots.map(a => {
                  const cur = a.currency || 'EUR';
                  const badge = accountStatusBadge(Number(a.account_status));
                  const warn = !!(a.spend_cap && a.amount_spent && a.amount_spent / a.spend_cap >= 0.9);
                  return (
                    <tr key={a.meta_account_id} className="border-t border-border/50">
                      <td className="py-2 pr-4">{a.account_name || '–'}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{a.meta_account_id}</td>
                      <td className="py-2 pr-4 text-xs">{(badge as any)?.label ?? a.account_status ?? '–'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{a.balance != null ? formatCurrency(a.balance / 100, cur) : '–'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{a.spend_cap ? formatCurrency(a.spend_cap / 100, cur) : '–'}</td>
                      <td className="py-2 pr-4 text-xs">{warn ? <span className="text-destructive">≥ 90 % Spend Cap</span> : '–'}</td>
                      <td className="py-2 text-xs tabular-nums text-muted-foreground">{datum(a.synced_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {isAdmin && <MetaDiagnosticPanel />}
    </div>
  );
}
