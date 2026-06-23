import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { AlertTriangle, CheckCircle2, FlaskConical, Info } from 'lucide-react';
import { formatValue } from '@/lib/utils';
const eur = (n: number) => formatValue(n, 'currency');

type RangeKey = '7d' | '30d' | 'ytd' | 'all' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Letzte 7 Tage' },
  { key: '30d', label: 'Letzte 30 Tage' },
  { key: 'ytd', label: 'Dieses Jahr' },
  { key: 'all', label: 'Insgesamt' },
  { key: 'custom', label: 'Custom' },
];

// Mirrors SalesUebersicht.getPeriodStart EXACTLY (no upper bound)
function getOverviewStart(key: RangeKey, from?: string): Date | null {
  const now = new Date();
  if (key === 'all') return null;
  if (key === 'custom') return from ? new Date(from) : null;
  if (key === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (key === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (key === 'ytd') return new Date(now.getFullYear(), 0, 1);
  return null;
}

function getRange(key: RangeKey, from?: string, to?: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (key === 'all') return { from: null, to: null };
  if (key === 'custom') {
    return {
      from: from ? new Date(from) : null,
      to: to ? new Date(to + 'T23:59:59') : null,
    };
  }
  if (key === '7d') return { from: new Date(now.getTime() - 7 * 86400000), to: now };
  if (key === '30d') return { from: new Date(now.getTime() - 30 * 86400000), to: now };
  if (key === 'ytd') return { from: new Date(now.getFullYear(), 0, 1), to: now };
  return { from: null, to: null };
}

function inRange(d: string | null | undefined, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!d) return false;
  const t = new Date(d).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

function NotComputable({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground border border-dashed rounded-md p-3">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>Nicht berechenbar – {reason}</span>
    </div>
  );
}

function KpiCard({ title, value, sub, hint }: { title: string; value: React.ReactNode; sub?: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        {hint && <div className="text-[10px] text-muted-foreground/70 mt-2 italic">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const CONNECT_THRESHOLD_SEC = 30;

export default function CloseKpiTest() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opps, setOpps] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [acts, setActs] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [oppColumns, setOppColumns] = useState<string[]>([]);
  const [dealColumns, setDealColumns] = useState<string[]>([]);

  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [oRes, dRes, aRes, lRes] = await Promise.all([
          supabase.from('close_opportunities').select('*').limit(5000),
          supabase.from('close_deals').select('*').limit(5000),
          supabase.from('close_activities').select('*').limit(5000),
          supabase.from('close_leads').select('id,date_created,status_label').limit(5000),
        ]);
        if (oRes.error) throw oRes.error;
        setOpps(oRes.data || []);
        setDeals(dRes.data || []);
        setActs(aRes.data || []);
        setLeads(lRes.data || []);
        setOppColumns(oRes.data?.[0] ? Object.keys(oRes.data[0]) : []);
        setDealColumns(dRes.data?.[0] ? Object.keys(dRes.data[0]) : []);
      } catch (e: any) {
        setError(e?.message || 'Ladefehler');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { from, to } = useMemo(() => getRange(range, customFrom, customTo), [range, customFrom, customTo]);
  const overviewStart = useMemo(() => getOverviewStart(range, customFrom), [range, customFrom]);
  const dateLabel = useMemo(() => {
    if (range === 'all') return 'Insgesamt';
    if (range === 'custom') return `${customFrom || '…'} → ${customTo || '…'}`;
    return RANGE_OPTIONS.find(r => r.key === range)?.label || '';
  }, [range, customFrom, customTo]);

  // ============================================================
  // BLOCK A: "Sales-Übersicht-Logik" — exakt nachgebaut wie /sales
  // close_opportunities, status_type='won', date_won (NO fallback),
  // KEIN Dedup, count = .length, value = sum(abschlusswert || 0)
  // ============================================================
  const overviewWon = useMemo(() => {
    return opps.filter(o => {
      if (o.status_type !== 'won') return false;
      if (!o.date_won) return false;
      if (!overviewStart) return true;
      return new Date(o.date_won) >= overviewStart;
    });
  }, [opps, overviewStart]);
  const overviewRevenue = useMemo(
    () => overviewWon.reduce((s, o) => s + Number(o.abschlusswert || 0), 0),
    [overviewWon]
  );
  const overviewCount = overviewWon.length;

  // ============================================================
  // BLOCK B: KPI-Test-Logik (Diagnose)
  // mit Fallback date_updated + Dedup by ID
  // ============================================================
  const dateColUsed = 'date_won (Fallback: date_updated)';

  const wonOppsInRange = useMemo(() => {
    return opps.filter(o => {
      if (o.status_type !== 'won') return false;
      const d = o.date_won || o.date_updated;
      return inRange(d, from, to);
    });
  }, [opps, from, to]);

  const dedupedWon = useMemo(() => {
    const map = new Map<string, any>();
    for (const o of wonOppsInRange) {
      if (!map.has(o.id)) map.set(o.id, o);
    }
    return Array.from(map.values());
  }, [wonOppsInRange]);

  const wonWithValue = useMemo(() => dedupedWon.filter(o => Number(o.abschlusswert || 0) > 0), [dedupedWon]);
  const wonWithoutValue = useMemo(() => dedupedWon.filter(o => o.abschlusswert == null), [dedupedWon]);
  const wonZeroValue = useMemo(() => dedupedWon.filter(o => o.abschlusswert != null && Number(o.abschlusswert) === 0), [dedupedWon]);

  const sumBefore = useMemo(() => wonOppsInRange.reduce((s, o) => s + Number(o.abschlusswert || 0), 0), [wonOppsInRange]);
  const sumAfter = useMemo(() => dedupedWon.reduce((s, o) => s + Number(o.abschlusswert || 0), 0), [dedupedWon]);
  const countDeals = dedupedWon.length;
  const avgAll = countDeals > 0 ? sumAfter / countDeals : 0;
  const avgWithValue = wonWithValue.length > 0 ? sumAfter / wonWithValue.length : 0;

  // Vergleich Übersicht <-> KPI-Test
  const diffRevenue = sumAfter - overviewRevenue;
  const diffCount = countDeals - overviewCount;
  const matches = diffRevenue === 0 && diffCount === 0;

  // Sets für Detail-Tabelle: was ist nur in Übersicht? was nur in KPI-Test?
  const overviewIds = useMemo(() => new Set(overviewWon.map(o => o.id)), [overviewWon]);
  const kpiIds = useMemo(() => new Set(dedupedWon.map(o => o.id)), [dedupedWon]);
  const onlyInOverview = useMemo(() => overviewWon.filter(o => !kpiIds.has(o.id)), [overviewWon, kpiIds]);
  const onlyInKpi = useMemo(() => dedupedWon.filter(o => !overviewIds.has(o.id)), [dedupedWon, overviewIds]);

  // Doppelte IDs in der Übersichts-Quelle (zeigt Dedup-Effekt)
  const overviewDupeCount = useMemo(() => overviewWon.length - new Set(overviewWon.map(o => o.id)).size, [overviewWon]);

  // ===== Pipeline =====
  const oppsOpen = useMemo(() => opps.filter(o => o.status_type === 'active'), [opps]);
  const oppsWon = useMemo(() => opps.filter(o => o.status_type === 'won'), [opps]);
  const oppsLost = useMemo(() => opps.filter(o => o.status_type === 'lost'), [opps]);

  const pipelineValue = useMemo(() => oppsOpen.reduce((s, o) => s + Number(o.abschlusswert || 0), 0), [oppsOpen]);
  const hasConfidence = useMemo(() => oppsOpen.some(o => o.confidence != null && Number(o.confidence) > 0), [oppsOpen]);
  const pipelineWeighted = useMemo(
    () => hasConfidence ? oppsOpen.reduce((s, o) => s + Number(o.abschlusswert || 0) * (Number(o.confidence || 0) / 100), 0) : 0,
    [oppsOpen, hasConfidence]
  );

  // Stage-Gruppierung NUR für offene Pipeline
  const openStageGroups = useMemo(() => {
    const map = new Map<string, { stage: string; count: number; value: number; zeroValue: number }>();
    for (const o of oppsOpen) {
      const key = o.status_label || '–';
      const cur = map.get(key) || { stage: key, count: 0, value: 0, zeroValue: 0 };
      cur.count += 1;
      cur.value += Number(o.abschlusswert || 0);
      if (!o.abschlusswert || Number(o.abschlusswert) === 0) cur.zeroValue += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [oppsOpen]);

  // Won/Lost-Gruppen separat
  const wonLostGroups = useMemo(() => {
    const map = new Map<string, { stage: string; status: string; count: number; value: number }>();
    for (const o of [...oppsWon, ...oppsLost]) {
      const key = `${o.status_label || '–'}|${o.status_type}`;
      const cur = map.get(key) || { stage: o.status_label || '–', status: o.status_type, count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(o.abschlusswert || 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [oppsWon, oppsLost]);

  // ===== Sales Cycle =====
  const cycle = useMemo(() => {
    const leadById = new Map<string, any>();
    for (const l of leads) leadById.set(l.id, l);
    const days: number[] = [];
    let usedLeadDate = 0, usedOppDate = 0;
    for (const o of dedupedWon) {
      const won = o.date_won;
      if (!won) continue;
      const lead = leadById.get(o.lead_id);
      const startDate = lead?.date_created || o.date_created;
      if (!startDate) continue;
      if (lead?.date_created) usedLeadDate++; else usedOppDate++;
      const d = (new Date(won).getTime() - new Date(startDate).getTime()) / 86400000;
      if (d >= 0 && d < 5000) days.push(d);
    }
    return {
      avg: days.length > 0 ? days.reduce((s, d) => s + d, 0) / days.length : null,
      n: days.length,
      usedLeadDate,
      usedOppDate,
    };
  }, [dedupedWon, leads]);

  // ===== Aktivitäten =====
  const actsInRange = useMemo(() => acts.filter(a => inRange(a.date_created, from, to)), [acts, from, to]);
  const calls = useMemo(() => actsInRange.filter(a => a.activity_type === 'Call'), [actsInRange]);
  const meetings = useMemo(() => actsInRange.filter(a => a.activity_type === 'Meeting'), [actsInRange]);
  const connects = useMemo(() => calls.filter(c => Number(c.duration_seconds || 0) >= CONNECT_THRESHOLD_SEC), [calls]);
  const connectRate = calls.length > 0 ? (connects.length / calls.length) * 100 : 0;

  const userStats = useMemo(() => {
    const map = new Map<string, { user: string; dials: number; connects: number; meetings: number }>();
    for (const a of actsInRange) {
      const u = a.user_name || '–';
      const cur = map.get(u) || { user: u, dials: 0, connects: 0, meetings: 0 };
      if (a.activity_type === 'Call') {
        cur.dials++;
        if (Number(a.duration_seconds || 0) >= CONNECT_THRESHOLD_SEC) cur.connects++;
      }
      if (a.activity_type === 'Meeting') cur.meetings++;
      map.set(u, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.dials - a.dials);
  }, [actsInRange]);

  const closerStats = useMemo(() => {
    const map = new Map<string, { user: string; closes: number; revenue: number }>();
    for (const o of dedupedWon) {
      const u = o.user_name || '–';
      const cur = map.get(u) || { user: u, closes: 0, revenue: 0 };
      cur.closes++;
      cur.revenue += Number(o.abschlusswert || 0);
      map.set(u, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [dedupedWon]);

  // ===== Warnungen =====
  const warnings = useMemo(() => {
    const ws: string[] = [];
    const sumValue = oppsWon.reduce((s, o) => s + Number(o.value || 0), 0);
    const sumValueCents = oppsWon.reduce((s, o) => s + Number(o.value_cents || 0), 0);
    if (sumValueCents > sumValue * 50) ws.push('value_cents enthält Cent-Beträge (×100). Würde value_cents ohne /100 verwendet, wäre der Umsatz um Faktor 100 zu hoch.');
    if (wonWithoutValue.length > 0) ws.push(`${wonWithoutValue.length} Won-Opportunities im Zeitraum ohne abschlusswert (NULL).`);
    if (wonZeroValue.length > 0) ws.push(`${wonZeroValue.length} Won-Opportunities im Zeitraum mit abschlusswert = 0.`);
    const wonNoDate = oppsWon.filter(o => !o.date_won).length;
    if (wonNoDate > 0) ws.push(`${wonNoDate} Won-Opportunities ohne date_won (Sales-Übersicht würde diese ausschließen, KPI-Test nutzt Fallback date_updated).`);
    const ids = wonOppsInRange.map(o => o.id);
    const dupes = ids.length - new Set(ids).size;
    if (dupes > 0) ws.push(`${dupes} doppelte Opportunity-IDs im Zeitraum (dedupliziert).`);
    if (overviewDupeCount > 0) ws.push(`Sales-Übersicht zählt ${overviewDupeCount} doppelte Datensätze mit (dort kein Dedup) – dadurch ist deren Count höher.`);
    const extreme = dedupedWon.filter(o => Number(o.abschlusswert) > 500000 || Number(o.abschlusswert) < 0);
    if (extreme.length > 0) ws.push(`${extreme.length} Abschlüsse mit extrem hohem/negativem Wert.`);
    if (!matches) ws.push(`Abweichung zur Sales-Übersicht: ${diffCount > 0 ? '+' : ''}${diffCount} Deals, ${diffRevenue > 0 ? '+' : ''}${eur(diffRevenue)}.`);
    return ws;
  }, [oppsWon, wonOppsInRange, dedupedWon, wonWithoutValue, wonZeroValue, overviewDupeCount, matches, diffCount, diffRevenue]);

  const sourceCheck = useMemo(() => ({
    close_opportunities: { found: opps.length > 0, count: opps.length },
    close_deals: { found: deals.length > 0, count: deals.length },
    close_activities: { found: acts.length > 0, count: acts.length },
    close_leads: { found: leads.length > 0, count: leads.length },
  }), [opps, deals, acts, leads]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }
  if (error) return <div className="p-6 text-destructive">Fehler: {error}</div>;

  // Detail-Tabelle: Won Deals im Zeitraum (Vereinigung beider Logiken, mit Flags)
  const unionMap = new Map<string, any>();
  for (const o of overviewWon) unionMap.set(o.id, { ...o, _inOverview: true });
  for (const o of dedupedWon) {
    const existing = unionMap.get(o.id);
    if (existing) existing._inKpi = true;
    else unionMap.set(o.id, { ...o, _inKpi: true });
  }
  // markiere duplicate_id basierend auf wonOppsInRange-Rohzählung
  const rawIdCounts = new Map<string, number>();
  for (const o of wonOppsInRange) rawIdCounts.set(o.id, (rawIdCounts.get(o.id) || 0) + 1);
  const overviewIdCounts = new Map<string, number>();
  for (const o of overviewWon) overviewIdCounts.set(o.id, (overviewIdCounts.get(o.id) || 0) + 1);
  const detailRows = Array.from(unionMap.values()).map(o => ({
    ...o,
    _missing_abschlusswert: o.abschlusswert == null,
    _zero_abschlusswert: o.abschlusswert != null && Number(o.abschlusswert) === 0,
    _duplicate_id: (rawIdCounts.get(o.id) || 0) > 1 || (overviewIdCounts.get(o.id) || 0) > 1,
    _missing_date_won: !o.date_won,
  })).sort((a, b) => (new Date(b.date_won || b.date_updated || 0).getTime()) - (new Date(a.date_won || a.date_updated || 0).getTime()));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Close KPI Test</h1>
            <Badge variant="outline" className="text-xs">Diagnose</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Vergleicht die Sales-Übersicht mit einer transparenten Diagnose-Berechnung und erklärt jede Abweichung.
          </p>
        </div>
      </div>

      {/* Zeitraum-Filter */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map(opt => (
            <Button
              key={opt.key}
              variant={range === opt.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
          {range === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 w-auto" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 w-auto" />
            </div>
          )}
          <div className="ml-auto text-xs text-muted-foreground">Zeitraum: <span className="font-mono">{dateLabel}</span></div>
        </CardContent>
      </Card>

      {/* ===== ABGLEICH ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Abgleich mit Sales-Übersicht</h2>
        <Card className={matches ? 'border-emerald-500/40' : 'border-amber-500/50'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {matches ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Stimmt überein</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-amber-500" /> Abweichung erkannt</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kennzahl</TableHead>
                  <TableHead className="text-right">Sales-Übersicht</TableHead>
                  <TableHead className="text-right">KPI-Test</TableHead>
                  <TableHead className="text-right">Differenz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Umsatz geschrieben</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(overviewRevenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(sumAfter)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${diffRevenue === 0 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                    {diffRevenue === 0 ? '–' : `${diffRevenue > 0 ? '+' : ''}${eur(diffRevenue)}`}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Anzahl Abschlüsse</TableCell>
                  <TableCell className="text-right tabular-nums">{overviewCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{countDeals}</TableCell>
                  <TableCell className={`text-right tabular-nums ${diffCount === 0 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                    {diffCount === 0 ? '–' : `${diffCount > 0 ? '+' : ''}${diffCount}`}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="border rounded-md p-3 space-y-1">
                <div className="font-medium">Sales-Übersicht-Logik</div>
                <div className="text-muted-foreground font-mono">Quelle: close_opportunities</div>
                <div className="text-muted-foreground font-mono">Filter: status_type = 'won'</div>
                <div className="text-muted-foreground font-mono">Datumsfeld: date_won (kein Fallback)</div>
                <div className="text-muted-foreground font-mono">Wertfeld: abschlusswert (NULL → 0)</div>
                <div className="text-muted-foreground font-mono">Dedup: nein</div>
                <div className="text-muted-foreground font-mono">Zeitraum: ab {overviewStart ? overviewStart.toLocaleDateString('de-DE') : 'Anfang'}</div>
              </div>
              <div className="border rounded-md p-3 space-y-1">
                <div className="font-medium">KPI-Test-Logik</div>
                <div className="text-muted-foreground font-mono">Quelle: close_opportunities</div>
                <div className="text-muted-foreground font-mono">Filter: status_type = 'won'</div>
                <div className="text-muted-foreground font-mono">Datumsfeld: {dateColUsed}</div>
                <div className="text-muted-foreground font-mono">Wertfeld: abschlusswert</div>
                <div className="text-muted-foreground font-mono">Dedup: ja (nach Opportunity-ID)</div>
                <div className="text-muted-foreground font-mono">Zeitraum: {from ? from.toLocaleDateString('de-DE') : 'Anfang'} → {to ? to.toLocaleDateString('de-DE') : 'jetzt'}</div>
              </div>
            </div>

            {(onlyInOverview.length > 0 || onlyInKpi.length > 0) && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="border rounded-md p-3">
                  <div className="font-medium mb-1">Nur in Sales-Übersicht ({onlyInOverview.length})</div>
                  {onlyInOverview.length === 0 ? (
                    <div className="text-muted-foreground">–</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {onlyInOverview.slice(0, 10).map(o => (
                        <li key={o.id} className="font-mono text-[10px] flex justify-between gap-2">
                          <span className="truncate">{o.lead_name || o.id}</span>
                          <span className="text-muted-foreground">{eur(Number(o.abschlusswert || 0))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="border rounded-md p-3">
                  <div className="font-medium mb-1">Nur im KPI-Test ({onlyInKpi.length})</div>
                  {onlyInKpi.length === 0 ? (
                    <div className="text-muted-foreground">–</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {onlyInKpi.slice(0, 10).map(o => (
                        <li key={o.id} className="font-mono text-[10px] flex justify-between gap-2">
                          <span className="truncate">{o.lead_name || o.id}</span>
                          <span className="text-muted-foreground">{eur(Number(o.abschlusswert || 0))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Won-Logik transparent ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Won-Logik transparent</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard title="Won Deals gesamt (Zeitraum)" value={wonOppsInRange.length} sub="vor Dedup, inkl. Fallback-Datum" />
          <KpiCard title="Eindeutige Won-IDs" value={countDeals} sub="nach Dedup nach Opportunity-ID" />
          <KpiCard title="Mit abschlusswert > 0" value={wonWithValue.length} />
          <KpiCard title="Ohne abschlusswert (NULL)" value={wonWithoutValue.length} />
          <KpiCard title="abschlusswert = 0" value={wonZeroValue.length} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            title="Abschlüsse gesamt"
            value={countDeals}
            sub="zählt ALLE Won-Deals, auch ohne Wert"
          />
          <KpiCard
            title="Abschlüsse mit Wert"
            value={wonWithValue.length}
            sub="nur Deals mit abschlusswert > 0"
          />
          <KpiCard
            title="Abschlüsse ohne Wert"
            value={wonWithoutValue.length + wonZeroValue.length}
            sub={`NULL: ${wonWithoutValue.length} · 0 €: ${wonZeroValue.length}`}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <KpiCard
            title="Ø Auftragswert (gesamt)"
            value={countDeals > 0 ? eur(avgAll) : '–'}
            sub="Umsatz ÷ Abschlüsse gesamt"
          />
          <KpiCard
            title="Ø Auftragswert (mit Wertbasis)"
            value={wonWithValue.length > 0 ? eur(avgWithValue) : '–'}
            sub={`Umsatz ÷ ${wonWithValue.length} Abschlüsse mit Wert`}
          />
        </div>
      </section>

      {/* ===== Umsatz-Debug ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Umsatz-Debug</h2>
        <Card>
          <CardContent className="text-xs space-y-1 font-mono pt-4">
            <div>Quelle: <span className="text-foreground">close_opportunities</span></div>
            <div>Wertfeld: <span className="text-foreground">abschlusswert (numeric, EUR – keine Cent-Konvertierung)</span></div>
            <div>Datumsfeld: <span className="text-foreground">{dateColUsed}</span></div>
            <div>Filter: <span className="text-foreground">status_type = 'won'</span></div>
            <div className="pt-1 border-t mt-2">Rohdatensätze im Zeitraum: <span className="text-foreground">{wonOppsInRange.length}</span></div>
            <div>Nach Dedup: <span className="text-foreground">{dedupedWon.length}</span></div>
            <div>Summe abschlusswert (vor Dedup): <span className="text-foreground">{eur(sumBefore)}</span></div>
            <div>Summe abschlusswert (nach Dedup): <span className="text-foreground">{eur(sumAfter)}</span></div>
            <div>Summe value (Standardfeld, NICHT verwendet): <span className="text-foreground">{eur(wonOppsInRange.reduce((s, o) => s + Number(o.value || 0), 0))}</span></div>
            <div>Summe value_cents ÷ 100: <span className="text-foreground">{eur(wonOppsInRange.reduce((s, o) => s + Number(o.value_cents || 0), 0) / 100)}</span></div>
            <div className="text-muted-foreground pt-2">Cent-Konvertierung: nein. Warnung greift, falls value_cents ohne /100 genutzt würde.</div>
          </CardContent>
        </Card>
      </section>

      {/* ===== Detail-Tabelle Won Deals ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Won Deals im Zeitraum (Rohbasis)</h2>
        <Card>
          <CardContent className="overflow-x-auto pt-4">
            {detailRows.length === 0 ? (
              <div className="text-xs text-muted-foreground">Keine Datensätze.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Closer</TableHead>
                    <TableHead>date_won</TableHead>
                    <TableHead className="text-right">abschlusswert</TableHead>
                    <TableHead className="text-right">value</TableHead>
                    <TableHead className="text-right">value_cents/100</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quelle</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map(o => {
                    const flags: string[] = [];
                    if (o._missing_abschlusswert) flags.push('missing_abschlusswert');
                    if (o._zero_abschlusswert) flags.push('zero_abschlusswert');
                    if (o._duplicate_id) flags.push('duplicate_id');
                    if (o._missing_date_won) flags.push('missing_date_won');
                    const source =
                      o._inOverview && o._inKpi ? 'Beide'
                      : o._inOverview ? 'nur Übersicht'
                      : 'nur KPI-Test';
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{String(o.id).slice(0, 8)}…</TableCell>
                        <TableCell className="font-medium text-xs">{o.lead_name || '–'}</TableCell>
                        <TableCell className="text-xs">{o.user_name || '–'}</TableCell>
                        <TableCell className="text-xs">{o.date_won ? new Date(o.date_won).toLocaleDateString('de-DE') : <span className="text-amber-600">–</span>}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{o.abschlusswert == null ? <span className="text-amber-600">NULL</span> : eur(Number(o.abschlusswert))}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{o.value == null ? '–' : eur(Number(o.value))}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{o.value_cents == null ? '–' : eur(Number(o.value_cents) / 100)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{o.status_label || o.status_type || '–'}</Badge></TableCell>
                        <TableCell><Badge variant={source === 'Beide' ? 'secondary' : 'outline'} className="text-[10px]">{source}</Badge></TableCell>
                        <TableCell>
                          {flags.length === 0 ? <span className="text-[10px] text-muted-foreground">–</span> : (
                            <div className="flex flex-wrap gap-1">
                              {flags.map(f => <Badge key={f} variant="outline" className="text-[9px] border-amber-500/40 text-amber-600 dark:text-amber-400">{f}</Badge>)}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Pipeline ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pipeline & Funnel (offen vs. abgeschlossen)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            title="Pipeline-Wert (nur offen)"
            value={eur(pipelineValue)}
            sub={`${oppsOpen.length} aktive Opportunities · ohne Won/Lost`}
          />
          <KpiCard
            title="Pipeline gewichtet"
            value={hasConfidence ? eur(pipelineWeighted) : '–'}
            sub={hasConfidence ? 'mit confidence/100' : 'Gewichtete Pipeline nicht belastbar – keine Stage-Wahrscheinlichkeiten vorhanden.'}
          />
          <KpiCard
            title="Ø Sales-Cycle"
            value={cycle.avg != null ? `${cycle.avg.toFixed(1)} Tage` : '–'}
            sub={cycle.avg != null
              ? `Basis: ${cycle.n} Won Deals · Start: lead.date_created (Fallback opp.date_created) · Ende: date_won`
              : 'kein Won-Deal mit Start-Datum'}
            hint={cycle.avg != null ? `Lead-Date verwendet: ${cycle.usedLeadDate} · Opp-Date Fallback: ${cycle.usedOppDate}` : undefined}
          />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">Offene Pipeline nach Stage</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {openStageGroups.length === 0 ? (
              <div className="text-xs text-muted-foreground">Keine offenen Opportunities.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Anzahl</TableHead>
                    <TableHead className="text-right">Summe Abschlusswert</TableHead>
                    <TableHead className="text-right">Davon 0 € / NULL</TableHead>
                    <TableHead>Hinweis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openStageGroups.map((g, i) => {
                    const manyZero = g.count > 0 && g.zeroValue / g.count >= 0.5;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{g.stage}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(g.value)}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.zeroValue}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {manyZero ? 'Viele Opportunities in dieser Stage haben keinen gespeicherten Abschlusswert.' : '–'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Won / Lost (separat – nicht Teil der offenen Pipeline)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {wonLostGroups.length === 0 ? (
              <div className="text-xs text-muted-foreground">Keine Won/Lost-Opportunities.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Anzahl</TableHead>
                    <TableHead className="text-right">Summe Abschlusswert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wonLostGroups.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{g.stage}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{g.status}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(g.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Aktivitäten ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Aktivitäts-KPIs</h2>
        {acts.length === 0 ? (
          <NotComputable reason="close_activities ist leer." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <KpiCard title="Dials / Calls" value={calls.length} sub="Aktivitätstyp = Call" />
            <KpiCard
              title="Connect-Quote"
              value={`${connectRate.toFixed(1)}%`}
              sub={`Connects: ${connects.length} / ${calls.length}`}
              hint={`Heuristik: duration_seconds ≥ ${CONNECT_THRESHOLD_SEC}`}
            />
            <KpiCard title="Termine gesetzt" value={meetings.length} sub="Aktivitätstyp = Meeting" />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Setting / Show / Closing-Quote</CardTitle></CardHeader>
              <CardContent>
                <NotComputable reason="Keine Outcome-Felder in close_activities." />
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* ===== Team ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Team-Auswertung</h2>
        <Card>
          <CardHeader><CardTitle className="text-sm">Activity je User</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {userStats.length === 0 ? (
              <NotComputable reason="Keine Activity-Daten im Zeitraum." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User (Close)</TableHead>
                    <TableHead className="text-right">Dials</TableHead>
                    <TableHead className="text-right">Connects</TableHead>
                    <TableHead className="text-right">Connect-Quote</TableHead>
                    <TableHead className="text-right">Meetings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userStats.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{u.user}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.dials}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.connects}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.dials > 0 ? ((u.connects / u.dials) * 100).toFixed(1) + '%' : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.meetings}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Closer-Performance</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {closerStats.length === 0 ? (
              <NotComputable reason="Keine Won-Opportunities im Zeitraum mit user_name." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User (Close)</TableHead>
                    <TableHead className="text-right">Abschlüsse</TableHead>
                    <TableHead className="text-right">Ø Deal-Wert</TableHead>
                    <TableHead className="text-right">Umsatz geschrieben</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closerStats.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.user}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.closes}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.closes > 0 ? eur(c.revenue / c.closes) : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(c.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Warnungen / Datenqualität ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Warnungen / Datenqualität</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Auffälligkeiten
            </CardTitle>
          </CardHeader>
          <CardContent>
            {warnings.length === 0 ? (
              <div className="text-xs text-muted-foreground">Keine Auffälligkeiten.</div>
            ) : (
              <ul className="text-xs space-y-1 list-disc pl-5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Datenquellen-Check</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1 font-mono">
            {Object.entries(sourceCheck).map(([k, v]: any) => (
              <div key={k} className="flex justify-between">
                <span>{v.found ? '✅' : '❌'} {k}</span>
                <span className="text-muted-foreground">{v.count} Zeilen</span>
              </div>
            ))}
            <div className="pt-2 text-muted-foreground">
              opp-Spalten: {oppColumns.length} · deal-Spalten: {dealColumns.length}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ===== Cash bewusst nicht berechenbar ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cash / Zahlungs-KPIs</h2>
        <Card>
          <CardHeader><CardTitle className="text-sm">Nicht aus Close allein berechenbar</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Umsatz eingegangen / Cash Collected</li>
              <li>Cash-Collect-Quote (gesamt & pro Closer)</li>
              <li>Offene Forderungen & überfällige Beträge</li>
              <li>Zahlungsausfall- / Stornoquote pro Closer</li>
              <li>Rückbuchungen / Refunds</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Diese Kennzahlen brauchen echte Zahlungs-/Rechnungsdaten (Bank, Stripe, Lexoffice, SevDesk).
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
