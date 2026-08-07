import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

import { ArrowUpDown, Info } from 'lucide-react';
import { formatValue } from '@/lib/utils';

/* ---------- Status-Konstanten (Close Pipeline "Sales") ---------- */
const S = {
  EG_GEBUCHT: 'EG: Gebucht',
  EG_NO_SHOW: 'EG: No-Show',
  EG_OHNE_ZG: 'EG: Geführt, kein ZG Terminiert',
  ZG_GEBUCHT: 'ZG: Gebucht',
  ZG_NO_SHOW: 'ZG: No-Show',
  ZG_OFFEN: 'ZG: Geführt, nicht abgeschlossen',
  FB_GEBUCHT: 'FB: Gebucht',
  WON: 'Won',
  UNQUALIFIZIERT: 'Unqualifiziert',
};
const ERREICHT_OUTCOMES = [
  'An VZ gescheitert',
  'Entscheider erreicht – EG terminiert',
  'Entscheider erreicht – kein Termin',
];

type Preset = 'woche' | 'monat' | 'quartal' | 'frei';

function rangeFor(preset: Preset, from: string, to: string) {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (preset === 'woche') {
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
  } else if (preset === 'monat') {
    start.setDate(1);
  } else if (preset === 'quartal') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  } else {
    return {
      start: from ? new Date(from + 'T00:00:00') : new Date('2000-01-01'),
      end: to ? new Date(to + 'T23:59:59') : end,
    };
  }
  return { start, end };
}

const pct = (n: number | null) => (n == null || !isFinite(n) ? '–' : `${(n * 100).toFixed(1)}%`);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      <Info className="h-5 w-5" />
      {text}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 tabular-nums">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function SalesKPI() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [economics, setEconomics] = useState<any[]>([]);
  const [myName, setMyName] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>('monat');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kanal, setKanal] = useState('all');
  const [dealTyp, setDealTyp] = useState('Neukunde Core');
  const [rep, setRep] = useState('all');
  const [sortKey, setSortKey] = useState('won');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, sc, l, o, e] = await Promise.all([
        (supabase as any).from('sales_calls').select('user_id,user_name,outcome_label,date_created').limit(50000),
        (supabase as any).from('sales_status_changes').select('lead_id,opportunity_id,user_id,user_name,new_status_label,pipeline_name,date_changed').eq('pipeline_name', 'Sales').limit(50000),
        (supabase as any).from('sales_leads').select('id,kanal,campaign_name,date_created').limit(50000),
        (supabase as any).from('sales_opportunities').select('*').limit(20000),
        (supabase as any).from('v_sales_economics').select('*').limit(5000),
      ]);
      setCalls(c.data || []);
      setChanges(sc.data || []);
      setLeads(l.data || []);
      setOpps(o.data || []);
      setEconomics(e.data || []);

      if (user?.email) {
        const { data: t } = await (supabase as any).from('team').select('name').ilike('email', user.email).maybeSingle();
        setMyName(t?.name || null);
      }
      setLoading(false);
    };
    load();
  }, [user?.email]);

  const { start, end } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const inRange = (d: string | null) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };

  const leadById = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);
  const oppById = useMemo(() => new Map(opps.map(o => [o.id, o])), [opps]);

  const kanalOptions = useMemo(
    () => Array.from(new Set(leads.map(l => l.kanal).filter(Boolean))).sort(),
    [leads],
  );
  const dealTypOptions = useMemo(
    () => Array.from(new Set(opps.map(o => o.deal_typ).filter(Boolean))).sort(),
    [opps],
  );
  const reps = useMemo(() => {
    const m = new Map<string, string>();
    changes.forEach(c => { if (c.user_id) m.set(c.user_id, c.user_name || c.user_id); });
    calls.forEach(c => { if (c.user_id) m.set(c.user_id, c.user_name || c.user_id); });
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [changes, calls]);

  /* --- gefilterte Basisdaten --- */
  const fChanges = useMemo(() => changes.filter(c => {
    if (!inRange(c.date_changed)) return false;
    if (rep !== 'all' && c.user_id !== rep) return false;
    if (kanal !== 'all' && (leadById.get(c.lead_id)?.kanal || null) !== kanal) return false;
    if (dealTyp !== 'all') {
      const o = c.opportunity_id ? oppById.get(c.opportunity_id) : null;
      if (o && o.deal_typ !== dealTyp) return false;
    }
    return true;
  }), [changes, start, end, rep, kanal, dealTyp, leadById, oppById]);

  const fCalls = useMemo(() => calls.filter(c => inRange(c.date_created) && (rep === 'all' || c.user_id === rep)),
    [calls, start, end, rep]);

  const fOpps = useMemo(() => opps.filter(o => {
    const d = o.date_won || o.date_created;
    if (!inRange(d)) return false;
    if (dealTyp !== 'all' && o.deal_typ !== dealTyp) return false;
    if (kanal !== 'all' && (leadById.get(o.lead_id)?.kanal || null) !== kanal) return false;
    if (rep !== 'all' && o.user_id !== rep && o.closer_id !== rep) return false;
    return true;
  }), [opps, start, end, dealTyp, kanal, rep, leadById]);

  const countStatus = (rows: any[], label: string) => rows.filter(r => r.new_status_label === label).length;

  const funnelOf = (rows: any[], callRows: any[]) => {
    const brutto = callRows.length;
    const erreicht = callRows.filter(c => ERREICHT_OUTCOMES.includes(c.outcome_label)).length;
    const egVereinbart = countStatus(rows, S.EG_GEBUCHT);
    const egNoShow = countStatus(rows, S.EG_NO_SHOW);
    const egOhneZg = countStatus(rows, S.EG_OHNE_ZG);
    const zgGebucht = countStatus(rows, S.ZG_GEBUCHT);
    const zgNoShow = countStatus(rows, S.ZG_NO_SHOW);
    const zgOffen = countStatus(rows, S.ZG_OFFEN);
    const fbGebucht = countStatus(rows, S.FB_GEBUCHT);
    const won = countStatus(rows, S.WON);
    const egGefuehrt = egOhneZg + zgGebucht;
    const zgGefuehrt = zgOffen + fbGebucht + won;
    return {
      brutto, erreicht, erreichbarkeit: ratio(erreicht, brutto),
      egVereinbart, egGefuehrt, zgGebucht, zgGefuehrt, won,
      egNoShowRate: ratio(egNoShow, egNoShow + egGefuehrt),
      egZuZg: ratio(zgGebucht, egGefuehrt),
      zgNoShowRate: ratio(zgNoShow, zgNoShow + zgGefuehrt),
      closeRate: ratio(won, zgGefuehrt),
      unqualifiziert: countStatus(rows, S.UNQUALIFIZIERT),
    };
  };

  /* --- TAB 1: Mein Tag --- */
  const myRepId = useMemo(() => {
    if (!myName) return null;
    const hit = reps.find(r => r.name.toLowerCase().trim() === myName.toLowerCase().trim());
    return hit?.id || null;
  }, [myName, reps]);

  const myBuckets = useMemo(() => {
    if (!myRepId) return null;
    const now = new Date();
    const mk = (p: Preset) => {
      const r = rangeFor(p, '', '');
      const inR = (d: string | null) => !!d && new Date(d).getTime() >= r.start.getTime() && new Date(d).getTime() <= r.end.getTime();
      const cs = changes.filter(c => c.user_id === myRepId && inR(c.date_changed));
      const cl = calls.filter(c => c.user_id === myRepId && inR(c.date_created));
      return funnelOf(cs, cl);
    };
    const today = () => {
      const s = new Date(now); s.setHours(0, 0, 0, 0);
      const inR = (d: string | null) => !!d && new Date(d).getTime() >= s.getTime();
      return funnelOf(
        changes.filter(c => c.user_id === myRepId && inR(c.date_changed)),
        calls.filter(c => c.user_id === myRepId && inR(c.date_created)),
      );
    };
    return { heute: today(), woche: mk('woche'), monat: mk('monat') };
  }, [myRepId, changes, calls]);

  /* --- TAB 2: Kanal --- */
  const perKanal = useMemo(() => {
    const list = kanalOptions.length ? kanalOptions : [];
    return list.map(k => {
      const rows = fChanges.filter(c => (leadById.get(c.lead_id)?.kanal || null) === k);
      const f = funnelOf(rows, []);
      const leadCount = leads.filter(l => l.kanal === k && inRange(l.date_created)).length;
      const eco = economics.filter(e => e.kanal === k && new Date(e.woche).getTime() >= start.getTime() && new Date(e.woche).getTime() <= end.getTime());
      const spend = eco.reduce((s, e) => s + Number(e.spend || 0), 0);
      const wonDeals = fOpps.filter(o => o.status_type === 'won' && (leadById.get(o.lead_id)?.kanal || null) === k);
      const cac = wonDeals.length > 0 && spend > 0 ? spend / wonDeals.length : null;
      return { kanal: k, leads: leadCount, spend, cac, ...f };
    });
  }, [kanalOptions, fChanges, leads, economics, fOpps, leadById, start, end]);

  /* --- TAB 3: Team --- */
  const perRep = useMemo(() => reps.map(r => {
    const rows = fChanges.filter(c => c.user_id === r.id);
    const cl = fCalls.filter(c => c.user_id === r.id);
    return { ...r, ...funnelOf(rows, cl) };
  }).filter(r => r.brutto > 0 || r.egVereinbart > 0 || r.won > 0), [reps, fChanges, fCalls]);

  const sortedReps = useMemo(() => {
    const arr = [...perRep];
    arr.sort((a: any, b: any) => {
      const va = a[sortKey] ?? -1, vb = b[sortKey] ?? -1;
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [perRep, sortKey, sortAsc]);

  const toggleSort = (k: string) => { if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(false); } };

  /* --- TAB 4: Kohorten --- */
  const kohorten = useMemo(() => {
    const m = new Map<string, { monat: string; deals: number; volumen: number; churn: number; laufzeitSum: number; laufzeitN: number }>();
    opps.filter(o => o.status_type === 'won')
      .filter(o => dealTyp === 'all' || o.deal_typ === dealTyp)
      .filter(o => kanal === 'all' || (leadById.get(o.lead_id)?.kanal || null) === kanal)
      .filter(o => rep === 'all' || o.closer_id === rep || o.user_id === rep)
      .forEach(o => {
        const d = o.date_won || o.date_created;
        if (!d) return;
        const key = new Date(d).toISOString().slice(0, 7);
        const e = m.get(key) || { monat: key, deals: 0, volumen: 0, churn: 0, laufzeitSum: 0, laufzeitN: 0 };
        e.deals++;
        e.volumen += Number(o.value_cents || 0) / 100;
        if (o.churn_datum) e.churn++;
        if (o.laufzeit) { e.laufzeitSum += Number(o.laufzeit); e.laufzeitN++; }
        m.set(key, e);
      });
    return Array.from(m.values()).sort((a, b) => b.monat.localeCompare(a.monat));
  }, [opps, dealTyp, kanal, rep, leadById]);

  const hasAnyData = calls.length + changes.length + leads.length + opps.length > 0;

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Sales KPI" description="Funnel, Quoten und Kohorten aus dem Sales-Close-Account." size="lg" />

      {/* Globale Filter */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Zeitraum</p>
            <Select value={preset} onValueChange={v => setPreset(v as Preset)}>
              <SelectTrigger className="w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="woche">Diese Woche</SelectItem>
                <SelectItem value="monat">Dieser Monat</SelectItem>
                <SelectItem value="quartal">Dieses Quartal</SelectItem>
                <SelectItem value="frei">Frei</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === 'frei' && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Von</p>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px] text-xs" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Bis</p>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px] text-xs" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Kanal</p>
            <Select value={kanal} onValueChange={setKanal}>
              <SelectTrigger className="w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kanäle</SelectItem>
                {kanalOptions.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Deal-Typ</p>
            <Select value={dealTyp} onValueChange={setDealTyp}>
              <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Neukunde Core">Neukunde Core</SelectItem>
                <SelectItem value="all">Alle Deal-Typen</SelectItem>
                {dealTypOptions.filter(d => d !== 'Neukunde Core').map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Rep</p>
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Reps</SelectItem>
                {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!hasAnyData && <Empty text="Noch keine Sales-Daten vorhanden. Starte den Sales-Sync unter Integrationen." />}

      <Tabs defaultValue="meintag">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="meintag">Mein Tag</TabsTrigger>
          <TabsTrigger value="kanal">Kanal</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="kohorten">Kohorten</TabsTrigger>
        </TabsList>

        {/* TAB 1 */}
        <TabsContent value="meintag" className="mt-4 space-y-6">
          {!myBuckets ? (
            <Empty text={myName
              ? `Für „${myName}" wurden im Sales-Close-Account noch keine Aktivitäten gefunden.`
              : 'Dein Profil konnte keinem Sales-Rep zugeordnet werden.'} />
          ) : (
            (['heute', 'woche', 'monat'] as const).map(k => {
              const b = myBuckets[k];
              const label = k === 'heute' ? 'Heute' : k === 'woche' ? 'Diese Woche' : 'Dieser Monat';
              return (
                <div key={k} className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Kpi label="Dials" value={formatValue(b.brutto, 'number', false)} />
                    <Kpi label="Erreichbarkeit" value={pct(b.erreichbarkeit)} sub={`${b.erreicht} erreicht`} />
                    <Kpi label="EGs vereinbart" value={formatValue(b.egVereinbart, 'number', false)} />
                    <Kpi label="ZGs" value={formatValue(b.zgGebucht, 'number', false)} />
                    <Kpi label="Won" value={formatValue(b.won, 'number', false)} />
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* TAB 2 */}
        <TabsContent value="kanal" className="mt-4">
          {perKanal.length === 0 ? <Empty text="Keine Kanal-Daten im gewählten Zeitraum." /> : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              {perKanal.map(k => (
                <Card key={k.kanal}>
                  <CardHeader className="pb-2"><CardTitle className="text-base">{k.kanal}</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm tabular-nums">
                    {[
                      ['Leads', formatValue(k.leads, 'number', false)],
                      ['EG vereinbart', formatValue(k.egVereinbart, 'number', false)],
                      ['EG geführt', formatValue(k.egGefuehrt, 'number', false)],
                      ['ZG geführt', formatValue(k.zgGefuehrt, 'number', false)],
                      ['Won', formatValue(k.won, 'number', false)],
                      ['EG No-Show', pct(k.egNoShowRate)],
                      ['EG → ZG', pct(k.egZuZg)],
                      ['Close Rate', pct(k.closeRate)],
                      ['Ad Spend', k.spend > 0 ? formatValue(k.spend, 'currency', false) : '–'],
                      ['CAC', k.cac ? formatValue(k.cac, 'currency', false) : '–'],
                    ].map(([l, v]) => (
                      <div key={l as string} className="flex justify-between border-b border-border/50 pb-1 last:border-0">
                        <span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 3 */}
        <TabsContent value="team" className="mt-4">
          {sortedReps.length === 0 ? <Empty text="Keine Rep-Daten im gewählten Zeitraum." /> : (
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  {[
                    ['name', 'Rep'], ['brutto', 'Dials'], ['erreichbarkeit', 'Erreichbarkeit'],
                    ['egVereinbart', 'EG vereinbart'], ['egGefuehrt', 'EG geführt'],
                    ['zgGefuehrt', 'ZG geführt'], ['won', 'Won'], ['closeRate', 'Close Rate'],
                  ].map(([k, l]) => (
                    <TableHead key={k}>
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k as string)}>
                        {l}<ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    </TableHead>
                  ))}
                </TableRow></TableHeader>
                <TableBody>
                  {sortedReps.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="tabular-nums">{formatValue(r.brutto, 'number', false)}</TableCell>
                      <TableCell className="tabular-nums">{pct(r.erreichbarkeit)}</TableCell>
                      <TableCell className="tabular-nums">{formatValue(r.egVereinbart, 'number', false)}</TableCell>
                      <TableCell className="tabular-nums">{formatValue(r.egGefuehrt, 'number', false)}</TableCell>
                      <TableCell className="tabular-nums">{formatValue(r.zgGefuehrt, 'number', false)}</TableCell>
                      <TableCell className="tabular-nums font-medium">{formatValue(r.won, 'number', false)}</TableCell>
                      <TableCell className="tabular-nums">{pct(r.closeRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent></Card>
          )}
        </TabsContent>

        {/* TAB 4 */}
        <TabsContent value="kohorten" className="mt-4">
          {kohorten.length === 0 ? <Empty text="Keine gewonnenen Deals für die aktuelle Filterauswahl." /> : (
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Monat</TableHead><TableHead>Deals</TableHead><TableHead>Volumen</TableHead>
                  <TableHead>Ø Deal</TableHead><TableHead>Churn</TableHead><TableHead>Ø Laufzeit</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {kohorten.map(k => (
                    <TableRow key={k.monat}>
                      <TableCell className="font-medium">{k.monat}</TableCell>
                      <TableCell className="tabular-nums">{k.deals}</TableCell>
                      <TableCell className="tabular-nums">{formatValue(k.volumen, 'currency', false)}</TableCell>
                      <TableCell className="tabular-nums">{formatValue(k.deals ? k.volumen / k.deals : 0, 'currency', false)}</TableCell>
                      <TableCell className="tabular-nums">{k.churn} ({pct(ratio(k.churn, k.deals))})</TableCell>
                      <TableCell className="tabular-nums">{k.laufzeitN ? `${(k.laufzeitSum / k.laufzeitN).toFixed(1)} Mon.` : '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
