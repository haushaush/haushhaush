import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/StatCard';
import { RefreshCw, Users, TrendingDown, AlertTriangle, Receipt, ChevronDown, ChevronRight } from 'lucide-react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Link } from 'react-router-dom';
import { UntermarkenKonten } from './UntermarkenKonten';
import { ladeZahlungsstatus, ZAHLUNGSSTATUS_TEXT, OHNE_POSTEN_TOOLTIP, type WerbebudgetZahlungsstatus } from '@/lib/werbebudgetZahlungsstatus';

/** Unter dieser Reichweite (Tage) gilt ein Kunde als knapp. */
const KNAPP_TAGE = 3;
const AKTIV = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES']);

type Zuordnung = { client_id: string; meta_account_id: string; untermarke: string | null; typ: 'konto' | 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string | null; objekt_name: string | null };
type Eingezahlt = { client_id: string; quelle: string | null; eingezahlt_netto: number | null; uebertrag_frueher_netto: number | null; eingezahlt_gesamt_netto: number | null; zahlungen: number | null; offen_netto: number | null; rechnungen_offen: number | null; letzte_zahlung: string | null; aelteste_ueberfaellig: string | null };
type Meta = { seit: number | null; d7: number; aktiv: boolean };
type DetailZeile = { o: Zuordnung; status: string | null; tagesbudget: number | null; seit: number | null };
type Detail = { laedt: boolean; fehler: string | null; zeilen: DetailZeile[] };
type Status = 'Aufgebraucht' | 'Zahlung offen' | 'Knapp' | 'Läuft' | 'Nicht zuordenbar' | 'Unklar';
const RANG: Record<Status, number> = { 'Aufgebraucht': 0, 'Zahlung offen': 1, 'Knapp': 2, 'Läuft': 3, 'Unklar': 4, 'Nicht zuordenbar': 5 };

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const datum = (s: string) => new Date(s).toLocaleDateString('de-DE');
const heute = () => new Date().toISOString().slice(0, 10);
const spendAus = (r: any) => Number(r?.data?.[0]?.spend || 0);

/** Werbebudget-Übersicht je Kunde. Nur lesend — keine schreibenden Meta-Aufrufe. */
export function Werbebudgets() {
  const { callMeta } = useMetaAds();
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([]);
  const [zuo, setZuo] = useState<Zuordnung[]>([]);
  const [ein, setEin] = useState<Map<string, Eingezahlt>>(new Map());
  const [zst, setZst] = useState<Map<string, WerbebudgetZahlungsstatus>>(new Map());
  const [bq, setBq] = useState<Map<string, string | null>>(new Map());
  const [lage, setLage] = useState<Map<string, string>>(new Map());
  const [meta, setMeta] = useState<Map<string, Meta>>(new Map());
  const [stand, setStand] = useState<Date | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [metaLaedt, setMetaLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Map<string, Detail>>(new Map());

  /** Detail je Kunde — Meta-Abfragen (nur GET) erst beim Aufklappen. */
  const umschalten = useCallback(async (clientId: string) => {
    const istOffen = offen.has(clientId);
    setOffen(prev => { const n = new Set(prev); istOffen ? n.delete(clientId) : n.add(clientId); return n; });
    if (istOffen || details.get(clientId)?.zeilen.length) return;
    const objs = zuo.filter(z => z.client_id === clientId);
    const seitDatum = ein.get(clientId)?.letzte_zahlung?.slice(0, 10);
    setDetails(prev => new Map(prev).set(clientId, { laedt: true, fehler: null, zeilen: [] }));
    const zeilen: DetailZeile[] = [];
    let f: string | null = null;
    try {
      for (const o of objs) {
        const [info, seit] = await Promise.all([
          // Ganzes Konto: Kontostatus (1 = aktiv) statt Kampagnenstatus; Ausgaben über das ganze Konto.
          callMeta<any>(`/${o.objekt_id}`, { fields: o.typ === 'konto' ? 'account_status' : 'effective_status,daily_budget' }).then((r: any) => o.typ === 'konto' ? { effective_status: r?.account_status === 1 ? 'ACTIVE' : 'PAUSED' } : r),
          seitDatum ? callMeta<any>(`/${o.objekt_id}/insights`, { fields: 'spend', time_range: JSON.stringify({ since: seitDatum, until: heute() }) }) : Promise.resolve(null),
        ]);
        const db = info?.daily_budget != null && info.daily_budget !== '' ? Number(info.daily_budget) / 100 : null;
        zeilen.push({ o, status: info?.effective_status ?? null, tagesbudget: db && db > 0 ? db : null, seit: seit ? spendAus(seit) : null });
      }
    } catch (err) { f = (err as Error).message; }
    setDetails(prev => new Map(prev).set(clientId, { laedt: false, fehler: f, zeilen }));
  }, [offen, details, zuo, ein, callMeta]);

  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null);
    const [c, z, e] = await Promise.all([
      supabase.from('clients').select('id, name').is('deleted_at', null).in('kundenstatus', ['In Betreuung', 'Pausiert'] as any).order('name'),
      (supabase.from as any)('werbebudget_zuordnung').select('client_id, meta_account_id, untermarke, typ, objekt_id, kampagne_id, objekt_name'),
      (supabase.from as any)('werbebudget_eingezahlt').select('*'),
    ]);
    const ks = ((c.data || []) as any[]).filter(x => x.name);
    const zs = (z.data || []) as Zuordnung[];
    const em = new Map<string, Eingezahlt>(((e.data || []) as Eingezahlt[]).map(r => [r.client_id, r]));
    const ids = ks.map(k => k.id);
    const bqm = new Map<string, string | null>(); const lm = new Map<string, string>();
    const [zs0] = await Promise.all([
      ladeZahlungsstatus(ids),
      ...ids.map(async id => {
        const [q, l] = await Promise.all([
          (supabase.rpc as any)('kunde_buchhaltungsquelle', { p_client_id: id }),
          (supabase.rpc as any)('werbebudget_lage', { p_client_id: id }),
        ]);
        if (q.error) console.error('kunde_buchhaltungsquelle', id, q.error.message); else bqm.set(id, q.data ?? null);
        if (l.error) console.error('werbebudget_lage', id, l.error.message); else if (l.data) lm.set(id, l.data);
      }),
    ]);
    setZst(zs0 as Map<string, WerbebudgetZahlungsstatus>); setBq(bqm); setLage(lm);
    setKunden(ks); setZuo(zs); setEin(em); setLaedt(false);

    // Meta live: je Objekt Status, Ausgaben seit letzter Zahlung und letzte 7 Tage (nur GET).
    setMetaLaedt(true);
    const out = new Map<string, Meta>();
    try {
      for (const o of zs) {
        const seitDatum = em.get(o.client_id)?.letzte_zahlung?.slice(0, 10);
        const [info, d7, seit] = await Promise.all([
          callMeta<any>(`/${o.objekt_id}`, { fields: o.typ === 'konto' ? 'account_status' : 'effective_status' }).then((r: any) => o.typ === 'konto' ? { effective_status: r?.account_status === 1 ? 'ACTIVE' : 'PAUSED' } : r),
          callMeta<any>(`/${o.objekt_id}/insights`, { fields: 'spend', date_preset: 'last_7d' }),
          seitDatum ? callMeta<any>(`/${o.objekt_id}/insights`, { fields: 'spend', time_range: JSON.stringify({ since: seitDatum, until: heute() }) }) : Promise.resolve(null),
        ]);
        out.set(o.objekt_id, { aktiv: AKTIV.has(info?.effective_status), d7: spendAus(d7), seit: seit ? spendAus(seit) : null });
      }
    } catch (err) { setFehler((err as Error).message); }
    setMeta(out); setStand(new Date()); setMetaLaedt(false); setDetails(new Map());
  }, [callMeta]);

  useEffect(() => { laden(); }, [laden]);

  const zeilen = useMemo(() => kunden.map(k => {
    const objs = zuo.filter(z => z.client_id === k.id);
    const e = ein.get(k.id);
    const untermarken = [...new Set(objs.map(o => o.untermarke || o.meta_account_id))];
    const ms = objs.map(o => meta.get(o.objekt_id)).filter(Boolean) as Meta[];
    const komplett = objs.length > 0 && ms.length === objs.length;
    const verbraucht = komplett && ms.every(m => m.seit !== null) ? ms.reduce((s, m) => s + (m.seit || 0), 0) : null;
    const tagesschnitt = komplett ? ms.reduce((s, m) => s + m.d7, 0) / 7 : null;
    const aktiv = ms.some(m => m.aktiv);
    const eingezahlt = e?.eingezahlt_netto != null ? Number(e.eingezahlt_netto) : null;
    const rest = eingezahlt != null && verbraucht != null ? eingezahlt - verbraucht : null;
    const reicht = rest != null && tagesschnitt ? Math.max(0, rest) / tagesschnitt : null;
    let status: Status;
    if (!objs.length) status = 'Nicht zuordenbar';
    else if (e?.aelteste_ueberfaellig) status = 'Zahlung offen';
    else if (rest == null) status = 'Unklar';
    else if (rest <= 0 && aktiv) status = 'Aufgebraucht';
    else if (reicht != null && reicht < KNAPP_TAGE) status = 'Knapp';
    else status = 'Läuft';
    return { k, e, untermarke: untermarken.join(', ') || '—', eingezahlt, verbraucht, rest, reicht, status };
  }).sort((a, b) => RANG[a.status] - RANG[b.status] || a.k.name.localeCompare(b.k.name)), [kunden, zuo, ein, meta]);

  const gruppen = useMemo(() => {
    const m = new Map<string, typeof zeilen>();
    zeilen.forEach(z => { const g = z.status === 'Nicht zuordenbar' ? 'Ohne Zuordnung' : z.untermarke; m.set(g, [...(m.get(g) || []), z]); });
    return [...m.entries()].sort(([a], [b]) => (a === 'Ohne Zuordnung' ? 1 : b === 'Ohne Zuordnung' ? -1 : a.localeCompare(b)));
  }, [zeilen]);

  if (laedt) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  const anz = (s: Status) => zeilen.filter(z => z.status === s).length;
  const statusFarbe = (s: Status) => s === 'Aufgebraucht' || s === 'Zahlung offen' ? 'text-destructive' : s === 'Knapp' ? 'text-foreground font-medium' : 'text-muted-foreground';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Werbebudgets</h1>
          <p className="text-sm text-muted-foreground">Eingezahltes Werbebudget (netto) gegen Meta-Ausgaben der zugeordneten Kampagnen und Anzeigengruppen</p>
        </div>
        <Button variant="outline" size="sm" onClick={laden} disabled={metaLaedt} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${metaLaedt ? 'animate-spin' : ''}`} /> Aktualisieren
        </Button>
      </div>

      <UntermarkenKonten />

      <h2 className="text-lg font-semibold font-heading pt-2">Je Kunde</h2>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Kunden gesamt" value={zeilen.length} icon={Users} />
        <StatCard title="Davon knapp" value={anz('Knapp')} icon={TrendingDown} subtitle={`reicht unter ${KNAPP_TAGE} Tage`} />
        <StatCard title="Davon aufgebraucht" value={anz('Aufgebraucht')} icon={AlertTriangle} />
        <StatCard title="Offene Zahlungen" value={anz('Zahlung offen')} icon={Receipt} subtitle="überfällige Werbebudget-Rechnung" />
      </div>

      <p className="text-xs text-muted-foreground">
        {metaLaedt ? 'Meta-Ausgaben werden geladen …' : stand ? `Meta-Stand: ${stand.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr.` : ''}
        {' '}Meta meldet Ausgaben zeitversetzt — Werte können nachlaufen. Verbraucht und Rest beziehen sich auf die letzte Aufladung (Ausgaben seit dieser Zahlung); frühere Aufladungen sind separat ausgewiesen und nicht eingerechnet.
        {fehler && <span className="text-destructive"> Meta-Fehler: {fehler}</span>}
      </p>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kunde</TableHead><TableHead>Untermarke</TableHead>
                <TableHead className="text-right">Letzte Aufladung</TableHead><TableHead className="text-right">Verbraucht</TableHead>
                <TableHead className="text-right">Rest</TableHead><TableHead className="text-right">Reicht noch</TableHead>
                <TableHead>Zahlung</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gruppen.map(([g, rows]) => [
                <TableRow key={`g-${g}`} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={8} className="text-xs font-medium text-muted-foreground py-2">{g} · {rows.length}</TableCell>
                </TableRow>,
                ...rows.flatMap(z => {
                  const aufklappbar = z.status !== 'Nicht zuordenbar';
                  const istOffen = aufklappbar && offen.has(z.k.id);
                  const d = details.get(z.k.id);
                  const out = [
                  <TableRow key={z.k.id}>
                    <TableCell className="font-medium">
                      {aufklappbar ? (
                        <button type="button" onClick={() => umschalten(z.k.id)} className="inline-flex items-center gap-1 text-left hover:underline" aria-expanded={istOffen}>
                          {istOffen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          {z.k.name}
                        </button>
                      ) : z.k.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{z.untermarke}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {z.eingezahlt != null ? eur(z.eingezahlt) : <OhneBetrag zst={zst.get(z.k.id)} quelle={bq.has(z.k.id) ? bq.get(z.k.id)! : undefined} />}
                      {Number(z.e?.zahlungen || 0) > 1 && z.e?.uebertrag_frueher_netto != null && (
                        <div className="text-xs text-muted-foreground">+ {eur(Number(z.e.uebertrag_frueher_netto))} aus früheren Aufladungen</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{z.verbraucht != null ? eur(z.verbraucht) : '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums ${z.rest != null && z.rest <= 0 ? 'text-destructive' : ''}`}>{z.rest != null ? eur(z.rest) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{z.reicht != null ? `${Math.floor(z.reicht)} Tage` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {z.e?.aelteste_ueberfaellig ? <span className="text-destructive">überfällig seit {datum(z.e.aelteste_ueberfaellig)}</span>
                        : z.e?.letzte_zahlung ? `zuletzt ${datum(z.e.letzte_zahlung)}` : '—'}
                      {!!z.e?.rechnungen_offen && <div>{z.e.rechnungen_offen} offen · {eur(Number(z.e.offen_netto || 0))}</div>}
                    </TableCell>
                    <TableCell className={`text-sm ${statusFarbe(z.status)}`}>{z.status === 'Unklar' ? '—' : z.status}
                      {lage.get(z.k.id) && <div className={`text-xs ${lage.get(z.k.id) === 'fehlt_obwohl_pflicht' ? 'text-destructive' : 'text-muted-foreground'}`}>{LAGE_TEXT[lage.get(z.k.id)!] || lage.get(z.k.id)}</div>}
                    </TableCell>
                  </TableRow>];
                  if (istOffen) out.push(
                    <TableRow key={`${z.k.id}-d`} className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-muted/20 py-3">
                        <DetailTabelle d={d} hauptwert={z.verbraucht} ohneZahlung={!z.e?.letzte_zahlung} />
                      </TableCell>
                    </TableRow>);
                  return out;
                }),
              ])}
              {zeilen.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine aktiven Kunden gefunden</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Aufgeklappte Kundenzeile: Verbrauch je Zuordnung seit der letzten Aufladung, gruppiert nach Untermarke. */
function DetailTabelle({ d, hauptwert, ohneZahlung }: { d?: Detail; hauptwert: number | null; ohneZahlung: boolean }) {
  if (!d || d.laedt) return <p className="text-xs text-muted-foreground">Meta-Daten werden geladen …</p>;
  if (d.fehler) return <p className="text-xs text-destructive">Meta-Fehler: {d.fehler}</p>;
  const gruppen = new Map<string, DetailZeile[]>();
  d.zeilen.forEach(z => { const g = z.o.untermarke || z.o.meta_account_id; gruppen.set(g, [...(gruppen.get(g) || []), z]); });
  const summe = d.zeilen.every(z => z.seit !== null) ? d.zeilen.reduce((s, z) => s + (z.seit || 0), 0) : null;
  const diff = hauptwert != null && summe != null ? hauptwert - summe : null;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8">Was</TableHead><TableHead className="h-8">Ebene</TableHead><TableHead className="h-8">Status</TableHead>
          <TableHead className="h-8 text-right">Tagesbudget</TableHead><TableHead className="h-8 text-right">Verbraucht</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...gruppen.entries()].flatMap(([g, zs]) => [
          ...(gruppen.size > 1 ? [<TableRow key={`u-${g}`} className="hover:bg-transparent"><TableCell colSpan={5} className="py-1.5 text-xs font-medium text-muted-foreground">{g}</TableCell></TableRow>] : []),
          ...zs.map(z => (
            <TableRow key={z.o.objekt_id} className="hover:bg-transparent">
              <TableCell className="py-2 text-sm">{z.o.objekt_name || z.o.objekt_id}</TableCell>
              <TableCell className="py-2 text-sm text-muted-foreground">{z.o.typ === 'konto' ? 'Ganzes Konto' : z.o.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'}</TableCell>
              <TableCell className="py-2 text-sm text-muted-foreground">{z.status ? (AKTIV.has(z.status) ? 'Aktiv' : z.status === 'PAUSED' ? 'Pausiert' : z.status) : '—'}</TableCell>
              <TableCell className="py-2 text-right tabular-nums text-sm">{z.tagesbudget != null ? eur(z.tagesbudget) : '—'}</TableCell>
              <TableCell className="py-2 text-right tabular-nums text-sm">{z.seit != null ? eur(z.seit) : ohneZahlung ? '— keine Zahlung' : '—'}</TableCell>
            </TableRow>
          )),
        ])}
        {diff != null && Math.abs(diff) >= 0.5 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={4} className="py-2 text-sm text-muted-foreground">nicht zugeordnet (Differenz zur Hauptzeile)</TableCell>
            <TableCell className="py-2 text-right tabular-nums text-sm">{eur(diff)}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

const LAGE_TEXT: Record<string, string> = {
  bezahlt: 'bezahlt',
  zahlt_meta_direkt: 'zahlt Meta direkt',
  fehlt_obwohl_pflicht: 'fehlt obwohl Pflicht',
  unbekannt: 'keine Zuordnung',
};

/** Begründung, warum kein eingezahlter Betrag vorliegt — nie geschätzt. */
function OhneBetrag({ zst, quelle }: { zst?: WerbebudgetZahlungsstatus; quelle?: string | null }) {
  if (quelle === 'lexoffice') return <span className="text-xs text-muted-foreground">lexoffice liefert keine Rechnungspositionen — Werbebudget hier nicht ermittelbar</span>;
  if (zst === 'keine_zahlungsverknuepfung' || quelle === null) return <Link to="/kunden/verknuepfungen" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">keine Buchhaltungsverknüpfung</Link>;
  if (zst === 'verknuepft_ohne_werbebudgetposten') return <span className="text-xs text-muted-foreground" title={OHNE_POSTEN_TOOLTIP}>kein Werbebudget-Posten auf den Rechnungen</span>;
  return <span className="text-muted-foreground">—</span>;
}
