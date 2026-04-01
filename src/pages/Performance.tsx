import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { AlertTriangle, TrendingUp, Users, Briefcase, Mail, Clock, Target, ChevronLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSearchParams } from 'react-router-dom';

const tooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };

type TimeFilter = 'week' | 'month' | 'all';

function getDateThreshold(filter: TimeFilter): string | null {
  if (filter === 'all') return null;
  const d = new Date();
  if (filter === 'week') d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

export default function Performance() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'sales';
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

  // ── Vorquali (placeholder) ──
  const filterLabel = (f: TimeFilter) => f === 'week' ? 'Diese Woche' : f === 'month' ? 'Diesen Monat' : 'Insgesamt';

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Performance-Daten werden geladen">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Performance</h1>
        <p className="text-muted-foreground text-sm">Alle KPIs und Performance-Daten</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="sales" className="min-h-[44px]">Sales KPIs</TabsTrigger>
          <TabsTrigger value="ads" className="min-h-[44px]">Ad Performance</TabsTrigger>
          <TabsTrigger value="vorquali" className="min-h-[44px]">Vorquali</TabsTrigger>
          <TabsTrigger value="fulfillment" className="min-h-[44px]">Fulfillment</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: SALES KPIs ═══ */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" /> Setter Leaderboard
            </h2>
            <Select value={salesFilter} onValueChange={(v) => setSalesFilter(v as TimeFilter)}>
              <SelectTrigger className="w-[160px] min-h-[44px] text-xs" aria-label="Zeitraum filtern"><SelectValue /></SelectTrigger>
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
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Zurück
              </Button>
              <Card>
                <CardHeader><CardTitle className="text-base">{getName(selectedSetter)} – Salessheet ({filterLabel(salesFilter)})</CardTitle></CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Detaildaten für {getName(selectedSetter)}</caption>
                  <TableHeader><TableRow>
                    <TableHead scope="col">Datum</TableHead><TableHead scope="col">Calls</TableHead><TableHead scope="col">Termine</TableHead>
                    <TableHead scope="col">Show-Ups</TableHead><TableHead scope="col">Closes</TableHead><TableHead scope="col">Revenue</TableHead>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent></Card>
            </div>
          ) : (
            <>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Setter Leaderboard</caption>
                  <TableHeader><TableRow>
                    <TableHead scope="col">#</TableHead><TableHead scope="col">Setter</TableHead><TableHead scope="col">Calls</TableHead>
                    <TableHead scope="col">Terminquote</TableHead><TableHead scope="col" className="hidden sm:table-cell">Show-up</TableHead>
                    <TableHead scope="col" className="hidden sm:table-cell">Close Rate</TableHead><TableHead scope="col">Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {setterLeaderboard.map((s, i) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-primary/5 min-h-[44px]" onClick={() => setSelectedSetter(s.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelectedSetter(s.id)} role="button" aria-label={`Details für ${s.name}`}>
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
              </div></CardContent></Card>

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
        </TabsContent>

        {/* ═══ TAB 2: AD PERFORMANCE ═══ */}
        <TabsContent value="ads" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" aria-hidden="true" /> Ad Performance
            </h2>
            <Select value={adFilter} onValueChange={(v) => setAdFilter(v as TimeFilter)}>
              <SelectTrigger className="w-[160px] min-h-[44px] text-xs" aria-label="Zeitraum filtern"><SelectValue /></SelectTrigger>
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
              <Card key={m.label}><CardContent className="p-3 sm:p-4 text-center">
                <p className="text-lg sm:text-xl font-heading font-bold">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Spend vs. Leads</CardTitle></CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card><CardContent className="p-0"><div className="overflow-x-auto">
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
          </div></CardContent></Card>
        </TabsContent>

        {/* ═══ TAB 3: VORQUALI ═══ */}
        <TabsContent value="vorquali" className="space-y-4 mt-4">
          <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" /> Vorqualifikation
          </h2>
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p>Vorquali-Tracking wird hier angezeigt, sobald Daten vorhanden sind.</p>
            <p className="text-xs mt-2">Leads Called · Termine gesetzt · Terminquote · No-Shows</p>
          </CardContent></Card>
        </TabsContent>

        {/* ═══ TAB 4: FULFILLMENT ═══ */}
        <TabsContent value="fulfillment" className="space-y-4 mt-4">
          <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" aria-hidden="true" /> Fulfillment
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-heading font-bold">{activeProjects.length}</p><p className="text-xs text-muted-foreground">Aktive Projekte</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-heading font-bold">{avgTaskCompletion}%</p><p className="text-xs text-muted-foreground">Task Completion</p></CardContent></Card>
            <Card className={overdueTasks.length > 0 ? 'border-destructive/40' : ''}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-heading font-bold ${overdueTasks.length > 0 ? 'text-destructive' : ''}`}>{overdueTasks.length}</p>
                <p className="text-xs text-muted-foreground">Überfällige Aufgaben</p>
                {overdueTasks.length > 0 && <AlertTriangle className="inline h-4 w-4 text-destructive mt-1" aria-label="Warnung" />}
              </CardContent>
            </Card>
          </div>

          {effizienzPerClient.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" aria-hidden="true" /> Effizienz Score</CardTitle></CardHeader>
              <CardContent className="p-0"><div className="overflow-x-auto">
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
                        <TableCell><Badge variant={e.score > 120 ? 'destructive' : e.score > 100 ? 'secondary' : 'default'} className="text-xs">{e.score}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
