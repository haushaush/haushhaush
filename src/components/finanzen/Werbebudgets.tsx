import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/StatCard';
import { RefreshCw, Users, TrendingDown, AlertTriangle, Receipt } from 'lucide-react';
import { useMetaAds } from '@/contexts/MetaAdsContext';

/** Unter dieser Reichweite (Tage) gilt ein Kunde als knapp. */
const KNAPP_TAGE = 3;
const AKTIV = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES']);

type Zuordnung = { client_id: string; meta_account_id: string; untermarke: string | null; typ: 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string | null; objekt_name: string | null };
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
          callMeta<any>(`/${o.objekt_id}`, { fields: 'effective_status,daily_budget' }),
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
    setKunden(ks); setZuo(zs); setEin(em); setLaedt(false);

    // Meta live: je Objekt Status, Ausgaben seit letzter Zahlung und letzte 7 Tage (nur GET).
    setMetaLaedt(true);
    const out = new Map<string, Meta>();
    try {
      for (const o of zs) {
        const seitDatum = em.get(o.client_id)?.letzte_zahlung?.slice(0, 10);
        const [info, d7, seit] = await Promise.all([
          callMeta<any>(`/${o.objekt_id}`, { fields: 'effective_status' }),
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
          <h2 className="text-lg font-semibold">Werbebudgets</h2>
          <p className="text-sm text-muted-foreground">Eingezahltes Werbebudget (netto) gegen Meta-Ausgaben der zugeordneten Kampagnen und Anzeigengruppen</p>
        </div>
        <Button variant="outline" size="sm" onClick={laden} disabled={metaLaedt} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${metaLaedt ? 'animate-spin' : ''}`} /> Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Kunden gesamt" value={zeilen.length} icon={Users} />
        <StatCard title="Davon knapp" value={anz('Knapp')} icon={TrendingDown} subtitle={`reicht unter ${KNAPP_TAGE} Tage`} />
        <StatCard title="Davon aufgebraucht" value={anz('Aufgebraucht')} icon={AlertTriangle} />
        <StatCard title="Offene Zahlungen" value={anz('Zahlung offen')} icon={Receipt} subtitle="überfällige Werbebudget-Rechnung" />
      </div>

      <p className="text-xs text-muted-foreground">
        {metaLaedt ? 'Meta-Ausgaben werden geladen …' : stand ? `Meta-Stand: ${stand.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr.` : ''}
        {' '}Meta meldet Ausgaben zeitversetzt — Werte können nachlaufen. Verbraucht = Ausgaben seit der letzten Werbebudget-Zahlung.
        {fehler && <span className="text-destructive"> Meta-Fehler: {fehler}</span>}
      </p>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kunde</TableHead><TableHead>Untermarke</TableHead>
                <TableHead className="text-right">Eingezahlt</TableHead><TableHead className="text-right">Verbraucht</TableHead>
                <TableHead className="text-right">Rest</TableHead><TableHead className="text-right">Reicht noch</TableHead>
                <TableHead>Zahlung</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gruppen.map(([g, rows]) => [
                <TableRow key={`g-${g}`} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={8} className="text-xs font-medium text-muted-foreground py-2">{g} · {rows.length}</TableCell>
                </TableRow>,
                ...rows.map(z => (
                  <TableRow key={z.k.id}>
                    <TableCell className="font-medium">{z.k.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{z.untermarke}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {z.eingezahlt != null ? eur(z.eingezahlt) : <span className="text-muted-foreground" title="keine Qonto-Verknüpfung">— <span className="text-xs">keine Qonto-Verknüpfung</span></span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{z.verbraucht != null ? eur(z.verbraucht) : '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums ${z.rest != null && z.rest <= 0 ? 'text-destructive' : ''}`}>{z.rest != null ? eur(z.rest) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{z.reicht != null ? `${Math.floor(z.reicht)} Tage` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {z.e?.aelteste_ueberfaellig ? <span className="text-destructive">überfällig seit {datum(z.e.aelteste_ueberfaellig)}</span>
                        : z.e?.letzte_zahlung ? `zuletzt ${datum(z.e.letzte_zahlung)}` : '—'}
                      {!!z.e?.rechnungen_offen && <div>{z.e.rechnungen_offen} offen · {eur(Number(z.e.offen_netto || 0))}</div>}
                    </TableCell>
                    <TableCell className={`text-sm ${statusFarbe(z.status)}`}>{z.status === 'Unklar' ? '—' : z.status}</TableCell>
                  </TableRow>
                )),
              ])}
              {zeilen.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine aktiven Kunden gefunden</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
