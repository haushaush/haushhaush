import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const chartTooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };

export default function KPI() {
  const [salesData, setSalesData] = useState<any[]>([]);
  const [adData, setAdData] = useState<any[]>([]);
  const [vorqualiData, setVorqualiData] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const [s, a, v, t] = await Promise.all([
        supabase.from('sales_performance').select('*').order('datum', { ascending: false }).limit(50),
        supabase.from('ad_performance_intern').select('*').order('datum', { ascending: false }).limit(50),
        supabase.from('vorquali_kpi').select('*').order('datum', { ascending: false }).limit(50),
        supabase.from('team').select('id, name'),
      ]);
      if (s.data) setSalesData(s.data);
      if (a.data) setAdData(a.data);
      if (v.data) setVorqualiData(v.data);
      if (t.data) setTeam(t.data);
    };
    fetch();
  }, []);

  const getName = (id: string) => team.find(t => t.id === id)?.name || '–';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">KPI</h1>
        <p className="text-muted-foreground text-sm">Performance-Kennzahlen</p>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales Performance</TabsTrigger>
          <TabsTrigger value="ads">Ad Performance</TabsTrigger>
          <TabsTrigger value="vorquali">Vorquali</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Calls & Termine</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesData.slice().reverse()}>
                  <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={11} />
                  <YAxis stroke="hsl(215, 20%, 55%)" fontSize={11} />
                  <Tooltip contentStyle={chartTooltipStyle} />
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
                <TableHead>Setter</TableHead><TableHead>Datum</TableHead><TableHead>Calls</TableHead>
                <TableHead>Termine</TableHead><TableHead>Show-Ups</TableHead><TableHead>Closes</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {salesData.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{getName(r.setter_id)}</TableCell>
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
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ads" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Spend & CPL Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={adData.slice().reverse()}>
                  <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={11} />
                  <YAxis stroke="hsl(215, 20%, 55%)" fontSize={11} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="spend" stroke="hsl(43, 56%, 52%)" name="Spend (€)" strokeWidth={2} />
                  <Line type="monotone" dataKey="cpl" stroke="hsl(0, 84%, 60%)" name="CPL (€)" strokeWidth={2} />
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
                {adData.map(r => (
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
        </TabsContent>

        <TabsContent value="vorquali" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Terminquote Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={vorqualiData.slice().reverse()}>
                  <XAxis dataKey="datum" stroke="hsl(215, 20%, 55%)" fontSize={11} />
                  <YAxis stroke="hsl(215, 20%, 55%)" fontSize={11} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="terminquote" stroke="hsl(43, 56%, 52%)" name="Terminquote (%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Setter</TableHead><TableHead>Datum</TableHead><TableHead>Leads Called</TableHead>
                <TableHead>Termine</TableHead><TableHead>Terminquote</TableHead><TableHead>No-Shows</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {vorqualiData.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{getName(r.setter_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                    <TableCell>{r.leads_called}</TableCell>
                    <TableCell>{r.appointments_set}</TableCell>
                    <TableCell>{Number(r.terminquote || 0).toFixed(1)}%</TableCell>
                    <TableCell>{r.no_shows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
