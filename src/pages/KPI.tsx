import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { AlertTriangle, TrendingUp, Users, Briefcase, Mail, Clock, Target, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const tooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };

const AMPEL_COLORS: Record<string, string> = {
  'Grün': 'bg-success',
  'Gelb': 'bg-warning',
  'Rot': 'bg-destructive',
  'CC': 'bg-muted-foreground',
};

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
  const [vorqualiData, setVorqualiData] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [salesFilter, setSalesFilter] = useState<TimeFilter>('all');
  const [adFilter, setAdFilter] = useState<TimeFilter>('all');
  const [selectedSetter, setSelectedSetter] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [c, s, a, v, t, p, tk] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('sales_performance').select('*').order('datum', { ascending: false }),
        supabase.from('ad_performance_intern').select('*').order('datum', { ascending: false }),
        supabase.from('vorquali_kpi').select('*').order('datum', { ascending: false }),
        supabase.from('team').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('tasks').select('*'),
      ]);
      if (c.data) setClients(c.data);
      if (s.data) setSalesData(s.data);
      if (a.data) setAdData(a.data);
      if (v.data) setVorqualiData(v.data);
      if (t.data) setTeam(t.data);
      if (p.data) setProjects(p.data);
      if (tk.data) setTasks(tk.data);
      setLoading(false);
    };
    load();
  }, []);

  const getName = (id: string) => team.find(t => t.id === id)?.name || '–';

  // ── Customer Success ──
  const activeClients = useMemo(() => clients.filter(c => c.kundenstatus === 'In Betreuung'), [clients]);
  const alertClients = useMemo(() => clients.filter(c => c.ampelstatus === 'Rot' || (c.zahlstatus && c.zahlstatus.toLowerCase() === 'offen')), [clients]);

  function laufzeitPercent(c: any) {
    if (!c.startdatum || !c.enddatum) return null;
    const start = new Date(c.startdatum).getTime();
    const end = new Date(c.enddatum).getTime();
    const now = Date.now();
    if (end <= start) return 0;
    const remaining = Math.max(0, (end - now) / (end - start) * 100);
    return Math.round(remaining);
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
        calls: prev.calls + (r.calls_made || 0),
        appts: prev.appts + (r.appointments_set || 0),
        showUps: prev.showUps + (r.show_ups || 0),
        closes: prev.closes + (r.closes || 0),
        revenue: prev.revenue + Number(r.revenue_generated || 0),
        coldSent: prev.coldSent + (r.cold_mails_sent || 0),
        coldResp: prev.coldResp + (r.cold_mail_responses || 0),
      });
    });
    return Array.from(map.entries())
      .map(([id, d]) => ({ id, name: getName(id), ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, team]);

  const coldMailTotals = useMemo(() => {
    const sent = setterLeaderboard.reduce((s, r) => s + r.coldSent, 0);
    const resp = setterLeaderboard.reduce((s, r) => s + r.coldResp, 0);
    return { sent, resp, rate: sent > 0 ? ((resp / sent) * 100).toFixed(1) : '0' };
  }, [setterLeaderboard]);

  // ── Setter Deep-Dive ──
  const setterDetail = useMemo(() => {
    if (!selectedSetter) return [];
    return filteredSales.filter(r => r.setter_id === selectedSetter).slice().reverse();
  }, [selectedSetter, filteredSales]);

  // ── Fulfillment ──
  const activeProjects = useMemo(() => projects.filter(p => p.status === 'Aktiv'), [projects]);
  const overdueTasks = useMemo(() => tasks.filter(t => t.status !== 'Erledigt' && t.due_date && new Date(t.due_date) < new Date()), [tasks]);
  const avgTaskCompletion = useMemo(() => {
    if (tasks.length === 0) return 0;
    const done = tasks.filter(t => t.status === 'Erledigt').length;
    return Math.round((done / tasks.length) * 100);
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
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
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
      <section className="space-y-4">
        <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Customer Success
        </h2>

        {alertClients.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertClients.map(c => (
              <Card key={c.id} className="border-destructive/40 bg-destructive/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
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

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Ampel</TableHead>
                  <TableHead>Laufzeit</TableHead>
                  <TableHead>CLV</TableHead>
                  <TableHead>Zahlstatus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeClients.map(c => {
                  const lz = laufzeitPercent(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_COLORS[c.ampelstatus] || 'bg-muted'}`} />
                          <span className="text-xs text-muted-foreground">{c.ampelstatus}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {lz !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
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
          </CardContent>
        </Card>
      </section>

      {/* ═══ SECTION 2: SALES PERFORMANCE ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Sales Performance
          </h2>
          <Select value={salesFilter} onValueChange={(v) => setSalesFilter(v as TimeFilter)}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Diesen Monat</SelectItem>
              <SelectItem value="all">Insgesamt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedSetter ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedSetter(null)} className="gap-1 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" /> Zurück zum Leaderboard
            </Button>
            <Card>
              <CardHeader><CardTitle className="text-base">{getName(selectedSetter)} – Detail ({filterLabel(salesFilter)})</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={setterDetail}>
                    <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={10} />
                    <YAxis stroke="hsl(215, 20%, 55%)" fontSize={10} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="calls_made" fill="hsl(43, 56%, 52%)" name="Calls" radius={[3,3,0,0]} />
                    <Bar dataKey="appointments_set" fill="hsl(142, 71%, 45%)" name="Termine" radius={[3,3,0,0]} />
                    <Bar dataKey="closes" fill="hsl(215, 60%, 50%)" name="Closes" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Datum</TableHead><TableHead>Calls</TableHead><TableHead>Termine</TableHead>
                  <TableHead>Show-Ups</TableHead><TableHead>Closes</TableHead><TableHead>Revenue</TableHead>
                  <TableHead>Cold Mails</TableHead><TableHead>Responses</TableHead>
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
                      <TableCell>{r.cold_mails_sent}</TableCell>
                      <TableCell>{r.cold_mail_responses}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead><TableHead>Setter</TableHead><TableHead>Calls</TableHead>
                      <TableHead>Terminquote</TableHead><TableHead>Show-up Rate</TableHead><TableHead>Close Rate</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setterLeaderboard.map((s, i) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-primary/5" onClick={() => setSelectedSetter(s.id)}>
                        <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.calls}</TableCell>
                        <TableCell>{s.calls > 0 ? ((s.appts / s.calls) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell>{s.appts > 0 ? ((s.showUps / s.appts) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell>{s.showUps > 0 ? ((s.closes / s.showUps) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell className="font-medium text-primary">€{s.revenue.toLocaleString('de-DE')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Cold Mail Performance</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-heading font-bold">{coldMailTotals.sent}</p>
                    <p className="text-xs text-muted-foreground">Gesendet</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-heading font-bold">{coldMailTotals.resp}</p>
                    <p className="text-xs text-muted-foreground">Responses</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-heading font-bold text-primary">{coldMailTotals.rate}%</p>
                    <p className="text-xs text-muted-foreground">Response Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* ═══ SECTION 3: FULFILLMENT ═══ */}
      <section className="space-y-4">
        <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" /> Fulfillment
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-heading font-bold">{activeProjects.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Aktive Projekte</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-heading font-bold">{avgTaskCompletion}%</p>
              <p className="text-xs text-muted-foreground mt-1">Task Completion</p>
            </CardContent>
          </Card>
          <Card className={overdueTasks.length > 0 ? 'border-destructive/40' : ''}>
            <CardContent className="p-5 text-center">
              <p className={`text-3xl font-heading font-bold ${overdueTasks.length > 0 ? 'text-destructive' : ''}`}>{overdueTasks.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Überfällige Aufgaben</p>
            </CardContent>
          </Card>
        </div>

        {effizienzPerClient.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Effizienz Score (Ist / Geplant)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Kunde</TableHead><TableHead>Geplant (h)</TableHead><TableHead>Ist (h)</TableHead><TableHead>Score</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {effizienzPerClient.map(e => (
                    <TableRow key={e.name}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{e.geplant}</TableCell>
                      <TableCell>{e.ist}</TableCell>
                      <TableCell>
                        <Badge variant={e.score > 120 ? 'destructive' : e.score > 100 ? 'secondary' : 'default'} className="text-xs">
                          {e.score}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ═══ SECTION 4: AD PERFORMANCE ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Ad Performance
          </h2>
          <Select value={adFilter} onValueChange={(v) => setAdFilter(v as TimeFilter)}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Letzte Woche</SelectItem>
              <SelectItem value="month">Letzter Monat</SelectItem>
              <SelectItem value="all">Insgesamt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Spend', value: `€${adTotals.spend.toLocaleString('de-DE')}` },
            { label: 'Leads', value: adTotals.leads },
            { label: 'CPL', value: `€${adTotals.cpl.toFixed(2)}` },
            { label: 'Termine', value: adTotals.appts },
            { label: 'Cost/Termin', value: `€${adTotals.cpa.toFixed(2)}` },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="p-4 text-center">
                <p className="text-xl font-heading font-bold">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Spend vs. Leads Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={adChartData}>
                <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={10} />
                <YAxis yAxisId="left" stroke="hsl(43, 56%, 52%)" fontSize={10} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(142, 71%, 45%)" fontSize={10} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="Spend" stroke="hsl(43, 56%, 52%)" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="Leads" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Datum</TableHead><TableHead>Spend</TableHead><TableHead>Leads</TableHead>
              <TableHead>CPL</TableHead><TableHead>Termine</TableHead><TableHead>Cost/Termin</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredAds.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                  <TableCell>€{Number(r.spend || 0).toLocaleString('de-DE')}</TableCell>
                  <TableCell>{r.leads}</TableCell>
                  <TableCell>€{Number(r.cpl || 0).toFixed(2)}</TableCell>
                  <TableCell>{r.appointments}</TableCell>
                  <TableCell>€{Number(r.cost_per_appointment || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </section>
    </div>
  );
}
