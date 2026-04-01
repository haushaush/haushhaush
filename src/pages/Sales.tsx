import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Mail, ChevronLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E5E7', borderRadius: '8px', color: '#1D1D1F' };
type TimeFilter = 'week' | 'month' | 'all';

function getDateThreshold(filter: TimeFilter): string | null {
  if (filter === 'all') return null;
  const d = new Date();
  if (filter === 'week') d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

export default function Sales() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab || 'kpis';
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [salesFilter, setSalesFilter] = useState<TimeFilter>('all');
  const [selectedSetter, setSelectedSetter] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    Promise.all([
      supabase.from('sales_performance').select('*').order('datum', { ascending: false }),
      supabase.from('team').select('*'),
    ]).then(([s, t]) => {
      setSalesData(s.data || []);
      setTeam(t.data || []);
      setLoading(false);
    });
  }, []);

  const getName = (id: string) => team.find(t => t.id === id)?.name || '–';
  const chartHeight = isMobile ? 200 : 260;

  const filteredSales = useMemo(() => {
    const threshold = getDateThreshold(salesFilter);
    return threshold ? salesData.filter(r => r.datum >= threshold) : salesData;
  }, [salesData, salesFilter]);

  // Show ALL setters/closers even with 0 data
  const setterLeaderboard = useMemo(() => {
    const setters = team.filter(t => ['Setter', 'Closer'].includes(t.rolle));
    return setters.map(setter => {
      const data = filteredSales.filter(r => r.setter_id === setter.id);
      return {
        id: setter.id, name: setter.name,
        calls: data.reduce((s, r) => s + (r.calls_made || 0), 0),
        appts: data.reduce((s, r) => s + (r.appointments_set || 0), 0),
        showUps: data.reduce((s, r) => s + (r.show_ups || 0), 0),
        closes: data.reduce((s, r) => s + (r.closes || 0), 0),
        revenue: data.reduce((s, r) => s + Number(r.revenue_generated || 0), 0),
        coldSent: data.reduce((s, r) => s + (r.cold_mails_sent || 0), 0),
        coldResp: data.reduce((s, r) => s + (r.cold_mail_responses || 0), 0),
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, team]);

  const coldMailTotals = useMemo(() => {
    const sent = setterLeaderboard.reduce((s, r) => s + r.coldSent, 0);
    const resp = setterLeaderboard.reduce((s, r) => s + r.coldResp, 0);
    return { sent, resp, rate: sent > 0 ? ((resp / sent) * 100).toFixed(1) : '0' };
  }, [setterLeaderboard]);

  const setterDetail = useMemo(() => selectedSetter ? filteredSales.filter(r => r.setter_id === selectedSetter).reverse() : [], [selectedSetter, filteredSales]);

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-muted-foreground text-sm">KPIs, Vorquali & Cold Mail</p>
      </div>

      <Tabs value={currentTab} onValueChange={v => navigate(`/sales/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="kpis">KPIs & Leaderboard</TabsTrigger>
          <TabsTrigger value="vorquali">Vorqualifikation</TabsTrigger>
          <TabsTrigger value="leads">Leadkauf</TabsTrigger>
          <TabsTrigger value="coldmail">Cold Mail</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Setter Leaderboard</h2>
            <Select value={salesFilter} onValueChange={(v) => setSalesFilter(v as TimeFilter)}>
              <SelectTrigger className="w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Diese Woche</SelectItem>
                <SelectItem value="month">Diesen Monat</SelectItem>
                <SelectItem value="all">Insgesamt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedSetter ? (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedSetter(null)}><ChevronLeft className="h-4 w-4" /> Zurück</Button>
              <Card>
                <CardHeader><CardTitle className="text-base">{getName(selectedSetter)} – Salessheet</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={setterDetail}>
                      <XAxis dataKey="datum" stroke="#AEAEB2" fontSize={10} />
                      <YAxis stroke="#AEAEB2" fontSize={10} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="calls_made" fill="hsl(174, 90%, 31%)" name="Calls" radius={[3,3,0,0]} />
                      <Bar dataKey="appointments_set" fill="hsl(142, 71%, 45%)" name="Termine" radius={[3,3,0,0]} />
                      <Bar dataKey="closes" fill="hsl(215, 60%, 50%)" name="Closes" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>#</TableHead><TableHead>Setter</TableHead><TableHead>Calls</TableHead>
                    <TableHead>Terminquote</TableHead><TableHead className="hidden sm:table-cell">Show-up</TableHead>
                    <TableHead className="hidden sm:table-cell">Close Rate</TableHead><TableHead>Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {setterLeaderboard.map((s, i) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedSetter(s.id)}>
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
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Cold Mail Performance</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center"><p className="text-2xl font-bold">{coldMailTotals.sent}</p><p className="text-xs text-muted-foreground">Gesendet</p></div>
                    <div className="text-center"><p className="text-2xl font-bold">{coldMailTotals.resp}</p><p className="text-xs text-muted-foreground">Responses</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-primary">{coldMailTotals.rate}%</p><p className="text-xs text-muted-foreground">Response Rate</p></div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="vorquali" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="font-medium">Vorqualifikation</p>
            <p className="text-sm mt-1">Leads Called · Termine gesetzt · Terminquote · No-Shows</p>
            <p className="text-xs mt-2">Daten werden aus vorquali_kpi geladen.</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="font-medium">Leadkauf</p>
            <p className="text-sm mt-1">Lead-Quellen, Kosten pro Lead, Qualitäts-Tracking</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="coldmail" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cold Mail Performance</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center"><p className="text-2xl font-bold">{coldMailTotals.sent}</p><p className="text-xs text-muted-foreground">Gesendet</p></div>
                <div className="text-center"><p className="text-2xl font-bold">{coldMailTotals.resp}</p><p className="text-xs text-muted-foreground">Responses</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-primary">{coldMailTotals.rate}%</p><p className="text-xs text-muted-foreground">Rate</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
