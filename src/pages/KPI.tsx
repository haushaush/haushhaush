import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { AlertTriangle, TrendingUp, Users, Briefcase, Mail, Clock, Target, ChevronLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const tooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };
const AMPEL_COLORS: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive', 'CC': 'bg-muted-foreground' };

type TimeFilter = 'week' | 'month' | 'all';

function getDateThreshold(filter: TimeFilter): string | null {
  if (filter === 'all') return null;
  const d = new Date();
  if (filter === 'week') d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

export default function KPI() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [adData, setAdData] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [salesFilter, setSalesFilter] = useState<TimeFilter>('all');
  const [adFilter, setAdFilter] = useState<TimeFilter>('all');
  const [selectedSetter, setSelectedSetter] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const load = async () => {
      const [c, s, a, t, p, tk] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('sales_performance').select('*').order('datum', { ascending: false }),
        supabase.from('ad_performance_intern').select('*').order('datum', { ascending: false }),
        supabase.from('team').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('tasks').select('*'),
      ]);
      if (c.data) setClients(c.data);
      if (s.data) setSalesData(s.data);
      if (a.data) setAdData(a.data);
      if (t.data) setTeam(t.data);
      if (p.data) setProjects(p.data);
      if (tk.data) setTasks(tk.data);
      setLoading(false);
    };
    load();
  }, []);

  const getName = (id: string) => team.find(t => t.id === id)?.name || '–';
  const chartHeight = isMobile ? 200 : 260;

  // ── Customer Success ──
  const activeClients = useMemo(() => clients.filter(c => c.kundenstatus === 'In Betreuung'), [clients]);
  const alertClients = useMemo(() => clients.filter(c => c.ampelstatus === 'Rot' || (c.zahlstatus && c.zahlstatus.toLowerCase() === 'offen')), [clients]);

  function laufzeitPercent(c: any) {
    if (!c.startdatum || !c.enddatum) return null;
    const start = new Date(c.startdatum).getTime();
    const end = new Date(c.enddatum).getTime();
    const now = Date.now();
    if (end <= start) return 0;
    return Math.round(Math.max(0, (end - now) / (end - start) * 100));
  }

  // ── Sales Performance ──
  const filteredSales = useMemo(() => {
    const threshold = getDateThreshold(salesFilter);
    return threshold ? salesData.filter(r => r.datum >= threshold) : salesData;
  }, [salesData, salesFilter]);

  const setterLeaderboard = useMemo(() => {
    const map = new Map<string, { calls: number; appts: number; showUps: number; closes: number; revenue: number; coldSent: number; coldResp: number }>();
    filteredSales.forEach(r => {
      const prev = map.get(r.setter_id) || { calls: 0, appts: 0, showUps: 0, closes: 0, revenue: 0, coldSent: 0, coldResp: 0 };
      map.set(r.setter_id, {
        calls: prev.calls + (r.calls_made || 0), appts: prev.appts + (r.appointments_set || 0),
        showUps: prev.showUps + (r.show_ups || 0), closes: prev.closes + (r.closes || 0),
        revenue: prev.revenue + Number(r.revenue_generated || 0),
        coldSent: prev.coldSent + (r.cold_mails_sent || 0), coldResp: prev.coldResp + (r.cold_mail_responses || 0),
      });
    });
    return Array.from(map.entries()).map(([id, d]) => ({ id, name: getName(id), ...d })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, team]);

  const coldMailTotals = useMemo(() => {
    const sent = setterLeaderboard.reduce((s, r) => s + r.coldSent, 0);
    const resp = setterLeaderboard.reduce((s, r) => s + r.coldResp, 0);
    return { sent, resp, rate: sent > 0 ? ((resp / sent) * 100).toFixed(1) : '0' };
  }, [setterLeaderboard]);

  const setterDetail = useMemo(() => {
    if (!selectedSetter) return [];
    return filteredSales.filter(r => r.setter_id === selectedSetter).slice().reverse();
  }, [selectedSetter, filteredSales]);

  // ── Fulfillment ──
  const activeProjects = useMemo(() => projects.filter(p => p.status === 'Aktiv'), [projects]);
  const overdueTasks = useMemo(() => tasks.filter(t => t.status !== 'Erledigt' && t.due_date && new Date(t.due_date) < new Date()), [tasks]);
  const avgTaskCompletion = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasks.filter(t => t.status === 'Erledigt').length / tasks.length) * 100);
  }, [tasks]);

  const effizienzPerClient = useMemo(() => {
    const map = new Map<string, { geplant: number; ist: number }>();
    tasks.forEach(t => {
      if (!t.client_id) return;
      const prev = map.get(t.client_id) || { geplant: 0, ist: 0 };
      map.set(t.client_id, { geplant: prev.geplant + Number(t.geplante_zeit || 0), ist: prev.ist + Number(t.ist_zeit || 0) });
    });
    return Array.from(map.entries()).map(([cid, d]) => {
      const client = clients.find(c => c.id === cid);
      return { name: client?.name || '–', geplant: d.geplant, ist: d.ist, score: d.geplant > 0 ? Math.round((d.ist / d.geplant) * 100) : 0 };
    }).sort((a, b) => a.score - b.score);
  }, [tasks, clients]);

  // ── Ad Performance ──
  const filteredAds = useMemo(() => {
    const threshold = getDateThreshold(adFilter);
    return threshold ? adData.filter(r => r.datum >= threshold) : adData;
  }, [adData, adFilter]);

  const adTotals = useMemo(() => {
    const spend = filteredAds.reduce((s, r) => s + Number(r.spend || 0), 0);
    const leads = filteredAds.reduce((s, r) => s + (r.leads || 0), 0);
    const appts = filteredAds.reduce((s, r) => s + (r.appointments || 0), 0);
    return { spend, leads, cpl: leads > 0 ? spend / leads : 0, appts, cpa: appts > 0 ? spend / appts : 0 };
  }, [filteredAds]);

  const adChartData = useMemo(() => filteredAds.slice().reverse().map(r => ({ datum: r.datum, Spend: Number(r.spend || 0), Leads: r.leads || 0 })), [filteredAds]);

  const filterLabel = (f: TimeFilter) => f === 'week' ? 'Diese Woche' : f === 'month' ? 'Diesen Monat' : 'Insgesamt';

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="KPI-Daten werden geladen">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-heading font-bold">KPI Dashboard</h1>
        <p className="text-muted-foreground text-sm">Alle Performance-Kennzahlen auf einen Blick</p>
      </div>

      {/* ═══ SECTION 1: CUSTOMER SUCCESS ═══ */}
      <section className="space-y-4" aria-labelledby="cs-heading">
        <h2 id="cs-heading" className="text-lg font-heading font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" /> Customer Success
        </h2>

        {alertClients.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="alert">
            {alertClients.map(c => (
              <Card key={c.id} className="border-destructive/40 bg-destructive/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.ampelstatus === 'Rot' && 'Ampelstatus: Rot'}
                      {c.ampelstatus === 'Rot' && c.zahlstatus?.toLowerCase() === 'offen' && ' · '}
                      {c.zahlstatus?.toLowerCase() === 'offen' && 'Zahlung offen'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Aktive Kunden mit Ampelstatus, Laufzeit und CLV</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Kunde</TableHead>
                <TableHead scope="col">Ampel</TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">Laufzeit</TableHead>
                <TableHead scope="col">CLV</TableHead>
                <TableHead scope="col">Zahlstatus</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {activeClients.map(c => {
                  const lz = laufzeitPercent(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2" aria-label={`Ampelstatus: ${c.ampelstatus}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_COLORS[c.ampelstatus] || 'bg-muted'}`} aria-hidden="true" />
                          <span className="text-xs text-muted-foreground">{c.ampelstatus}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {lz !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={lz} aria-valuemin={0} aria-valuemax={100} aria-label={`Laufzeit: ${lz}% verbleibend`}>
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${lz}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{lz}%</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">–</span>}
                      </TableCell>
                      <TableCell className="font-medium">€{Number(c.clv || 0).toLocaleString('de-DE')}</TableCell>
                      <TableCell>
                        <Badge variant={c.zahlstatus?.toLowerCase() === 'offen' ? 'destructive' : 'secondary'} className="text-xs">
                          {c.zahlstatus || '–'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      </section>

      {/* ═══ SECTION 2: SALES PERFORMANCE ═══ */}
      <section className="space-y-4" aria-labelledby="sales-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 id="sales-heading" className="text-lg font-heading font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" /> Sales Performance
          </h2>
          <Select value={salesFilter} onValueChange={(v) => setSalesFilter(v as TimeFilter)}>
            <SelectTrigger className="w-[160px] h-10 min-h-[44px] text-xs" aria-label="Zeitraum für Sales filtern"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Diesen Monat</SelectItem>
              <SelectItem value="all">Insgesamt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedSetter ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedSetter(null)} className="gap-1 text-muted-foreground min-h-[44px]">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Zurück zum Leaderboard
            </Button>
            <Card>
              <CardHeader><CardTitle className="text-base">{getName(selectedSetter)} – Detail ({filterLabel(salesFilter)})</CardTitle></CardHeader>
              <CardContent>
                <div role="img" aria-label={`Diagramm für ${getName(selectedSetter)}: Calls, Termine und Closes`}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={setterDetail}>
                      <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 8 : 10} />
                      <YAxis stroke="hsl(215, 20%, 55%)" fontSize={10} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="calls_made" fill="hsl(43, 56%, 52%)" name="Calls" radius={[3,3,0,0]} />
                      <Bar dataKey="appointments_set" fill="hsl(142, 71%, 45%)" name="Termine" radius={[3,3,0,0]} />
                      <Bar dataKey="closes" fill="hsl(215, 60%, 50%)" name="Closes" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Detaildaten für {getName(selectedSetter)}</caption>
                  <TableHeader><TableRow>
                    <TableHead scope="col">Datum</TableHead><TableHead scope="col">Calls</TableHead><TableHead scope="col">Termine</TableHead>
                    <TableHead scope="col">Show-Ups</TableHead><TableHead scope="col">Closes</TableHead><TableHead scope="col">Revenue</TableHead>
                    <TableHead scope="col" className="hidden sm:table-cell">Cold Mails</TableHead><TableHead scope="col" className="hidden sm:table-cell">Responses</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {setterDetail.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                        <TableCell>{r.calls_made}</TableCell>
                        <TableCell>{r.appointments_set}</TableCell>
                        <TableCell>{r.show_ups}</TableCell>
                        <TableCell>{r.closes}</TableCell>
                        <TableCell className="font-medium">€{Number(r.revenue_generated || 0).toLocaleString('de-DE')}</TableCell>
                        <TableCell className="hidden sm:table-cell">{r.cold_mails_sent}</TableCell>
                        <TableCell className="hidden sm:table-cell">{r.cold_mail_responses}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          </div>
        ) : (
          <>
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Setter Leaderboard nach Revenue sortiert</caption>
                  <TableHeader><TableRow>
                    <TableHead scope="col">#</TableHead><TableHead scope="col">Setter</TableHead><TableHead scope="col">Calls</TableHead>
                    <TableHead scope="col">Terminquote</TableHead><TableHead scope="col" className="hidden sm:table-cell">Show-up</TableHead>
                    <TableHead scope="col" className="hidden sm:table-cell">Close Rate</TableHead><TableHead scope="col">Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {setterLeaderboard.map((s, i) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-primary/5 min-h-[44px]" onClick={() => setSelectedSetter(s.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelectedSetter(s.id)} role="button" aria-label={`Details für ${s.name} anzeigen`}>
                        <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.calls}</TableCell>
                        <TableCell>{s.calls > 0 ? ((s.appts / s.calls) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell className="hidden sm:table-cell">{s.appts > 0 ? ((s.showUps / s.appts) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell className="hidden sm:table-cell">{s.showUps > 0 ? ((s.closes / s.showUps) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell className="font-medium text-primary">€{s.revenue.toLocaleString('de-DE')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" aria-hidden="true" /> Cold Mail Performance</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center"><p className="text-xl sm:text-2xl font-heading font-bold">{coldMailTotals.sent}</p><p className="text-xs text-muted-foreground">Gesendet</p></div>
                  <div className="text-center"><p className="text-xl sm:text-2xl font-heading font-bold">{coldMailTotals.resp}</p><p className="text-xs text-muted-foreground">Responses</p></div>
                  <div className="text-center"><p className="text-xl sm:text-2xl font-heading font-bold text-primary">{coldMailTotals.rate}%</p><p className="text-xs text-muted-foreground">Response Rate</p></div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* ═══ SECTION 3: FULFILLMENT ═══ */}
      <section className="space-y-4" aria-labelledby="fulfillment-heading">
        <h2 id="fulfillment-heading" className="text-lg font-heading font-semibold flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" aria-hidden="true" /> Fulfillment
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4 sm:p-5 text-center"><p className="text-2xl sm:text-3xl font-heading font-bold">{activeProjects.length}</p><p className="text-xs text-muted-foreground mt-1">Aktive Projekte</p></CardContent></Card>
          <Card><CardContent className="p-4 sm:p-5 text-center"><p className="text-2xl sm:text-3xl font-heading font-bold">{avgTaskCompletion}%</p><p className="text-xs text-muted-foreground mt-1">Task Completion</p></CardContent></Card>
          <Card className={overdueTasks.length > 0 ? 'border-destructive/40' : ''}>
            <CardContent className="p-4 sm:p-5 text-center">
              <p className={`text-2xl sm:text-3xl font-heading font-bold ${overdueTasks.length > 0 ? 'text-destructive' : ''}`}>{overdueTasks.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Überfällige Aufgaben</p>
              {overdueTasks.length > 0 && <AlertTriangle className="inline h-4 w-4 text-destructive mt-1" aria-label="Warnung: Überfällige Aufgaben" />}
            </CardContent>
          </Card>
        </div>

        {effizienzPerClient.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" aria-hidden="true" /> Effizienz Score (Ist / Geplant)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Effizienz-Score pro Kunde</caption>
                  <TableHeader><TableRow>
                    <TableHead scope="col">Kunde</TableHead><TableHead scope="col">Geplant (h)</TableHead><TableHead scope="col">Ist (h)</TableHead><TableHead scope="col">Score</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {effizienzPerClient.map(e => (
                      <TableRow key={e.name}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell>{e.geplant}</TableCell>
                        <TableCell>{e.ist}</TableCell>
                        <TableCell>
                          <Badge variant={e.score > 120 ? 'destructive' : e.score > 100 ? 'secondary' : 'default'} className="text-xs">{e.score}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ═══ SECTION 4: AD PERFORMANCE ═══ */}
      <section className="space-y-4" aria-labelledby="ad-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 id="ad-heading" className="text-lg font-heading font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" aria-hidden="true" /> Ad Performance
          </h2>
          <Select value={adFilter} onValueChange={(v) => setAdFilter(v as TimeFilter)}>
            <SelectTrigger className="w-[160px] h-10 min-h-[44px] text-xs" aria-label="Zeitraum für Ads filtern"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Letzte Woche</SelectItem>
              <SelectItem value="month">Letzter Monat</SelectItem>
              <SelectItem value="all">Insgesamt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {[
            { label: 'Spend', value: `€${adTotals.spend.toLocaleString('de-DE')}` },
            { label: 'Leads', value: adTotals.leads },
            { label: 'CPL', value: `€${adTotals.cpl.toFixed(2)}` },
            { label: 'Termine', value: adTotals.appts },
            { label: 'Cost/Termin', value: `€${adTotals.cpa.toFixed(2)}` },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-lg sm:text-xl font-heading font-bold">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Spend vs. Leads Trend</CardTitle></CardHeader>
          <CardContent>
            <div role="img" aria-label={`Trend-Diagramm: ${adChartData.length} Datenpunkte, Spend und Leads über Zeit`}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart data={adChartData}>
                  <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 8 : 10} />
                  <YAxis yAxisId="left" stroke="hsl(43, 56%, 52%)" fontSize={10} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(142, 71%, 45%)" fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="Spend" stroke="hsl(43, 56%, 52%)" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Leads" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Ad Performance Daten</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Datum</TableHead><TableHead scope="col">Spend</TableHead><TableHead scope="col">Leads</TableHead>
                <TableHead scope="col">CPL</TableHead><TableHead scope="col" className="hidden sm:table-cell">Termine</TableHead><TableHead scope="col" className="hidden sm:table-cell">Cost/Termin</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredAds.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                    <TableCell>€{Number(r.spend || 0).toLocaleString('de-DE')}</TableCell>
                    <TableCell>{r.leads}</TableCell>
                    <TableCell>€{Number(r.cpl || 0).toFixed(2)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{r.appointments}</TableCell>
                    <TableCell className="hidden sm:table-cell">€{Number(r.cost_per_appointment || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      </section>
    </div>
  );
}
