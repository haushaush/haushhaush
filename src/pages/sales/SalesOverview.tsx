import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SalesKPI from './SalesKPI';
import { SalesCloseAbschluesse } from './SalesUebersicht';

type Tag = { datum: string; kanal: string; user_name: string; dials: number | null; eg_gebucht: number | null; eg_gefuehrt: number | null; zg_gebucht: number | null; zg_gefuehrt: number | null; abschluesse: number | null; umsatz: number | null };
type Bestand = { datum: string; bestand: number | null };
type Abgang = { schluessel: string; datum: string | null; grund: string | null };
type Zeitraum = '7' | '30' | 'jahr' | 'gesamt';
type Metric = 'dials' | 'eg_gebucht' | 'eg_gefuehrt' | 'zg_gebucht' | 'zg_gefuehrt' | 'abschluesse' | 'umsatz';

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
const sum = (rows: Tag[], m: Metric) => rows.reduce((a, r) => a + (Number(r[m]) || 0), 0);

function Delta({ cur, prev, steigtGut = true, show }: { cur: number; prev: number; steigtGut?: boolean; show: boolean }) {
  if (!show) return <span className="text-muted-foreground">kein Vorzeitraum</span>;
  if (!prev) return <span className="text-muted-foreground">Vorzeitraum ohne Werte</span>;
  const p = ((cur - prev) / prev) * 100; const up = p > 0;
  const gut = p === 0 ? null : up === steigtGut;
  return <span className={gut == null ? 'text-muted-foreground' : gut ? 'text-success' : 'text-destructive'}>{up ? '+' : ''}{p.toFixed(1).replace('.', ',')} % zum Vorzeitraum</span>;
}

function Kachel({ titel, wert, sub, delta }: { titel: string; wert: string; sub?: string; delta: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-none bg-muted/40">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground">{titel}</p>
        <p className="text-4xl font-semibold tabular-nums tracking-tight mt-1">{wert}</p>
        {sub && <p className="text-sm tabular-nums text-muted-foreground mt-0.5">{sub}</p>}
        <p className="text-xs tabular-nums mt-2">{delta}</p>
      </CardContent>
    </Card>
  );
}

const tooltip = { contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, color: 'hsl(var(--popover-foreground))' }, cursor: { stroke: 'hsl(var(--border))' } };

function Verlauf({ data, color, id, euro }: { data: { datum: string; v: number }[]; color: string; id: string; euro?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
        <XAxis dataKey="datum" tickFormatter={fmtD} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={44} tickFormatter={v => euro ? `${Math.round(v / 1000)}k` : fmtN(v)} />
        <Tooltip {...tooltip} labelFormatter={l => new Date(l + 'T00:00:00').toLocaleDateString('de-DE')} formatter={(v: number) => [euro ? fmtE(v) : fmtN(v), '']} separator="" />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} strokeLinecap="round" fill={`url(#${id})`} dot={false} activeDot={{ r: 3 }} animationDuration={500} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function SalesOverview() {
  const [tage, setTage] = useState<Tag[]>([]);
  const [bestand, setBestand] = useState<Bestand[]>([]);
  const [abg, setAbg] = useState<Abgang[]>([]);
  const [loading, setLoading] = useState(true);
  const [z, setZ] = useState<Zeitraum>('30');

  useEffect(() => {
    (async () => {
      const [t, b, a] = await Promise.all([
        supabase.from('sales_tagesdaten').select('datum, kanal, user_name, dials, eg_gebucht, eg_gefuehrt, zg_gebucht, zg_gefuehrt, abschluesse, umsatz').order('datum').limit(50000),
        supabase.from('sales_bestand').select('datum, bestand').order('datum').limit(5000),
        supabase.from('sales_abgaenge').select('schluessel, datum, grund').limit(20000),
      ]);
      setTage((t.data as Tag[]) || []); setBestand((b.data as Bestand[]) || []); setAbg((a.data as Abgang[]) || []); setLoading(false);
    })();
  }, []);

  const r = useMemo(() => ranges(z, tage[0]?.datum ?? null), [z, tage]);
  const cur = tage.filter(t => t.datum >= r.start && t.datum <= r.end);
  const prev = tage.filter(t => t.datum >= r.pStart && t.datum <= r.pEnd);
  const hatDaten = tage.length > 0;

  const serie = (m: Metric) => {
    const by = new Map<string, number>(); cur.forEach(t => by.set(t.datum, (by.get(t.datum) || 0) + (Number(t[m]) || 0)));
    return [...by.entries()].sort().map(([datum, v]) => ({ datum, v }));
  };
  const kanalRows = KANAELE.map(k => {
    const rows = cur.filter(t => kanalOf(t.kanal)?.key === k.key);
    return { ...k, dials: sum(rows, 'dials'), eg: sum(rows, 'eg_gebucht'), zg: sum(rows, 'zg_gebucht'), won: sum(rows, 'abschluesse'), umsatz: sum(rows, 'umsatz') };
  });
  const funnel = [
    { l: 'Dials', v: sum(cur, 'dials') }, { l: 'EG gebucht', v: sum(cur, 'eg_gebucht') }, { l: 'EG geführt', v: sum(cur, 'eg_gefuehrt') },
    { l: 'ZG gebucht', v: sum(cur, 'zg_gebucht') }, { l: 'ZG geführt', v: sum(cur, 'zg_gefuehrt') }, { l: 'Won', v: sum(cur, 'abschluesse') },
  ];
  const abgCur = abg.filter(a => a.datum && a.datum >= r.start && a.datum <= r.end);
  const abgPrev = abg.filter(a => a.datum && a.datum >= r.pStart && a.datum <= r.pEnd);
  const gruende = useMemo(() => {
    const m = new Map<string, number>(); abgCur.forEach(a => { const g = a.grund?.trim() || 'ohne Grund'; m.set(g, (m.get(g) || 0) + 1); });
    return [...m.entries()].map(([grund, n]) => ({ grund, n })).sort((a, b) => b.n - a.n);
  }, [abgCur]);
  const mitGrund = abgCur.filter(a => a.grund?.trim()).length;
  const bestandSerie = bestand.filter(b => b.bestand != null && b.datum >= r.start && b.datum <= r.end).map(b => ({ datum: b.datum, v: Number(b.bestand) }));

  const pct = (a: number, b: number) => b ? `${((a / b) * 100).toFixed(1).replace('.', ',')} %` : '–';

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Übersicht</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Dieselbe Quelle wie der tägliche Slack-Report in #s-kpi{hatDaten ? ` · Daten ab ${new Date(tage[0].datum).toLocaleDateString('de-DE')}` : ''}</p>
        </div>
        <div className="inline-flex rounded-full bg-muted p-1">
          {ZEITRAUM.map(o => <Button key={o.v} size="sm" variant={z === o.v ? 'default' : 'ghost'} className="h-7 rounded-full px-3 text-xs" onClick={() => setZ(o.v)}>{o.l}</Button>)}
        </div>
      </div>

      {loading ? <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        : !hatDaten ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Noch keine Daten</p>
            <p className="text-xs text-muted-foreground mt-1">Die Kennzahlen erscheinen, sobald n8n die Daten aus dem KPI-Sheet hierher mitliefert.</p>
          </CardContent></Card>
        ) : <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Kachel titel="Dials" wert={fmtN(sum(cur, 'dials'))} delta={<Delta cur={sum(cur, 'dials')} prev={sum(prev, 'dials')} show={r.vergleich} />} />
            <Kachel titel="Erstgespräche gebucht" wert={fmtN(sum(cur, 'eg_gebucht'))} sub={`davon geführt ${fmtN(sum(cur, 'eg_gefuehrt'))}`} delta={<Delta cur={sum(cur, 'eg_gebucht')} prev={sum(prev, 'eg_gebucht')} show={r.vergleich} />} />
            <Kachel titel="Zweitgespräche gebucht" wert={fmtN(sum(cur, 'zg_gebucht'))} sub={`davon geführt ${fmtN(sum(cur, 'zg_gefuehrt'))}`} delta={<Delta cur={sum(cur, 'zg_gebucht')} prev={sum(prev, 'zg_gebucht')} show={r.vergleich} />} />
            <Kachel titel="Abschlüsse" wert={fmtN(sum(cur, 'abschluesse'))} sub={`Umsatz geschrieben ${fmtE(sum(cur, 'umsatz'))}`} delta={<Delta cur={sum(cur, 'umsatz')} prev={sum(prev, 'umsatz')} show={r.vergleich} />} />
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {([['dials', 'Dials'], ['eg_gebucht', 'Erstgespräche gebucht'], ['zg_gebucht', 'Zweitgespräche gebucht'], ['umsatz', 'Umsatz geschrieben']] as [Metric, string][]).map(([m, l]) => (
              <Card key={m} className="border-0 shadow-none bg-muted/40"><CardHeader className="pb-0"><CardTitle className="text-sm font-medium">{l}</CardTitle></CardHeader>
                <CardContent className="pt-2"><Verlauf id={`g-${m}`} data={serie(m)} color="hsl(var(--primary))" euro={m === 'umsatz'} /></CardContent></Card>
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
                    <span className="text-xs tabular-nums text-muted-foreground">{fmtN(k.dials)} Dials · {fmtN(k.eg)} EG · {fmtN(k.zg)} ZG · {fmtN(k.won)} Won · {fmtE(k.umsatz)}</span>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1">Balken = Erstgespräche gebucht. * Cold Call steht derzeit strukturell bei 0, weil Marcels Anrufe nicht in Close landen. Das ist bekannt und kein Messfehler.</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none bg-muted/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Funnel</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {funnel.map((f, i) => (
                <div key={f.l} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
                  <span className="text-sm">{f.l}</span>
                  <div className="h-3 rounded-full bg-background overflow-hidden"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${funnel[0].v ? Math.max(1, (f.v / funnel[0].v) * 100) : 0}%` }} /></div>
                  <span className="text-xs tabular-nums w-36 text-right">{fmtN(f.v)}{i > 0 && <span className="text-muted-foreground"> · {pct(f.v, funnel[i - 1].v)}</span>}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">Quote = Anteil der vorherigen Stufe.</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card className="border-0 shadow-none bg-muted/40">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Abgänge nach Grund</CardTitle>
                <p className="text-xs tabular-nums text-muted-foreground">{fmtN(abgCur.length)} Abgänge · Erfassungsquote {pct(mitGrund, abgCur.length)} · <Delta cur={abgCur.length} prev={abgPrev.length} steigtGut={false} show={r.vergleich} /></p></CardHeader>
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
                {bestandSerie.length > 0 && <p className="text-xs tabular-nums text-muted-foreground">aktuell {fmtN(bestandSerie[bestandSerie.length - 1].v)}</p>}</CardHeader>
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
