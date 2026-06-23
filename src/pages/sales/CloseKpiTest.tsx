import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { AlertTriangle, FlaskConical, Info } from 'lucide-react';
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

const CONNECT_THRESHOLD_SEC = 30; // duration_seconds >= 30 => Connect

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
          supabase.from('close_opportunities').select('*'),
          supabase.from('close_deals').select('*'),
          supabase.from('close_activities').select('*'),
          supabase.from('close_leads').select('id,date_created,status_label'),
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
  const dateLabel = useMemo(() => {
    if (range === 'all') return 'Insgesamt';
    if (range === 'custom') return `${customFrom || '…'} → ${customTo || '…'}`;
    return RANGE_OPTIONS.find(r => r.key === range)?.label || '';
  }, [range, customFrom, customTo]);

  // ===== Umsatz / Abschluss-KPIs =====
  // Quelle: close_opportunities, status_type=won, Datumsspalte: date_won (fallback date_updated)
  const dateColUsed = 'date_won (Fallback: date_updated)';

  const wonOppsInRange = useMemo(() => {
    return opps.filter(o => {
      if (o.status_type !== 'won') return false;
      const d = o.date_won || o.date_updated;
      return inRange(d, from, to);
    });
  }, [opps, from, to]);

  // Dedup by opportunity id
  const dedupedWon = useMemo(() => {
    const map = new Map<string, any>();
    for (const o of wonOppsInRange) {
      if (!map.has(o.id)) map.set(o.id, o);
    }
    return Array.from(map.values());
  }, [wonOppsInRange]);

  const sumBefore = useMemo(() => wonOppsInRange.reduce((s, o) => s + Number(o.abschlusswert || 0), 0), [wonOppsInRange]);
  const sumAfter = useMemo(() => dedupedWon.reduce((s, o) => s + Number(o.abschlusswert || 0), 0), [dedupedWon]);
  const countDeals = dedupedWon.length;
  const avgDeal = countDeals > 0 ? sumAfter / countDeals : 0;

  // Setup vs Retainer detection
  const setupRetainerFields = useMemo(() => {
    const keys = new Set([...oppColumns, ...dealColumns].map(k => k.toLowerCase()));
    const setup = ['setup', 'setup_fee', 'einrichtung'].find(k => keys.has(k));
    const retainer = ['retainer', 'monthly', 'recurring', 'mrr'].find(k => keys.has(k));
    return { setup, retainer };
  }, [oppColumns, dealColumns]);

  // ===== Pipeline / Funnel =====
  const oppsActive = useMemo(() => opps.filter(o => o.status_type === 'active'), [opps]);

  const stageGroups = useMemo(() => {
    const map = new Map<string, { stage: string; status: string; count: number; value: number; weighted: number }>();
    for (const o of opps) {
      const key = `${o.status_label || '–'}|${o.status_type || '–'}`;
      const cur = map.get(key) || { stage: o.status_label || '–', status: o.status_type || '–', count: 0, value: 0, weighted: 0 };
      cur.count += 1;
      cur.value += Number(o.abschlusswert || 0);
      cur.weighted += Number(o.abschlusswert || 0) * (Number(o.confidence || 0) / 100);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [opps]);

  const pipelineValue = useMemo(() => oppsActive.reduce((s, o) => s + Number(o.abschlusswert || 0), 0), [oppsActive]);
  const pipelineWeighted = useMemo(() => oppsActive.reduce((s, o) => s + Number(o.abschlusswert || 0) * (Number(o.confidence || 0) / 100), 0), [oppsActive]);
  const hasConfidence = useMemo(() => opps.some(o => o.confidence != null && o.confidence !== 0), [opps]);

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

  // ===== Aktivitäts-KPIs =====
  const actsInRange = useMemo(() => acts.filter(a => inRange(a.date_created, from, to)), [acts, from]);
  const calls = useMemo(() => actsInRange.filter(a => a.activity_type === 'Call'), [actsInRange]);
  const meetings = useMemo(() => actsInRange.filter(a => a.activity_type === 'Meeting'), [actsInRange]);
  const connects = useMemo(() => calls.filter(c => Number(c.duration_seconds || 0) >= CONNECT_THRESHOLD_SEC), [calls]);
  const connectRate = calls.length > 0 ? (connects.length / calls.length) * 100 : 0;

  // Team-Auswertungen by user_name on activities
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
    // Cent-Heuristik: value_cents/100 deutlich anders als abschlusswert
    const sumValue = opps.filter(o => o.status_type === 'won').reduce((s, o) => s + Number(o.value || 0), 0);
    const sumValueCents = opps.filter(o => o.status_type === 'won').reduce((s, o) => s + Number(o.value_cents || 0), 0);
    if (sumValueCents > sumValue * 50) ws.push('value_cents enthält offenbar Cent-Beträge (× 100 zu groß) – darum NICHT für Umsatz nutzen.');
    const wonNoVal = opps.filter(o => o.status_type === 'won' && !o.abschlusswert).length;
    if (wonNoVal > 0) ws.push(`${wonNoVal} Won-Opportunities ohne abschlusswert.`);
    const wonNoDate = opps.filter(o => o.status_type === 'won' && !o.date_won).length;
    if (wonNoDate > 0) ws.push(`${wonNoDate} Won-Opportunities ohne date_won (Fallback genutzt).`);
    const ids = wonOppsInRange.map(o => o.id);
    const dupes = ids.length - new Set(ids).size;
    if (dupes > 0) ws.push(`${dupes} doppelte Opportunity-IDs im Zeitraum (dedupliziert).`);
    const extreme = dedupedWon.filter(o => Number(o.abschlusswert) > 500000 || Number(o.abschlusswert) < 0);
    if (extreme.length > 0) ws.push(`${extreme.length} Abschlüsse mit extrem hohem/negativem Wert.`);
    return ws;
  }, [opps, wonOppsInRange, dedupedWon]);

  // ===== Datenquellen-Check =====
  const sourceCheck = useMemo(() => ({
    close_opportunities: { found: opps.length > 0, count: opps.length, cols: oppColumns },
    close_deals: { found: deals.length > 0, count: deals.length, cols: dealColumns },
    close_activities: { found: acts.length > 0, count: acts.length },
    close_leads: { found: leads.length > 0, count: leads.length },
  }), [opps, deals, acts, leads, oppColumns, dealColumns]);

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

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Close KPI Test</h1>
            <Badge variant="outline" className="text-xs">Experimentell</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Diagnose-Sprint: welche Sales-KPIs lassen sich zuverlässig aus Close ableiten? Lesend, ohne Sync-Änderungen.
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

      {/* Teil 1: Umsatz / Abschlüsse */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 1 · Umsatz & Abschlüsse</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard
            title="Umsatz geschrieben"
            value={`${eur(sumAfter)}`}
            sub={`Quelle: close_opportunities · Feld: abschlusswert · Datum: ${dateColUsed}`}
            hint="Cent-Konvertierung: nein (abschlusswert ist bereits EUR)"
          />
          <KpiCard
            title="Anzahl Abschlüsse"
            value={countDeals}
            sub="dedupliziert nach Opportunity-ID, status_type=won"
          />
          <KpiCard
            title="Ø Auftragswert"
            value={countDeals > 0 ? `${eur(avgDeal)}` : '–'}
            sub={countDeals > 0 ? 'Umsatz ÷ Abschlüsse' : 'keine Abschlüsse im Zeitraum'}
          />
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Setup vs. Retainer</CardTitle></CardHeader>
            <CardContent>
              {setupRetainerFields.setup || setupRetainerFields.retainer ? (
                <div className="text-xs">
                  Setup-Feld: <code>{setupRetainerFields.setup || '–'}</code><br />
                  Retainer-Feld: <code>{setupRetainerFields.retainer || '–'}</code>
                </div>
              ) : (
                <NotComputable reason="Setup/Retainer wird aktuell nicht getrennt gespeichert." />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Ziel vs. Ist</CardTitle></CardHeader>
          <CardContent>
            <NotComputable reason="Quota/Zielwert-Tabelle fehlt. Vorschlag: neue Tabelle sales_targets (user_id, period, target_value)." />
          </CardContent>
        </Card>
      </section>

      {/* Teil 2: Pipeline / Funnel */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 2 · Pipeline & Funnel</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard title="Pipeline-Wert (offen)" value={`${eur(pipelineValue)}`} sub={`${oppsActive.length} aktive Opportunities`} />
          <KpiCard
            title="Pipeline gewichtet"
            value={hasConfidence ? `${eur(pipelineWeighted)}` : '–'}
            sub={hasConfidence ? 'mit confidence/100' : 'Keine Stage-Wahrscheinlichkeiten vorhanden.'}
          />
          <KpiCard
            title="Ø Sales-Cycle"
            value={cycle.avg != null ? `${cycle.avg.toFixed(1)} Tage` : '–'}
            sub={cycle.avg != null ? `n=${cycle.n} · Lead-Date: ${cycle.usedLeadDate} · Opp-Date: ${cycle.usedOppDate}` : 'kein Won-Deal mit Start-Datum'}
          />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">Funnel nach Stage</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
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
                {stageGroups.map((g, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{g.stage}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{g.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(g.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Teil 3: Aktivitäten */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 3 · Aktivitäts-KPIs</h2>
        {acts.length === 0 ? (
          <NotComputable reason="close_activities ist leer." />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <KpiCard title="Dials / Calls" value={calls.length} sub="Aktivitätstyp = Call" />
              <KpiCard
                title="Connect-Quote"
                value={`${connectRate.toFixed(1)}%`}
                sub={`Connects: ${connects.length} / ${calls.length}`}
                hint={`Connect-Heuristik: duration_seconds ≥ ${CONNECT_THRESHOLD_SEC} (Outcome-Feld fehlt)`}
              />
              <KpiCard title="Termine gesetzt" value={meetings.length} sub="Aktivitätstyp = Meeting" />
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Setting / Show / Closing-Quote</CardTitle></CardHeader>
                <CardContent>
                  <NotComputable reason="Keine eindeutigen Gesprächs-/Show/Closing-Outcomes in close_activities (kein status/outcome-Feld)." />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      {/* Teil 4: Team-Auswertung */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 4 · Team-Auswertung</h2>
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

        <NotComputable reason="Setter ↔ Closer Attribution (welcher Setter hat zu welchem Abschluss geführt) ist aus den vorhandenen Close-Feldern nicht eindeutig herstellbar." />
      </section>

      {/* Teil 5: Cash bewusst nicht berechenbar */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 5 · Cash / Zahlungs-KPIs</h2>
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
              Diese Kennzahlen brauchen echte Zahlungs-/Rechnungsdaten, z.B. Bank, Stripe, Lexoffice, SevDesk oder eine eigene Payment-Tabelle.
            </p>
            <div className="text-xs">
              <span className="font-medium">Vorschlag für spätere Tabellen:</span>
              <code className="ml-2">sales_payments</code>,
              <code className="ml-2">sales_invoices</code>,
              <code className="ml-2">sales_refunds</code>,
              <code className="ml-2">sales_targets</code>.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Teil 6: Debug */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 6 · Debug & Validierung</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

          <Card>
            <CardHeader><CardTitle className="text-sm">Umsatz-Debug</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1 font-mono">
              <div>Quelle: <span className="text-foreground">close_opportunities</span></div>
              <div>Wertfeld: <span className="text-foreground">abschlusswert (numeric, EUR)</span></div>
              <div>Datumsfeld: <span className="text-foreground">{dateColUsed}</span></div>
              <div>Filter: <span className="text-foreground">status_type = 'won'</span></div>
              <div>Rohdatensätze im Zeitraum: <span className="text-foreground">{wonOppsInRange.length}</span></div>
              <div>Eindeutige nach Dedup: <span className="text-foreground">{dedupedWon.length}</span></div>
              <div>Summe vor Dedup: <span className="text-foreground">{eur(sumBefore)}</span></div>
              <div>Summe nach Dedup: <span className="text-foreground">{eur(sumAfter)}</span></div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Warnungen
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
          <CardHeader><CardTitle className="text-sm">Top 20 Abschlüsse im Zeitraum</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Wert</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...dedupedWon].sort((a, b) => Number(b.abschlusswert || 0) - Number(a.abschlusswert || 0)).slice(0, 20).map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.lead_name || '–'}</TableCell>
                    <TableCell className="text-xs">{o.date_won ? new Date(o.date_won).toLocaleDateString('de-DE') : '–'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatValue(Number(o.abschlusswert || 0))} €</TableCell>
                    <TableCell>{o.user_name || '–'}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{o.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Teil 7: Warum Umsatz zu hoch? */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Teil 7 · „Umsatz zu hoch?" – Ursachen-Check</h2>
        <Card>
          <CardContent className="p-4 text-xs space-y-2">
            <p className="text-muted-foreground">
              Vergleich der drei verfügbaren Wert-Felder in <code>close_opportunities</code> (status_type=won, gesamter Bestand):
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feld</TableHead>
                  <TableHead className="text-right">Summe (alle Won)</TableHead>
                  <TableHead>Bewertung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell><code>abschlusswert</code></TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(opps.filter(o => o.status_type === 'won').reduce((s, o) => s + Number(o.abschlusswert || 0), 0))} €</TableCell>
                  <TableCell>✅ richtige Quelle (Close Custom Field)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>value</code></TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(opps.filter(o => o.status_type === 'won').reduce((s, o) => s + Number(o.value || 0), 0))} €</TableCell>
                  <TableCell>⚠️ Close-Standardfeld, oft falsch / nicht gepflegt</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>value_cents</code></TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(opps.filter(o => o.status_type === 'won').reduce((s, o) => s + Number(o.value_cents || 0), 0) / 100)} €</TableCell>
                  <TableCell>⚠️ Cent-Wert ÷ 100 – ebenfalls Standardfeld, nicht nutzen</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-muted-foreground pt-2">
              Mögliche Ursachen, wenn Umsatz in anderen Ansichten zu hoch wirkt:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
              <li><code>value_cents</code> wird fälschlich nicht durch 100 geteilt.</li>
              <li><code>abschlusswert</code> wird zusätzlich durch 100 geteilt oder gar nicht verwendet.</li>
              <li>Opportunities werden doppelt geladen / nicht dedupliziert.</li>
              <li><code>close_deals</code> und <code>close_opportunities</code> werden gleichzeitig addiert.</li>
              <li>Zeitraumfilter greift auf <code>created_at</code> statt <code>date_won</code>.</li>
              <li>Won/Lost/Active wird nicht sauber gefiltert.</li>
              <li>Setup + Retainer + brutto wird in einem Feld doppelt aufaddiert.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
