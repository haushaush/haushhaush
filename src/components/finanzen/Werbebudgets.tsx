import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { HealthKarte, HEALTH_KARTE, FARBE } from './HealthKarte';
import { ladeZahlungsstatus, OHNE_POSTEN_TOOLTIP, type WerbebudgetZahlungsstatus } from '@/lib/werbebudgetZahlungsstatus';
import { ladeKontenJeKunde, wirksamerBudgetTraeger, type KontoInfo } from '@/lib/budgetTraeger';

type Zuordnung = { client_id: string; meta_account_id: string; untermarke: string | null; typ: 'konto' | 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string | null; objekt_name: string | null };
type Eingezahlt = { client_id: string; quelle: string | null; eingezahlt_netto: number | null; uebertrag_frueher_netto: number | null; eingezahlt_gesamt_netto: number | null; zahlungen: number | null; offen_netto: number | null; rechnungen_offen: number | null; letzte_zahlung: string | null; aelteste_ueberfaellig: string | null };
type Spend = { meta_account_id: string; campaign_id: string | null; campaign_name: string | null; adset_id: string; adset_name: string | null; datum: string; spend: number };
type KontoView = { meta_account_id: string; kontoname: string | null; art: string | null; eingezahlt: number | null; ausgegeben: number | null; letzte_aufladung: string | null; letzte_meta_zahlung: string | null; belege: number | null; kampagnen_aktiv: number | null; tagesbudget: number | null };
type Snap = { campaign_id: string; campaign_name: string | null; account_id: string; status: string | null; daily_budget: number | null };
type Kunde = { id: string; name: string; kundenstatus: string | null; ads_budget: number | null; werbebudget_pflicht: boolean | null; auto_stopp: boolean };
type Zahlung = { datum: string; betrag: number; nummer: string | null };

type Zeitraum = 'heute' | 'woche' | 'monat' | 'jahr' | 'insgesamt';
type Filter = 'alle' | 'uns' | 'kunde' | 'ueber';

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const datum = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const norm = (s: string | null | undefined) => String(s ?? '').replace(/^act_/, '');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ART_TEXT: Record<string, string> = { untermarke: 'Untermarke', kunde_eigen: 'Kundeneigenes Konto', unbekannt: 'Art unbekannt' };
const LAGE_TEXT: Record<string, string> = { bezahlt: 'bezahlt', zahlt_meta_direkt: 'zahlt Meta direkt', fehlt_obwohl_pflicht: 'fehlt obwohl Pflicht', unbekannt: 'keine Zuordnung' };
const WB_REGEX = /(werbebudget|anzeigenbudget|mediabudget|media[ -]budget|ad[ -]?spend|werbekampagnen[ -]budget)/i;
const ZEITRAUM_TEXT: Record<Zeitraum, string> = { heute: 'Heute', woche: 'Diese Woche', monat: 'Dieser Monat', jahr: 'Dieses Jahr', insgesamt: 'Insgesamt' };
const GRID = 'md:grid-cols-[minmax(0,1fr)_7.5rem_9rem_8rem_8rem_9rem_5.5rem]';

function zeitraumStart(z: Zeitraum): string | null {
  const d = new Date();
  if (z === 'heute') return iso(d);
  if (z === 'woche') { const t = (d.getDay() + 6) % 7; d.setDate(d.getDate() - t); return iso(d); }
  if (z === 'monat') return iso(new Date(d.getFullYear(), d.getMonth(), 1));
  if (z === 'jahr') return iso(new Date(d.getFullYear(), 0, 1));
  return null;
}

async function ladeSpend(): Promise<Spend[]> {
  const out: Spend[] = [];
  for (let von = 0; von < 500000; von += 1000) {
    const { data, error } = await (supabase.from as any)('meta_spend_taeglich')
      .select('meta_account_id, campaign_id, campaign_name, adset_id, adset_name, datum, spend').range(von, von + 999);
    if (error) { console.error('meta_spend_taeglich', error.message); throw new Error(error.message); }
    out.push(...((data || []) as Spend[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Einzelne bezahlte Werbebudget-Posten eines Kunden aus Qonto (gleiche Erkennung wie werbebudget_eingezahlt). Nur lesend. */
async function ladeZahlungen(clientId: string): Promise<Zahlung[]> {
  const { data: links, error: lErr } = await supabase.from('qonto_client_links').select('qonto_client_name').eq('client_id', clientId);
  if (lErr) { console.error('qonto_client_links', lErr.message); return []; }
  const namen = [...new Set((links || []).map((l: any) => l.qonto_client_name).filter(Boolean))];
  if (!namen.length) return [];
  const { data, error } = await (supabase.from as any)('qonto_client_invoices').select('number, status, paid_at, raw').in('client_name', namen).not('paid_at', 'is', null);
  if (error) { console.error('qonto_client_invoices', error.message); return []; }
  const out: Zahlung[] = [];
  for (const q of (data || []) as any[]) {
    if (q.status === 'canceled') continue;
    const items = Array.isArray(q.raw?.items) ? q.raw.items : [];
    const summe = items.filter((i: any) => WB_REGEX.test(String(i?.title ?? ''))).reduce((s: number, i: any) => s + (Number(i?.subtotal?.value) || 0), 0);
    if (summe) out.push({ datum: q.paid_at, betrag: summe, nummer: q.number ?? null });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Werbebudget je Kunde: alle aktiven Kunden, Monatsbudget-Auslastung, direkte Pflege von Zahler, Cap und Auto-Stopp. */
export function Werbebudgets() {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [konten, setKonten] = useState<Map<string, KontoInfo[]>>(new Map());
  const [zuo, setZuo] = useState<Zuordnung[]>([]);
  const [ein, setEin] = useState<Map<string, Eingezahlt>>(new Map());
  const [view, setView] = useState<KontoView[]>([]);
  const [spend, setSpend] = useState<Spend[]>([]);
  const [snap, setSnap] = useState<Snap[]>([]);
  const [zst, setZst] = useState<Map<string, WerbebudgetZahlungsstatus>>(new Map());
  const [details, setDetails] = useState<Map<string, { quelle?: string | null; lage?: string; zahlungen?: Zahlung[] }>>(new Map());
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [zeitraum, setZeitraum] = useState<Zeitraum>('monat');
  const [filter, setFilter] = useState<Filter>('alle');
  const [nurAktiv, setNurAktiv] = useState(true);

  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const [c, z, e, v, s, km, sp] = await Promise.all([
        supabase.from('clients').select('id, name, kundenstatus, ads_budget, werbebudget_pflicht, auto_stopp').is('deleted_at', null),
        (supabase.from as any)('werbebudget_zuordnung').select('client_id, meta_account_id, untermarke, typ, objekt_id, kampagne_id, objekt_name'),
        (supabase.from as any)('werbebudget_eingezahlt').select('*'),
        (supabase.from as any)('untermarke_werbebudget').select('meta_account_id, kontoname, art, eingezahlt, ausgegeben, letzte_aufladung, letzte_meta_zahlung, belege, kampagnen_aktiv, tagesbudget'),
        supabase.from('meta_campaign_snapshot').select('campaign_id, campaign_name, account_id, status, daily_budget'),
        ladeKontenJeKunde(),
        ladeSpend(),
      ]);
      for (const [n, r] of [['clients', c], ['werbebudget_zuordnung', z], ['werbebudget_eingezahlt', e], ['untermarke_werbebudget', v], ['meta_campaign_snapshot', s]] as const)
        if ((r as any).error) console.error(n, (r as any).error.message);
      const ks = ((c.data || []) as any[]).filter(k => k.name) as Kunde[];
      const zs0 = await ladeZahlungsstatus(ks.map(k => k.id));
      setKunden(ks); setKonten(km); setZuo((z.data || []) as Zuordnung[]);
      setEin(new Map(((e.data || []) as Eingezahlt[]).map(r => [r.client_id, r])));
      setView((v.data || []) as KontoView[]); setSnap((s.data || []) as Snap[]); setSpend(sp);
      setZst(zs0 as Map<string, WerbebudgetZahlungsstatus>);
    } catch (err) { setFehler((err as Error).message); }
    setLaedt(false);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const ladeDetails = useCallback(async (id: string) => {
    if (details.has(id)) return;
    const [q, l, zahlungen] = await Promise.all([
      (supabase.rpc as any)('kunde_buchhaltungsquelle', { p_client_id: id }),
      (supabase.rpc as any)('werbebudget_lage', { p_client_id: id }),
      ladeZahlungen(id),
    ]);
    if (q.error) console.error('kunde_buchhaltungsquelle', id, q.error.message);
    if (l.error) console.error('werbebudget_lage', id, l.error.message);
    setDetails(p => new Map(p).set(id, { quelle: q.error ? undefined : (q.data ?? null), lage: l.data || undefined, zahlungen }));
  }, [details]);

  /** Felder eines Kunden sofort speichern; optimistisch, bei Fehler zurück. */
  const speichern = useCallback(async (id: string, patch: Partial<Pick<Kunde, 'ads_budget' | 'werbebudget_pflicht' | 'auto_stopp'>>) => {
    const vorher = kunden.find(k => k.id === id);
    if (!vorher) return;
    setKunden(p => p.map(k => k.id === id ? { ...k, ...patch } : k));
    const { error } = await supabase.from('clients').update(patch as any).eq('id', id);
    if (error) {
      setKunden(p => p.map(k => k.id === id ? vorher : k));
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
    }
  }, [kunden]);

  const monatStart = zeitraumStart('monat')!;
  const zStart = zeitraumStart(zeitraum);

  /** Spend je zugeordnetem Objekt (Kampagne: alle ihre Adsets; Adset: nur dieses; ganzes Konto: alles). Auslastung immer laufender Monat. */
  const zeilen = useMemo(() => kunden.map(k => {
    const objs = zuo.filter(z => z.client_id === k.id);
    const kontoArten = (konten.get(k.id) || []).map(x => x.art || '');
    const untermarke = kontoArten.includes('untermarke');
    const traeger = wirksamerBudgetTraeger(kontoArten, k.werbebudget_pflicht);
    const gezaehlt = new Set<string>();
    let verbraucht = 0, monat = 0;
    const objekte = objs.map(o => {
      const treffer = spend.filter(r => o.typ === 'adset' ? r.adset_id === o.objekt_id : o.typ === 'kampagne' ? r.campaign_id === o.objekt_id : norm(r.meta_account_id) === norm(o.objekt_id || o.meta_account_id));
      let summe = 0;
      for (const r of treffer) {
        const imZ = !zStart || r.datum >= zStart;
        if (imZ) summe += Number(r.spend || 0);
        const key = `${r.adset_id}|${r.datum}`;
        if (gezaehlt.has(key)) continue;
        gezaehlt.add(key);
        if (imZ) verbraucht += Number(r.spend || 0);
        if (r.datum >= monatStart) monat += Number(r.spend || 0);
      }
      return { o, summe };
    });
    const budget = k.ads_budget != null && Number(k.ads_budget) > 0 ? Number(k.ads_budget) : null;
    const quote = budget ? monat / budget : null;
    return { k, objekte, verbraucht, monat, budget, quote, rest: budget != null ? budget - monat : null, traeger, untermarke };
  }).sort((a, b) => (a.quote == null ? 1 : 0) - (b.quote == null ? 1 : 0) || (b.quote ?? 0) - (a.quote ?? 0) || a.k.name.localeCompare(b.k.name)), [kunden, zuo, spend, konten, zStart, monatStart]);

  const sichtbar = useMemo(() => zeilen
    .filter(z => !nurAktiv || z.k.kundenstatus === 'In Betreuung')
    .filter(z => filter === 'alle' ? true : filter === 'uns' ? z.traeger === 'uns' : filter === 'kunde' ? z.traeger === 'kunde' : z.quote != null && z.quote >= 1), [zeilen, filter, nurAktiv]);

  const kontoIds = useMemo(() => new Set(sichtbar.flatMap(z => (konten.get(z.k.id) || []).map(x => norm(x.meta_account_id)))), [sichtbar, konten]);
  const summen = useMemo(() => {
    const vs = view.filter(v => kontoIds.has(norm(v.meta_account_id)));
    return { eingezahlt: vs.reduce((s, v) => s + Number(v.eingezahlt || 0), 0), ausgegeben: vs.reduce((s, v) => s + Number(v.ausgegeben || 0), 0), konten: vs.length };
  }, [view, kontoIds]);
  const ueberBudget = sichtbar.filter(z => z.quote != null && z.quote >= 1).length;

  /** Aktive Kampagnen auf Untermarken-Konten der angezeigten Kunden ohne jede Kundenzuordnung (live berechnet). */
  const ohneZuordnung = useMemo(() => {
    const artVon = new Map(view.map(v => [norm(v.meta_account_id), v.art]));
    const unter = new Set<string>();
    for (const z of sichtbar) for (const ki of konten.get(z.k.id) || []) {
      const id = norm(ki.meta_account_id);
      if ((ki.art || artVon.get(id)) === 'untermarke') unter.add(id);
    }
    const ganzeKonten = new Set(zuo.filter(z => z.typ === 'konto').map(z => norm(z.objekt_id || z.meta_account_id)));
    const kampagnen = new Set(zuo.filter(z => z.typ === 'kampagne').map(z => z.objekt_id));
    zuo.filter(z => z.typ === 'adset' && z.kampagne_id).forEach(z => kampagnen.add(z.kampagne_id!));
    const offene = snap.filter(s => s.status === 'ACTIVE' && unter.has(norm(s.account_id)) && !ganzeKonten.has(norm(s.account_id)) && !kampagnen.has(s.campaign_id));
    return { kampagnen: offene.length, konten: new Set(offene.map(s => norm(s.account_id))).size };
  }, [sichtbar, konten, view, zuo, snap]);

  if (laedt) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  const viewJe = new Map(view.map(v => [norm(v.meta_account_id), v]));
  const snapJe = new Map(snap.map(s => [s.campaign_id, s]));
  const ampel = (q: number | null) => q == null ? FARBE.grau : q >= 1 ? FARBE.rot : q >= 0.8 ? 'hsl(var(--warning))' : FARBE.gruen;
  const vLabel = `Verbraucht · ${ZEITRAUM_TEXT[zeitraum]}`;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Werbebudgets</h1>
          <p className="text-sm text-muted-foreground">Monatsbudget gegen Meta-Ausgaben, Auslastung immer für den laufenden Monat</p>
        </div>
        <Button variant="outline" size="sm" onClick={laden} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Aktualisieren</Button>
      </div>

      <Tabs value={zeitraum} onValueChange={v => setZeitraum(v as Zeitraum)}>
        <TabsList className="flex-wrap h-auto">
          {(Object.keys(ZEITRAUM_TEXT) as Zeitraum[]).map(z => <TabsTrigger key={z} value={z}>{ZEITRAUM_TEXT[z]}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {fehler && <p className="text-sm text-destructive">Fehler beim Laden: {fehler}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HealthKarte titel="Kunden über Budget" farbe={ueberBudget ? FARBE.rot : FARBE.gruen} wert={String(ueberBudget)} satz={`von ${sichtbar.length} Kunden haben ihr Monatsbudget im laufenden Monat erreicht oder überschritten.`} />
        <HealthKarte titel="Eingezahlt gesamt" farbe={FARBE.primaer} wert={eur(summen.eingezahlt)} satz={`Werbebudget-Zahlungen auf den ${summen.konten} Konten dieser Kunden.`} />
        <HealthKarte titel="Bei Meta ausgegeben gesamt" farbe={FARBE.grau} wert={eur(summen.ausgegeben)} satz="Tatsächlich an Meta gezahlt laut Zahlungsbelegen dieser Konten." />
      </div>

      {ohneZuordnung.kampagnen > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p>{ohneZuordnung.kampagnen} aktive Kampagnen auf {ohneZuordnung.konten} Konten sind keinem Kunden zugeordnet — deren Ausgaben fehlen in der Auswertung.{' '}
            <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 font-medium">Zur Zuordnung</Link></p>
        </div>
      )}

      {spend.length === 0 && <p className="text-xs text-muted-foreground">Es liegen noch keine Meta-Ausgaben vor — der Spend-Sync hat noch nicht geliefert. „Verbraucht" bleibt bis dahin 0 €.</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="alle">Alle</TabsTrigger>
              <TabsTrigger value="uns">Läuft über uns</TabsTrigger>
              <TabsTrigger value="kunde">Zahlt selbst</TabsTrigger>
              <TabsTrigger value="ueber">Über Budget</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Switch checked={nurAktiv} onCheckedChange={setNurAktiv} aria-label="Nur aktive Kunden" />
            Nur aktive Kunden
          </label>
        </div>

        <div className={`${HEALTH_KARTE} p-0 sm:p-0 overflow-hidden`}>
          <div className={`hidden md:grid ${GRID} gap-4 px-6 py-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground items-end`}>
            <span>Kunde</span><span>Zahler</span><span className="text-right">Monatsbudget</span><span className="text-right">{vLabel}</span><span className="text-right">Rest Monat</span><span className="text-right">Auslastung Monat</span><span className="text-right">Stoppen</span>
          </div>
          {sichtbar.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">Keine Kunden für diesen Filter.</p>}
          {sichtbar.map(z => {
            const auf = offen.has(z.k.id);
            const umschalten = () => { setOffen(p => { const n = new Set(p); auf ? n.delete(z.k.id) : n.add(z.k.id); return n; }); if (!auf) ladeDetails(z.k.id); };
            const stoppGrund = z.budget == null ? 'Erst ein Monatsbudget hinterlegen' : z.traeger !== 'uns' ? 'Nur möglich, wenn das Budget über uns läuft' : null;
            return (
              <div key={z.k.id} className="border-t border-border/60">
                <div className={`grid grid-cols-2 ${GRID} gap-x-4 gap-y-2 px-6 py-3 items-center hover:bg-muted/30 transition-colors`}>
                  <button type="button" aria-expanded={auf} onClick={umschalten} className="col-span-2 md:col-span-1 flex items-start gap-1.5 font-medium text-left min-w-0">
                    {auf ? <ChevronDown className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />}
                    <span className="break-words">{z.k.name}</span>
                  </button>
                  <ZahlerSchalter wir={z.traeger === 'uns'} gesperrt={z.untermarke} onChange={wir => speichern(z.k.id, { werbebudget_pflicht: wir })} />
                  <BudgetFeld wert={z.k.ads_budget} onSave={n => speichern(z.k.id, { ads_budget: n })} />
                  <span className="md:text-right text-sm">
                    {z.objekte.length === 0 ? (
                      <Link to="/kunden/verknuepfungen" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">keine Kampagne zugeordnet</Link>
                    ) : (<>
                      <span className="md:hidden text-xs text-muted-foreground mr-1">Verbraucht</span>
                      <span className="tabular-nums">{eur(z.verbraucht)}</span>
                    </>)}
                  </span>
                  <span className={`md:text-right tabular-nums text-sm ${z.rest != null && z.rest < 0 ? 'text-destructive' : ''}`}><span className="md:hidden text-xs text-muted-foreground mr-1">Rest</span>{z.rest != null ? eur(z.rest) : '—'}</span>
                  <span className="flex items-center md:justify-end gap-2 text-sm tabular-nums">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: ampel(z.quote) }} />
                    {z.quote != null ? `${Math.round(z.quote * 100)} %` : <span className="text-xs text-muted-foreground">kein Budget hinterlegt</span>}
                  </span>
                  <span className="flex md:justify-end items-center gap-2">
                    <span className="md:hidden text-xs text-muted-foreground">Bei Überschreitung stoppen</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span><Switch aria-label="Bei Überschreitung stoppen" checked={!stoppGrund && z.k.auto_stopp} disabled={!!stoppGrund} onCheckedChange={v => speichern(z.k.id, { auto_stopp: v })} /></span>
                      </TooltipTrigger>
                      <TooltipContent>{stoppGrund || 'Bei Überschreitung stoppen'}</TooltipContent>
                    </Tooltip>
                  </span>
                </div>
                {auf && (
                  <div className="bg-muted/20 px-4 sm:px-6 py-4 space-y-4">
                    <KontoBlock ks={konten.get(z.k.id) || []} viewJe={viewJe} />
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Zugeordnete Kampagnen und Anzeigengruppen</CardTitle></CardHeader>
                      <CardContent>
                        {z.objekte.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Diesem Kunden ist keine Kampagne und keine Anzeigengruppe zugeordnet — sein Verbrauch wird nicht erfasst.{' '}
                            <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 text-foreground">Zur Zuordnung</Link>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead>Name</TableHead><TableHead>Ebene</TableHead><TableHead>Status</TableHead>
                              <TableHead className="text-right">{vLabel}</TableHead><TableHead className="text-right">Tagesbudget</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {z.objekte.map(({ o, summe }) => {
                                const camp = o.typ === 'kampagne' ? snapJe.get(o.objekt_id) : o.typ === 'adset' && o.kampagne_id ? snapJe.get(o.kampagne_id) : undefined;
                                const kontoCamps = o.typ === 'konto' ? snap.filter(s => norm(s.account_id) === norm(o.objekt_id || o.meta_account_id)) : [];
                                const status = o.typ === 'konto' ? (kontoCamps.some(s => s.status === 'ACTIVE') ? 'ACTIVE' : kontoCamps.length ? 'PAUSED' : null) : camp?.status ?? null;
                                const tb = o.typ === 'kampagne' ? (camp?.daily_budget != null ? camp.daily_budget / 100 : null)
                                  : o.typ === 'konto' ? (kontoCamps.some(s => s.status === 'ACTIVE' && s.daily_budget != null) ? kontoCamps.filter(s => s.status === 'ACTIVE').reduce((s, c) => s + Number(c.daily_budget || 0), 0) / 100 : null) : null;
                                return (
                                  <TableRow key={`${o.typ}-${o.objekt_id}`}>
                                    <TableCell className="break-words">{o.objekt_name || camp?.campaign_name || o.objekt_id}</TableCell>
                                    <TableCell><Badge variant="outline">{o.typ === 'konto' ? 'Ganzes Konto' : o.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'}</Badge></TableCell>
                                    <TableCell>
                                      {status == null ? <span className="text-xs text-muted-foreground">unbekannt</span>
                                        : status === 'ACTIVE' ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15" variant="outline" title={o.typ === 'adset' ? 'Status der Kampagne' : undefined}>aktiv</Badge>
                                        : <Badge variant="secondary" title={o.typ === 'adset' ? 'Status der Kampagne' : undefined}>pausiert</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{eur(summe)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{tb != null ? eur(tb) : '—'}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                    <ZahlungenBlock e={ein.get(z.k.id)} d={details.get(z.k.id)} zst={zst.get(z.k.id)} ks={konten.get(z.k.id) || []} viewJe={viewJe} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

function ZahlerSchalter({ wir, gesperrt, onChange }: { wir: boolean; gesperrt: boolean; onChange: (wir: boolean) => void }) {
  const knopf = (aktiv: boolean, text: string, wert: boolean) => (
    <button type="button" disabled={gesperrt} aria-pressed={aktiv} onClick={() => !aktiv && onChange(wert)}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors disabled:cursor-not-allowed ${aktiv ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{text}</button>
  );
  const el = (
    <span className={`inline-flex rounded-lg bg-muted p-0.5 w-fit ${gesperrt ? 'opacity-60' : ''}`}>
      {knopf(wir, 'Wir', true)}{knopf(!wir, 'Kunde', false)}
    </span>
  );
  if (!gesperrt) return el;
  return <Tooltip><TooltipTrigger asChild>{el}</TooltipTrigger><TooltipContent>Untermarken-Konto — läuft immer über uns</TooltipContent></Tooltip>;
}

function BudgetFeld({ wert, onSave }: { wert: number | null; onSave: (n: number | null) => void }) {
  const zuText = (n: number | null) => n != null && Number(n) > 0 ? Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '';
  const [text, setText] = useState(zuText(wert));
  useEffect(() => { setText(zuText(wert)); }, [wert]);
  const sichern = () => {
    const t = text.trim();
    const n = t === '' ? null : Number(t.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.'));
    if (n != null && (!Number.isFinite(n) || n < 0)) { toast.error('Bitte einen gültigen Betrag eingeben'); setText(zuText(wert)); return; }
    if ((n ?? null) === (wert != null && Number(wert) > 0 ? Number(wert) : null)) { setText(zuText(wert)); return; }
    onSave(n);
  };
  return (
    <div className="relative md:ml-auto w-full md:w-[8.5rem]">
      <Input aria-label="Monatsbudget" inputMode="decimal" value={text} placeholder="kein Budget" onChange={e => setText(e.target.value)} onBlur={sichern}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(zuText(wert)); } }}
        className="h-8 pr-6 text-right tabular-nums text-sm" />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">{label}</p><div className="text-sm break-words">{children}</div></div>;
}

function KontoBlock({ ks, viewJe }: { ks: KontoInfo[]; viewJe: Map<string, KontoView> }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Konto</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {ks.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Kein Meta-Konto verknüpft.</div> : ks.map((k, i) => {
          const v = viewJe.get(norm(k.meta_account_id));
          const art = k.art || v?.art || 'unbekannt';
          return (
            <div key={k.meta_account_id} className="space-y-4">
              {i > 0 && <Separator />}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Feld label="Kontoname">{k.konto_name || v?.kontoname || '—'}</Feld>
                <Feld label="Konto-Art"><Badge variant={art === 'untermarke' ? 'default' : 'outline'}>{ART_TEXT[art] || art}</Badge></Feld>
                <Feld label="Kontonummer"><span className="tabular-nums">{norm(k.meta_account_id)}</span></Feld>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ZahlungenBlock({ e, d, zst, ks, viewJe }: { e?: Eingezahlt; d?: { quelle?: string | null; lage?: string; zahlungen?: Zahlung[] }; zst?: WerbebudgetZahlungsstatus; ks: KontoInfo[]; viewJe: Map<string, KontoView> }) {
  const zahlungen = d?.zahlungen;
  const summe = (zahlungen || []).reduce((s, z) => s + z.betrag, 0);
  const vs = ks.map(k => viewJe.get(norm(k.meta_account_id))).filter(Boolean) as KontoView[];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Zahlungen</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!d ? <Skeleton className="h-16" /> : zahlungen && zahlungen.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Rechnung</TableHead><TableHead className="text-right">Betrag (netto)</TableHead></TableRow></TableHeader>
            <TableBody>
              {zahlungen.map((z, i) => (
                <TableRow key={`${z.nummer}-${i}`}>
                  <TableCell className="tabular-nums">{datum(z.datum)}</TableCell>
                  <TableCell className="text-muted-foreground">{z.nummer || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(z.betrag)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter><TableRow><TableCell colSpan={2}>Summe</TableCell><TableCell className="text-right tabular-nums">{eur(summe)}</TableCell></TableRow></TableFooter>
          </Table>
        ) : <div className="rounded-lg border border-dashed p-4"><OhneBetrag zst={zst} quelle={d.quelle} /></div>}

        {(e?.aelteste_ueberfaellig || !!e?.rechnungen_offen || d?.lage) && (
          <div className="flex flex-wrap gap-2">
            {!!e?.rechnungen_offen && <Badge variant="outline" className="tabular-nums">{e.rechnungen_offen} Rechnungen offen · {eur(Number(e.offen_netto || 0))}</Badge>}
            {e?.aelteste_ueberfaellig && <Badge variant="destructive" className="tabular-nums">überfällig seit {datum(e.aelteste_ueberfaellig)}</Badge>}
            {d?.lage && <Badge variant={d.lage === 'fehlt_obwohl_pflicht' ? 'destructive' : 'secondary'}>Einordnung: {LAGE_TEXT[d.lage] || d.lage}</Badge>}
          </div>
        )}

        {vs.length > 0 && <>
          <Separator />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Feld label="Belege"><span className="tabular-nums">{vs.reduce((s, v) => s + Number(v.belege || 0), 0)}</span></Feld>
            <Feld label="Aktive Kampagnen"><span className="tabular-nums">{vs.reduce((s, v) => s + Number(v.kampagnen_aktiv || 0), 0)}</span></Feld>
            <Feld label="Zuletzt aufgeladen"><span className="tabular-nums">{maxDatum(vs.map(v => v.letzte_aufladung))}</span></Feld>
            <Feld label="Zuletzt an Meta gezahlt"><span className="tabular-nums">{maxDatum(vs.map(v => v.letzte_meta_zahlung))}</span></Feld>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}

const maxDatum = (xs: (string | null)[]) => { const m = xs.filter(Boolean).sort().pop(); return m ? datum(m) : '—'; };

/** Begründung, warum kein eingezahlter Betrag vorliegt — nie geschätzt. */
function OhneBetrag({ zst, quelle }: { zst?: WerbebudgetZahlungsstatus; quelle?: string | null }) {
  if (quelle === 'lexoffice') return <span className="text-sm text-muted-foreground">lexoffice liefert keine Rechnungspositionen — Werbebudget hier nicht ermittelbar</span>;
  if (zst === 'keine_zahlungsverknuepfung' || quelle === null) return <Link to="/kunden/verknuepfungen" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">keine Buchhaltungsverknüpfung</Link>;
  if (zst === 'verknuepft_ohne_werbebudgetposten') return <span className="text-sm text-muted-foreground" title={OHNE_POSTEN_TOOLTIP}>kein Werbebudget-Posten auf den Rechnungen</span>;
  return <span className="text-sm text-muted-foreground">Keine bezahlten Werbebudget-Zahlungen gefunden.</span>;
}
