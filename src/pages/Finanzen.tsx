import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Euro, TrendingUp, TrendingDown, AlertTriangle, Upload } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Database } from '@/integrations/supabase/types';

type Finance = Database['public']['Tables']['finance']['Row'];
const tooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };

const PIE_COLORS = ['hsl(43, 56%, 52%)', 'hsl(142, 71%, 45%)', 'hsl(215, 60%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(270, 50%, 50%)'];

export default function Finanzen() {
  const [records, setRecords] = useState<Finance[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { isAdminOrManager } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ client_id: '', betrag: 0, typ: 'Einnahme' as 'Einnahme' | 'Ausgabe', datum: new Date().toISOString().split('T')[0], zahlstatus: 'Offen', rechnung_nr: '' });

  const fetchData = async () => {
    const [f, c] = await Promise.all([
      supabase.from('finance').select('*').order('datum', { ascending: false }),
      supabase.from('clients').select('id, name'),
    ]);
    if (f.data) setRecords(f.data);
    if (c.data) setClients(c.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('finance').insert({ ...form, client_id: form.client_id || null });
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Eintrag erstellt' });
    setDialogOpen(false);
    fetchData();
  };

  const totalEinnahmen = records.filter(r => r.typ === 'Einnahme').reduce((s, r) => s + Number(r.betrag), 0);
  const totalAusgaben = records.filter(r => r.typ === 'Ausgabe').reduce((s, r) => s + Number(r.betrag), 0);
  const openInvoices = records.filter(r => r.zahlstatus === 'Offen' && r.typ === 'Einnahme').reduce((s, r) => s + Number(r.betrag), 0);
  const overdueCount = records.filter(r => r.zahlstatus === 'Offen' && r.typ === 'Einnahme' && (Date.now() - new Date(r.datum).getTime()) / 86400000 > 14).length;
  const clientName = (id: string | null) => id ? clients.find(c => c.id === id)?.name || '–' : '–';

  const rechnungen = useMemo(() => records.filter(r => r.typ === 'Einnahme'), [records]);
  const filteredRechnungen = useMemo(() => {
    if (filterStatus === 'all') return rechnungen;
    return rechnungen.filter(r => r.zahlstatus === filterStatus);
  }, [rechnungen, filterStatus]);

  const ausgaben = useMemo(() => records.filter(r => r.typ === 'Ausgabe'), [records]);

  // Charts
  const monthMap: Record<string, { einnahmen: number; ausgaben: number }> = {};
  records.forEach(r => {
    const m = r.datum.substring(0, 7);
    if (!monthMap[m]) monthMap[m] = { einnahmen: 0, ausgaben: 0 };
    if (r.typ === 'Einnahme') monthMap[m].einnahmen += Number(r.betrag);
    else monthMap[m].ausgaben += Number(r.betrag);
  });
  const chartData = Object.entries(monthMap).sort().slice(-12).map(([month, d]) => ({ month, ...d }));

  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    records.filter(r => r.typ === 'Einnahme' && r.client_id).forEach(r => {
      map.set(r.client_id!, (map.get(r.client_id!) || 0) + Number(r.betrag));
    });
    return Array.from(map.entries())
      .map(([id, value]) => ({ name: clientName(id), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [records, clients]);

  // Ausgaben by category (pie chart placeholder)
  const ausgabenMonthMap: Record<string, number> = {};
  ausgaben.forEach(r => {
    const m = r.datum.substring(0, 7);
    ausgabenMonthMap[m] = (ausgabenMonthMap[m] || 0) + Number(r.betrag);
  });
  const ausgabenPieData = Object.entries(ausgabenMonthMap).sort().slice(-6).map(([month, value]) => ({ name: month, value }));

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Finanzdaten werden geladen">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Finanzen</h1>
          <p className="text-muted-foreground text-sm">Einnahmen, Rechnungen & Ausgaben</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button className="min-h-[44px]"><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Neuer Eintrag</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-none">
              <DialogHeader><DialogTitle>Finanzeintrag anlegen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label htmlFor="fin-client">Kunde</Label>
                  <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                    <SelectTrigger id="fin-client"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label htmlFor="fin-betrag">Betrag (€) *</Label><Input id="fin-betrag" type="number" step="0.01" value={form.betrag} onChange={e => setForm({...form, betrag: +e.target.value})} required /></div>
                  <div><Label htmlFor="fin-typ">Typ</Label>
                    <Select value={form.typ} onValueChange={v => setForm({...form, typ: v as 'Einnahme' | 'Ausgabe'})}>
                      <SelectTrigger id="fin-typ"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Einnahme">Einnahme</SelectItem><SelectItem value="Ausgabe">Ausgabe</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="fin-datum">Datum</Label><Input id="fin-datum" type="date" value={form.datum} onChange={e => setForm({...form, datum: e.target.value})} /></div>
                  <div><Label htmlFor="fin-rechnung">Rechnungsnr.</Label><Input id="fin-rechnung" value={form.rechnung_nr} onChange={e => setForm({...form, rechnung_nr: e.target.value})} /></div>
                </div>
                <Button type="submit" className="w-full min-h-[44px]">Speichern</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="uebersicht">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht" className="min-h-[44px]">Übersicht</TabsTrigger>
          <TabsTrigger value="rechnungen" className="min-h-[44px]">Rechnungen ({rechnungen.length})</TabsTrigger>
          <TabsTrigger value="belege" className="min-h-[44px]">Belege ({ausgaben.length})</TabsTrigger>
        </TabsList>

        {/* TAB 1: ÜBERSICHT */}
        <TabsContent value="uebersicht" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="MRR" value={`€${totalEinnahmen.toLocaleString('de-DE')}`} icon={TrendingUp} />
            <StatCard title="ARR" value={`€${(totalEinnahmen * 12).toLocaleString('de-DE')}`} icon={Euro} />
            <StatCard title="Offene Rechnungen" value={`€${openInvoices.toLocaleString('de-DE')}`} icon={AlertTriangle} />
            <StatCard title="Überfällig" value={overdueCount} icon={TrendingDown} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg">Revenue (12 Monate)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                <BarChart data={chartData}>
                  <XAxis dataKey="month" stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 9 : 11} />
                  <YAxis stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 9 : 11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="einnahmen" fill="hsl(43, 56%, 52%)" name="Einnahmen" radius={[3,3,0,0]} />
                  <Bar dataKey="ausgaben" fill="hsl(0, 84%, 60%)" name="Ausgaben" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {topClients.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Top Kunden nach Umsatz</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topClients.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary w-4">{i + 1}</span>
                        <span>{c.name}</span>
                      </div>
                      <span className="font-medium">€{c.value.toLocaleString('de-DE')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: RECHNUNGEN */}
        <TabsContent value="rechnungen" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48 min-h-[44px]" aria-label="Status filtern"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="Offen">Offen</SelectItem>
                <SelectItem value="Bezahlt">Bezahlt</SelectItem>
                <SelectItem value="Entwurf">Entwurf</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Rechnungen</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Rechnungsnr.</TableHead><TableHead scope="col">Kunde</TableHead>
                <TableHead scope="col">Betrag</TableHead><TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Datum</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredRechnungen.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Keine Rechnungen</TableCell></TableRow>
                ) : filteredRechnungen.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.rechnung_nr || '–'}</TableCell>
                    <TableCell className="text-muted-foreground">{clientName(r.client_id)}</TableCell>
                    <TableCell className="font-medium">€{Number(r.betrag).toLocaleString('de-DE')}</TableCell>
                    <TableCell>
                      <Badge variant={r.zahlstatus === 'Bezahlt' ? 'secondary' : r.zahlstatus === 'Offen' ? 'destructive' : 'outline'} className="text-xs">{r.zahlstatus}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        {/* TAB 3: BELEGE */}
        <TabsContent value="belege" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold">Ausgaben & Belege</h2>
            <Button variant="outline" className="min-h-[44px]" onClick={() => toast({ title: 'Upload', description: 'Beleg-Upload folgt mit Storage-Anbindung' })}>
              <Upload className="h-4 w-4 mr-1" />Beleg hochladen
            </Button>
          </div>

          {ausgabenPieData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Ausgaben pro Monat</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={ausgabenPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: €${value}`}>
                      {ausgabenPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Ausgaben</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Datum</TableHead><TableHead scope="col">Kunde</TableHead>
                <TableHead scope="col">Betrag</TableHead><TableHead scope="col">Rechnung</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ausgaben.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Keine Ausgaben</TableCell></TableRow>
                ) : ausgaben.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                    <TableCell className="text-muted-foreground">{clientName(r.client_id)}</TableCell>
                    <TableCell className="font-medium">€{Number(r.betrag).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="text-muted-foreground">{r.rechnung_nr || '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
