import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Target, AlertTriangle, Clock, Star } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E5E7', borderRadius: '8px', color: '#1D1D1F' };
type TimeFilter = 'week' | 'month' | 'all';

export default function Fulfillment() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab || 'ads';
  const [loading, setLoading] = useState(true);
  const [adData, setAdData] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [adFilter, setAdFilter] = useState<TimeFilter>('all');
  const isMobile = useIsMobile();

  useEffect(() => {
    Promise.all([
      supabase.from('ad_performance_intern').select('*').order('datum', { ascending: false }),
      supabase.from('close_deals').select('*').eq('status', 'Aktiv'),
      supabase.from('projects').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('team').select('*'),
    ]).then(([a, d, p, t, c, tm]) => {
      setAdData(a.data || []);
      setDeals(d.data || []);
      setProjects(p.data || []);
      setTasks(t.data || []);
      setClients(c.data || []);
      setTeam(tm.data || []);
      setLoading(false);
    });
  }, []);

  const filteredAds = useMemo(() => {
    if (adFilter === 'all') return adData;
    const d = new Date();
    if (adFilter === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    const threshold = d.toISOString().split('T')[0];
    return adData.filter(r => r.datum >= threshold);
  }, [adData, adFilter]);

  const adTotals = useMemo(() => {
    const spend = filteredAds.reduce((s, r) => s + Number(r.spend || 0), 0);
    const leads = filteredAds.reduce((s, r) => s + (r.leads || 0), 0);
    const appts = filteredAds.reduce((s, r) => s + (r.appointments || 0), 0);
    return { spend, leads, cpl: leads > 0 ? spend / leads : 0, appts, cpa: appts > 0 ? spend / appts : 0 };
  }, [filteredAds]);

  const adChartData = useMemo(() => filteredAds.slice().reverse().map(r => ({ datum: r.datum, Spend: Number(r.spend || 0), Leads: r.leads || 0 })), [filteredAds]);

  const activeProjects = projects.filter(p => p.status === 'Aktiv');
  const overdueTasks = tasks.filter(t => t.status !== 'Erledigt' && t.due_date && new Date(t.due_date) < new Date());
  const avgCompletion = tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'Erledigt').length / tasks.length) * 100) : 0;

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fulfillment</h1>
        <p className="text-muted-foreground text-sm">Ad Performance, Mediabuying & Customer Success</p>
      </div>

      <Tabs value={currentTab} onValueChange={v => navigate(`/fulfillment/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="ads">Ad Performance</TabsTrigger>
          <TabsTrigger value="mediabuying">Mediabuying</TabsTrigger>
          <TabsTrigger value="customer-success">Customer Success</TabsTrigger>
        </TabsList>

        <TabsContent value="ads" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Ad Performance</h2>
            <Select value={adFilter} onValueChange={(v) => setAdFilter(v as TimeFilter)}>
              <SelectTrigger className="w-[160px] text-xs"><SelectValue /></SelectTrigger>
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
              <Card key={m.label}><CardContent className="p-3 text-center">
                <p className="text-lg font-bold">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Spend vs. Leads</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                <LineChart data={adChartData}>
                  <XAxis dataKey="datum" stroke="#AEAEB2" fontSize={10} />
                  <YAxis yAxisId="left" stroke="hsl(174, 90%, 31%)" fontSize={10} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(142, 71%, 45%)" fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="Spend" stroke="hsl(174, 90%, 31%)" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Leads" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mediabuying" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="font-medium">Mediabuying</p>
            <p className="text-sm mt-1">Kunde · Ad Account · Budget · Letzte Optimierung · Assignee</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="customer-success" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Customer Success</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{activeProjects.length}</p><p className="text-xs text-muted-foreground">Aktive Projekte</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{avgCompletion}%</p><p className="text-xs text-muted-foreground">Task Completion</p></CardContent></Card>
            <Card className={overdueTasks.length > 0 ? 'border-destructive/40' : ''}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${overdueTasks.length > 0 ? 'text-destructive' : ''}`}>{overdueTasks.length}</p>
                <p className="text-xs text-muted-foreground">Überfällig</p>
              </CardContent>
            </Card>
          </div>

          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Kunde</TableHead><TableHead>Health</TableHead><TableHead>Ampel</TableHead><TableHead>Offene Tasks</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {deals.map(d => {
                  const openTasks = tasks.filter(t => t.client_id === d.id && t.status !== 'Erledigt').length;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.client_name}</TableCell>
                      <TableCell><div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= (d.health_score || 3) ? 'text-primary fill-primary' : 'text-muted'}`} />)}</div></TableCell>
                      <TableCell><Badge variant={d.ampelstatus === 'Rot' ? 'destructive' : d.ampelstatus === 'Gelb' ? 'secondary' : 'default'} className="text-[10px]">{d.ampelstatus}</Badge></TableCell>
                      <TableCell>{openTasks}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
