import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SalesKPI from './SalesKPI';
import { SalesCloseAbschluesse } from './SalesUebersicht';

// Sheet columns (Tagesdaten), taken exactly as named in the sheet.
const SPALTEN = ['Dials', 'Leads_neu', 'Leads_erreicht_T0', 'EG_gebucht', 'EG_gefuehrt_kein_ZG', 'EG_noshow', 'EG_abgesagt', 'ZG_gebucht', 'ZG_gefuehrt', 'ZG_noshow', 'ZG_abgesagt', 'FB_gebucht', 'Won', 'Lost', 'Unqualifiziert', 'Gespraeche_30', 'Gespraeche_60', 'Gespraechszeit_Min', 'StL_Anzahl', 'StL_Summe_Min'] as const;
type Spalte = typeof SPALTEN[number];
type Tag = { datum: string; kanal: string; user_name: string; werte: Record<string, unknown> | null } & Record<Spalte | 'EG_gefuehrt', number>;
const zahl = (v: unknown) => { if (v == null) return 0; let x = String(v).trim(); if (!x) return 0; if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); const n = Number(x.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const toTag = (r: any): Tag => {
  const t: any = { datum: r.datum, kanal: r.kanal, user_name: r.user_name, werte: r.werte };
  SPALTEN.forEach(k => { t[k] = zahl(r.werte?.[k]); });
  t.EG_gefuehrt = t.EG_gefuehrt_kein_ZG + t.ZG_gebucht; // derived: an EG with a ZG booked afterwards took place
  return t;
};
type Won = { status_geaendert_am: string | null; abschlusswert: number | null; quelle: string };
type Bestand = { datum: string; kanal: string; bestand: number | null };
type Lauf = { gestartet_am: string; beendet_am: string | null; status: string; fehler: string | null; verworfen: Record<string, number>; unbekannte_kanaele: string[] };
type Abgang = { schluessel: string; datum: string | null; grund: string | null; kanal: string | null };
type Zeitraum = '7' | '30' | 'jahr' | 'gesamt';
type Metric = Spalte | 'EG_gefuehrt';

const ZEITRAUM: { v: Zeitraum; l: string }[] = [{ v: '7', l: '7 Tage' }, { v: '30', l: '30 Tage' }, { v: 'jahr', l: 'Dieses Jahr' }, { v: 'gesamt', l: 'Gesamt' }];
const KANAELE = [
  { key: 'ads', label: 'Ads', color: 'hsl(var(--kanal-ads))', match: /^(meta|paid)?\s*ads?$|werbe/i },
  { key: 'coldcall', label: 'Cold Call', color: 'hsl(var(--kanal-coldcall))', match: /cold/i },
  { key: 'organisch', label: 'Website / Organisch', color: 'hsl(var(--kanal-organisch))', match: /website|organ/i },
  { key: 'attentionx', label: 'AttentionX Tool', color: 'hsl(var(--kanal-attentionx))', match: /attention/i },
  { key: 'direkt', label: 'Direktbuchung', color: 'hsl(var(--kanal-direkt))', match: /direkt/i },
];
const kanalOf = (k: string) => KANAELE.find(c => c.match.test(k.trim()));
const fmtN = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
const fmtE = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
const iso = (d: Date) => d.toISOString().slice(0, 10);

function ranges(z: Zeitraum, first: string | null) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const end = iso(today); // sheet holds previous-day values; include everything up to today
  let start: Date;
  if (z === '7' || z === '30') { start = new Date(today); start.setUTCDate(start.getUTCDate() - Number(z) + 1); }
  else if (z === 'jahr') start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  else start = new Date((first || end) + 'T00:00:00Z');
  const len = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  const pEnd = new Date(start); pEnd.setUTCDate(pEnd.getUTCDate() - 1);
  const pStart = new Date(pEnd); pStart.setUTCDate(pStart.getUTCDate() - len + 1);
  return { start: iso(start), end, pStart: iso(pStart), pEnd: iso(pEnd), vergleich: z !== 'gesamt' };
}
const sum = (rows: Tag[], m: Metric) => rows.reduce((a, r) => a + (r[m] || 0), 0);
const NICHT_GEWERTET = /^inbound$/i;

function Delta({ cur, prev, steigtGut = true, show }: { cur: number; prev: number; steigtGut?: boolean; show: boolean }) {
  if (!show) return <span className="text-muted-foreground">kein Vorzeitraum</span>;
  if (prev > 0 && prev < 5) return <span className="text-muted-foreground">zu wenig Daten für einen Vergleich</span>;
  if (!prev) return <span className="text-muted-foreground">{cur ? 'Vorzeitraum ohne Werte – kein Vergleich' : 'unverändert'}</span>;
  const p = ((cur - prev) / prev) * 100; const up = p > 0;
  const gut = p === 0 ? null : up === steigtGut;
  return <span className={gut == null ? 'text-muted-foreground' : gut ? 'text-success' : 'text-destructive'}>{up ? '+' : ''}{p.toFixed(1).replace('.', ',')} % zum Vorzeitraum</span>;
}

function Kachel({ titel, wert, sub, delta, quelle }: { titel: string; wert: string; sub?: React.ReactNode; delta?: React.ReactNode; quelle?: string }) {
  return (
    <Card className="border-0 shadow-none bg-muted/40">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground">{titel}</p>
        <p className="text-4xl font-semibold tabular-nums tracking-tight mt-1">{wert}</p>
        {sub && <p className="text-sm tabular-nums text-muted-foreground mt-0.5">{sub}</p>}
        {delta && <p className="text-xs tabular-nums mt-2">{delta}</p>}
        {quelle && <p className="text-xs text-muted-foreground mt-1">{quelle}</p>}
      </CardContent>
    </Card>
  );
}

const tooltip = { contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, color: 'hsl(var(--popover-foreground))' }, cursor: { stroke: 'hsl(var(--border))' } };

function Verlauf({ data, color, id, euro }: { data: { datum: string; v: number }[]; color: string; id: string; euro?: boolean }) {
  if (data.length < 2) return <p className="text-sm text-muted-foreground py-12 text-center">{data.length ? `Erst ein Datenpunkt (${fmtD(data[0].datum)}: ${euro ? fmtE(data[0].v) : fmtN(data[0].v)}) – Verlauf folgt` : 'Keine Werte im Zeitraum'}</p>;
  const wenig = data.length < 8;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
        <XAxis dataKey="datum" tickFormatter={fmtD} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={44} allowDecimals={false} tickFormatter={v => euro ? `${Math.round(v / 1000)}k` : fmtN(v)} />
        <Tooltip {...tooltip} labelFormatter={l => new Date(l + 'T00:00:00').toLocaleDateString('de-DE')} formatter={(v: number) => [euro ? fmtE(v) : fmtN(v), '']} separator="" />
        <Area type={data.length < 21 ? 'linear' : 'monotone'} dataKey="v" stroke={color} strokeWidth={2} strokeLinecap="round" fill={`url(#${id})`} dot={wenig ? { r: 2.5, fill: color, strokeWidth: 0 } : false} activeDot={{ r: 3 }} animationDuration={500} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Zeile({ l, v, title }: { l: string; v: string; title?: string }) {
  return <div className="flex justify-between gap-3" title={title}><span className={`text-muted-foreground ${title ? 'underline decoration-dotted underline-offset-2 cursor-help' : ''}`}>{l}</span><span className="text-right">{v}</span></div>;
}

export default function SalesOverview() {
  const [tage, setTage] = useState<Tag[]>([]);
  const [bestand, setBestand] = useState<Bestand[]>([]);
  const [abg, setAbg] = useState<Abgang[]>([]);
  const [won, setWon] = useState<Won[]>([]);
  const [loading, setLoading] = useState(true);
  const [z, setZ] = useState<Zeitraum>('30');
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0);
  const jetzt = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('sales-sheet-sync', { body: {} });
    setSyncing(false);
    if (error) { const d = error instanceof FunctionsHttpError ? await error.context.text() : error.message; let m = d; try { m = JSON.parse(d).error ?? d; } catch { /* plain */ } toast.error(`Abgleich fehlgeschlagen: ${m}`); }
    else toast.success(`Abgleich fertig · ${data?.zeilen?.tagesdaten ?? 0} Tageszeilen aktualisiert`);
    setTick(t => t + 1);
  };

  useEffect(() => {
    (async () => {
      const [t, b, a, w, l] = await Promise.all([
        supabase.from('sales_tagesdaten').select('datum, kanal, user_name, werte').order('datum').limit(50000),
        supabase.from('sales_bestand').select('datum, kanal, bestand').order('datum').limit(20000),
        supabase.from('sales_abgaenge').select('schluessel, datum, grund, kanal').limit(20000),
        supabase.from('close_abschluesse_alle').select('status_geaendert_am, abschlusswert, quelle').eq('status_typ', 'won').is('dublette_von', null).limit(10000),
        supabase.from('sales_sheet_sync_laeufe').select('gestartet_am, beendet_am, status, fehler, verworfen, unbekannte_kanaele').order('gestartet_am', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setLauf((l.data as Lauf) ?? null);
      setWon((w.data as Won[]) || []); setTage(((t.data as any[]) || []).map(toTag)); setBestand((b.data as Bestand[]) || []); setAbg((a.data as Abgang[]) || []); setLoading(false);
    })();
  }, [tick]);

  const r = useMemo(() => ranges(z, tage[0]?.datum ?? null), [z, tage]);
  const cur = tage.filter(t => t.datum >= r.start && t.datum <= r.end);
  const prev = tage.filter(t => t.datum >= r.pStart && t.datum <= r.pEnd);
  const hatDaten = tage.length > 0;
  const S = (m: Metric) => sum(cur, m); const P = (m: Metric) => sum(prev, m);
  const umsatzIn = (a: string, b: string) => won.filter(x => { const d = x.status_geaendert_am?.slice(0, 10); return d && d >= a && d <= b; }).reduce((s, x) => s + (Number(x.abschlusswert) || 0), 0);
  const umsatz = umsatzIn(r.start, r.end), umsatzPrev = umsatzIn(r.pStart, r.pEnd);
  const abgAlle = abg.filter(a => a.datum && a.datum >= r.start && a.datum <= r.end);
  const abgCur = abgAlle.filter(a => !(a.kanal && NICHT_GEWERTET.test(a.kanal.trim())));
  const abgPrev = abg.filter(a => a.datum && a.datum >= r.pStart && a.datum <= r.pEnd && !(a.kanal && NICHT_GEWERTET.test(a.kanal.trim())));

  const serie = (m: Metric) => {
    const by = new Map<string, number>(); cur.forEach(t => by.set(t.datum, (by.get(t.datum) || 0) + (t[m] || 0)));
    return [...by.entries()].sort().map(([datum, v]) => ({ datum, v }));
  };
  const kanalRows = KANAELE.map(k => {
    const rows = cur.filter(t => kanalOf(t.kanal)?.key === k.key);
    return { ...k, dials: sum(rows, 'Dials'), eg: sum(rows, 'EG_gebucht'), zg: sum(rows, 'ZG_gebucht'), won: sum(rows, 'Won'), abg: abgCur.filter(a => a.kanal && kanalOf(a.kanal)?.key === k.key).length };
  });
  const inboundTage = cur.filter(t => NICHT_GEWERTET.test(t.kanal.trim()));
  const inboundAbg = abgAlle.filter(a => a.kanal && NICHT_GEWERTET.test(a.kanal.trim())).length;
  const tageImZeitraum = Math.round((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86400000) + 1;
  // Quote chain starts at EG gebucht: each stage is a real subset of the previous one. FB is optional and gets no quote.
  const funnel: { l: string; v: number; spalte: string; optional?: boolean; keineQuote?: boolean; hinweis?: string }[] = [
    { l: 'EG gebucht', v: S('EG_gebucht'), spalte: 'EG_gebucht' },
    { l: 'EG geführt¹', v: S('EG_gefuehrt'), spalte: 'EG_gefuehrt_kein_ZG + ZG_gebucht' },
    { l: 'ZG gebucht', v: S('ZG_gebucht'), spalte: 'ZG_gebucht' },
    { l: 'ZG geführt', v: S('ZG_gefuehrt'), spalte: 'ZG_gefuehrt' },
    { l: 'FB gebucht', v: S('FB_gebucht'), spalte: 'FB_gebucht', optional: true },
    { l: 'Won²', v: S('Won'), spalte: 'Won', keineQuote: tageImZeitraum < 30, hinweis: tageImZeitraum < 30 ? 'Quote erst ab 30 Tagen' : undefined },
  ];
  // Speed to Lead: mean over all leads, median over daily averages
  const stlTage = (() => { const m = new Map<string, [number, number]>(); cur.forEach(t => { const x = m.get(t.datum) || [0, 0]; m.set(t.datum, [x[0] + t.StL_Summe_Min, x[1] + t.StL_Anzahl]); }); return [...m.values()].filter(([, n]) => n > 0).map(([s, n]) => s / n).sort((a, b) => a - b); })();
  const stlMedian = stlTage.length ? (stlTage.length % 2 ? stlTage[(stlTage.length - 1) / 2] : (stlTage[stlTage.length / 2 - 1] + stlTage[stlTage.length / 2]) / 2) : null;
  const hm = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${m} min` : `${m} min`; };
  const gruende = useMemo(() => {
    const m = new Map<string, number>(); abgCur.forEach(a => { const g = a.grund?.trim() || 'ohne Grund'; m.set(g, (m.get(g) || 0) + 1); });
    return [...m.entries()].map(([grund, n]) => ({ grund, n })).sort((a, b) => b.n - a.n);
  }, [abgCur]);
  const mitGrund = abgCur.filter(a => a.grund?.trim()).length;
  const bestandSerie = useMemo(() => {
    const m = new Map<string, number>(); bestand.filter(b => b.bestand != null && b.datum >= r.start && b.datum <= r.end).forEach(b => m.set(b.datum, (m.get(b.datum) || 0) + Number(b.bestand)));
    return [...m.entries()].sort().map(([datum, v]) => ({ datum, v }));
  }, [bestand, r]);
  const verworfenSumme = lauf ? Object.values(lauf.verworfen || {}).reduce((a, b) => a + (Number(b) || 0), 0) : 0;

  const pct = (a: number, b: number) => b ? `${((a / b) * 100).toFixed(1).replace('.', ',')} %` : '–';

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Übersicht</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Google Sheet des Slack-Reports #s-kpi{hatDaten ? ` · Daten ab ${new Date(tage[0].datum).toLocaleDateString('de-DE')}` : ''}{lauf ? ` · letzter Abgleich ${new Date(lauf.beendet_am ?? lauf.gestartet_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${lauf.status === 'fehler' ? ' (fehlgeschlagen)' : lauf.status === 'laeuft' ? ' (läuft)' : ''}` : ''}</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 rounded-full text-xs gap-1.5" onClick={jetzt} disabled={syncing}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />Jetzt aktualisieren</Button>
        <div className="inline-flex rounded-full bg-muted p-1">
          {ZEITRAUM.map(o => <Button key={o.v} size="sm" variant={z === o.v ? 'default' : 'ghost'} className="h-7 rounded-full px-3 text-xs" onClick={() => setZ(o.v)}>{o.l}</Button>)}
        </div>
      </div>

      {lauf?.status === 'fehler' && <p className="text-xs text-destructive">Letzter Abgleich fehlgeschlagen: {lauf.fehler}</p>}
      {verworfenSumme > 0 && <p className="text-xs text-muted-foreground">Hinweis: {verworfenSumme} Zeile(n) im Sheet ohne lesbares Datum wurden nicht übernommen ({Object.entries(lauf!.verworfen).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(', ')}).</p>}
      {!!lauf?.unbekannte_kanaele?.filter(k => !NICHT_GEWERTET.test(k)).length && <p className="text-xs text-muted-foreground">Hinweis: Kanal {lauf.unbekannte_kanaele.filter(k => !NICHT_GEWERTET.test(k)).map(k => `„${k}“`).join(', ')} im Sheet passt zu keinem der fünf Kanäle und wird im Kanalvergleich nicht gezählt.</p>}
      {loading ? <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        : !hatDaten ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Noch keine Daten</p>
            <p className="text-xs text-muted-foreground mt-1">Die Kennzahlen erscheinen, sobald n8n die Daten aus dem KPI-Sheet hierher mitliefert.</p>
          </CardContent></Card>
        ) : <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Kachel titel="Dials" wert={fmtN(S('Dials'))} delta={<Delta cur={S('Dials')} prev={P('Dials')} show={r.vergleich} />} />
            <Kachel titel="Erstgespräche gebucht" wert={fmtN(S('EG_gebucht'))} sub={`davon geführt ${fmtN(S('EG_gefuehrt'))}¹`} delta={<Delta cur={S('EG_gebucht')} prev={P('EG_gebucht')} show={r.vergleich} />} />
            <Kachel titel="Zweitgespräche gebucht" wert={fmtN(S('ZG_gebucht'))} sub={`davon geführt ${fmtN(S('ZG_gefuehrt'))}`} delta={<Delta cur={S('ZG_gebucht')} prev={P('ZG_gebucht')} show={r.vergleich} />} />
            <Kachel titel="Abschlüsse" wert={fmtN(S('Won'))} sub={`Umsatz geschrieben ${fmtE(umsatz)}²`} delta={<Delta cur={S('Won')} prev={P('Won')} show={r.vergleich} />} quelle="Abschlüsse: Sheet (Won) · ² Umsatz: Close, gewonnene Abschlüsse beider Accounts nach Gewinndatum, ohne Dubletten" />
          </div>

          <p className="text-xs font-medium text-muted-foreground pt-2">Qualität im Setting</p>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
            <Kachel titel="EG No-Show-Quote" wert={pct(S('EG_noshow'), S('EG_gebucht'))} sub={`${fmtN(S('EG_noshow'))} von ${fmtN(S('EG_gebucht'))} gebucht`} />
            <Kachel titel="EG Absage-Quote" wert={pct(S('EG_abgesagt'), S('EG_gebucht'))} sub={`${fmtN(S('EG_abgesagt'))} von ${fmtN(S('EG_gebucht'))} gebucht`} />
            <Kachel titel="ZG No-Show-Quote" wert={pct(S('ZG_noshow'), S('ZG_gebucht'))} sub={`${fmtN(S('ZG_noshow'))} von ${fmtN(S('ZG_gebucht'))} gebucht`} />
            <Kachel titel="ZG Absage-Quote" wert={pct(S('ZG_abgesagt'), S('ZG_gebucht'))} sub={`${fmtN(S('ZG_abgesagt'))} von ${fmtN(S('ZG_gebucht'))} gebucht`} />
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <Card className="border-0 shadow-none bg-muted/40"><CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Gesprächszeit</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm tabular-nums">
                <Zeile l="Gesprächszeit gesamt" v={`${fmtN(S('Gespraechszeit_Min'))} Min`} />
                <Zeile l="Gespräche > 30 Sek." v={`${fmtN(S('Gespraeche_30'))} · ${pct(S('Gespraeche_30'), S('Dials'))} der Dials`} />
                <Zeile l="Gespräche > 60 Sek." v={`${fmtN(S('Gespraeche_60'))} · ${pct(S('Gespraeche_60'), S('Dials'))} der Dials`} />
                <Zeile l="Ø Gesprächszeit je Dial" v={S('Dials') ? `${(S('Gespraechszeit_Min') / S('Dials') * 60).toFixed(0)} Sek.` : '–'} />
              </CardContent></Card>
            <Card className="border-0 shadow-none bg-muted/40"><CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Leads & Reaktion</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm tabular-nums">
                <Zeile l="Neue Leads" v={fmtN(S('Leads_neu'))} title="Leads_neu" />
                <Zeile l="Am selben Tag erreicht" title="Leads_erreicht_T0 ÷ Leads_neu" v={`${fmtN(S('Leads_erreicht_T0'))} · ${pct(S('Leads_erreicht_T0'), S('Leads_neu'))}`} />
                <Zeile l="Speed to Lead Ø" v={S('StL_Anzahl') ? hm(S('StL_Summe_Min') / S('StL_Anzahl')) : '–'} title={`StL_Summe_Min ÷ StL_Anzahl = ${fmtN(S('StL_Summe_Min'))} ÷ ${fmtN(S('StL_Anzahl'))}`} />
                <Zeile l="Speed to Lead Median" v={stlMedian != null ? hm(stlMedian) : '–'} title={`Median der Tageswerte (StL_Summe_Min ÷ StL_Anzahl je Tag), ${stlTage.length} Tage`} />
                <p className="text-xs text-muted-foreground pt-1">Median über die Tageswerte, da das Sheet keine Einzelwerte je Lead enthält.</p>
                {S('StL_Anzahl') > 0 && S('StL_Anzahl') === S('Leads_erreicht_T0') && <p className="text-xs text-destructive pt-1"><code>StL_Anzahl</code> entspricht <code>Leads_erreicht_T0</code>. Der Mittelwert passt nicht zu einer Erreichbarkeit am selben Tag — Definition im Sheet prüfen.</p>}
              </CardContent></Card>
            <Card className="border-0 shadow-none bg-muted/40"><CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Verluste</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm tabular-nums">
                <Zeile l="Lost" v={fmtN(S('Lost'))} />
                <Zeile l="Unqualifiziert" v={fmtN(S('Unqualifiziert'))} />

              </CardContent></Card>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {([['Dials', 'Dials'], ['EG_gebucht', 'Erstgespräche gebucht'], ['ZG_gebucht', 'Zweitgespräche gebucht'], ['Won', 'Abschlüsse']] as [Metric, string][]).map(([m, l]) => (
              <Card key={m} className="border-0 shadow-none bg-muted/40"><CardHeader className="pb-0"><CardTitle className="text-sm font-medium">{l}</CardTitle></CardHeader>
                <CardContent className="pt-2"><Verlauf id={`g-${m}`} data={serie(m)} color="hsl(var(--primary))" /></CardContent></Card>
            ))}
          </div>

          <Card className="border-0 shadow-none bg-muted/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Kanäle im Vergleich</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {kanalRows.map(k => {
                const max = Math.max(1, ...kanalRows.map(x => x.eg));
                return (
                  <div key={k.key} className="grid grid-cols-[1fr] sm:grid-cols-[180px_1fr_auto] items-center gap-x-4 gap-y-1">
                    <span className="text-sm flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: k.color }} />{k.label}{k.key === 'coldcall' && <sup className="text-muted-foreground">*</sup>}</span>
                    <div className="h-2.5 rounded-full bg-background overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(k.eg / max) * 100}%`, background: k.color }} /></div>
                    <span className="text-xs tabular-nums text-muted-foreground">{fmtN(k.dials)} Dials · {fmtN(k.eg)} EG · {fmtN(k.zg)} ZG · {fmtN(k.won)} Won · {fmtN(k.abg)} Abgänge</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[1fr] sm:grid-cols-[180px_1fr_auto] items-center gap-x-4 gap-y-1 text-muted-foreground opacity-70">
                <span className="text-sm flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground" />Inbound</span>
                <span className="text-xs">nicht gewertet, wie im Slack-Report</span>
                <span className="text-xs tabular-nums">{fmtN(sum(inboundTage, 'Dials'))} Dials · {fmtN(sum(inboundTage, 'EG_gebucht'))} EG · {fmtN(inboundAbg)} Abgänge</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">Balken = Erstgespräche gebucht. Inbound zählt in keiner Summe. * Cold Call steht derzeit strukturell bei 0, weil Marcels Anrufe nicht in Close landen. Das ist bekannt und kein Messfehler.</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none bg-muted/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Funnel</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-3 pb-3 mb-1 border-b border-border/60 text-sm tabular-nums">
                <div title="Dials"><p className="text-xs text-muted-foreground">Dials</p><p className="font-medium">{fmtN(S('Dials'))}</p></div>
                <div title="Leads_erreicht_T0"><p className="text-xs text-muted-foreground">Leads erreicht</p><p className="font-medium">{fmtN(S('Leads_erreicht_T0'))}</p></div>
                <div title="Dials ÷ EG_gebucht"><p className="text-xs text-muted-foreground">Dials je gebuchtem EG</p><p className="font-medium">{S('EG_gebucht') ? `${(S('Dials') / S('EG_gebucht')).toFixed(1).replace('.', ',')} : 1` : '–'}</p></div>
                <p className="col-span-3 text-xs text-muted-foreground">Aufwand als Kontext, keine Funnelstufen. Dials je EG ist ein Verhältnis, keine Quote.</p>
              </div>
              {funnel.map((f, i) => {
                const vorher = [...funnel.slice(0, i)].reverse().find(x => !x.optional);
                const quote = i > 0 && !f.optional && !f.keineQuote && vorher ? pct(f.v, vorher.v) : null;
                return (
                  <div key={f.l} title={f.spalte} className={`grid grid-cols-[120px_1fr_auto] items-center gap-3 ${f.optional ? 'pl-3 border-l-2 border-dashed border-border' : ''}`}>
                    <span className="text-sm">{f.l}{f.optional && <span className="text-xs text-muted-foreground"> optional</span>}</span>
                    <div className={`h-3 rounded-full overflow-hidden ${f.optional ? 'border border-dashed border-border bg-transparent' : 'bg-background'}`}><div className={`h-full rounded-full transition-[width] duration-500 ${f.optional ? 'bg-primary/40' : 'bg-primary'}`} style={{ width: `${funnel[0].v ? Math.min(100, Math.max(f.v ? 1 : 0, (f.v / funnel[0].v) * 100)) : 0}%` }} /></div>
                    <span className="text-xs tabular-nums w-40 text-right">{fmtN(f.v)}{quote && <span className="text-muted-foreground"> · {quote}</span>}{f.hinweis && <span className="text-muted-foreground"> · {f.hinweis}</span>}</span>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Quote = Anteil der vorherigen Pflichtstufe. FB gebucht (Folgebesprechung) ist optional und ohne Quote, da viele Abschlüsse direkt im ZG fallen. ² Abschlüsse zählen am Tag des Gewinns, das zugehörige ZG kann Wochen davor liegen. ¹ EG geführt ist abgeleitet: EG_gefuehrt_kein_ZG + ZG_gebucht (wer ein ZG gebucht hat, hatte das EG). Wird das ZG an einem anderen Tag gebucht als das EG stattfand, verschiebt sich der Tageswert; über Zeiträume stimmt die Summe, am einzelnen Tag nicht immer.</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card className="border-0 shadow-none bg-muted/40">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Abgänge nach Grund</CardTitle>
                <p className="text-xs tabular-nums text-muted-foreground">{fmtN(abgCur.length)} Abgänge · Erfassungsquote {pct(mitGrund, abgCur.length)} · <Delta cur={abgCur.length} prev={abgPrev.length} steigtGut={false} show={r.vergleich} />{abgAlle.length > abgCur.length && ` · ${fmtN(abgAlle.length - abgCur.length)} Inbound nicht gewertet`}</p></CardHeader>
              <CardContent className="pt-3">
                {!abg.length ? <p className="text-sm text-muted-foreground py-6 text-center">Noch keine Daten</p> : !gruende.length ? <p className="text-sm text-muted-foreground py-6 text-center">Keine Abgänge im Zeitraum</p> : (
                  <ResponsiveContainer width="100%" height={Math.max(120, gruende.length * 34)}>
                    <BarChart data={gruende} layout="vertical" margin={{ left: 0, right: 16 }} barCategoryGap="35%">
                      <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="grund" width={130} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltip} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number) => [fmtN(v), 'Abgänge']} />
                      <Bar dataKey="n" fill="hsl(var(--destructive))" radius={[0, 6, 6, 0]} animationDuration={500} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-none bg-muted/40">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Bestand</CardTitle>
                {bestandSerie.length > 0 && <p className="text-xs tabular-nums text-muted-foreground">aktuell {fmtN(bestandSerie[bestandSerie.length - 1].v)} offene Leads (alle Kanäle, ohne Won/Upsell/Lost/Unqualifiziert/Ehemalig)</p>}</CardHeader>
              <CardContent className="pt-2">{bestandSerie.length ? <Verlauf id="g-bestand" data={bestandSerie} color="hsl(var(--kanal-organisch))" /> : <p className="text-sm text-muted-foreground py-6 text-center">Noch keine Daten</p>}</CardContent>
            </Card>
          </div>
        </>}

      <Collapsible>
        <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="gap-1 text-muted-foreground"><ChevronDown className="h-4 w-4" />Detailauswertungen aus Close (Abschlussliste, Mein Tag, Kanal, Team, Kohorten)</Button></CollapsibleTrigger>
        <CollapsibleContent className="space-y-8 pt-2">
          <p className="text-xs text-muted-foreground px-1">Arbeitsansichten direkt aus Close. Maßgeblich für die Kennzahlen oben ist die Quelle des Slack-Reports.</p>
          <SalesCloseAbschluesse />
          <SalesKPI />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
