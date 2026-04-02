import { useEffect, useState, useMemo } from 'react';
import { QontoBuchhaltung } from '@/components/finanzen/QontoBuchhaltung';
import { useParams, useNavigate } from 'react-router-dom';
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
import { Progress } from '@/components/ui/progress';
import { Plus, Upload, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E5E7', borderRadius: '8px', color: '#1D1D1F' };
const PIE_COLORS = ['hsl(174, 90%, 31%)', 'hsl(142, 71%, 45%)', 'hsl(215, 60%, 50%)', 'hsl(4, 90%, 58%)', 'hsl(270, 50%, 50%)'];

export default function Finanzen() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab || 'uebersicht';
  const [records, setRecords] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const { isAdminOrManager } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    Promise.all([
      supabase.from('finance').select('*').order('datum', { ascending: false }),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('close_deals').select('*').eq('status', 'Aktiv'),
      supabase.from('recurring_revenues').select('*').eq('is_active', true),
      supabase.from('clients').select('id, name'),
    ]).then(([f, inv, d, rec, c]) => {
      setRecords(f.data || []);
      setInvoices(inv.data || []);
      setDeals(d.data || []);
      setRecurring(rec.data || []);
      setClients(c.data || []);
      setLoading(false);
    });
  }, []);

  const mrr = recurring.reduce((s, r) => s + Number(r.monthly_amount || 0), 0);
  const totalEinnahmen = records.filter(r => r.typ === 'Einnahme').reduce((s, r) => s + Number(r.betrag), 0);
  const openInvoices = invoices.filter(i => i.status === 'Versendet');
  const openTotal = openInvoices.reduce((s, i) => s + Number(i.brutto || 0), 0);
  const overdueCount = invoices.filter(i => i.status === 'Versendet' && i.faelligkeitsdatum && (Date.now() - new Date(i.faelligkeitsdatum).getTime()) / 86400000 > 14).length;
  const clientName = (id: string | null) => id ? clients.find(c => c.id === id)?.name || '–' : '–';

  const rechnungen = useMemo(() => records.filter(r => r.typ === 'Einnahme'), [records]);
  const filteredRechnungen = useMemo(() => filterStatus === 'all' ? rechnungen : rechnungen.filter(r => r.zahlstatus === filterStatus), [rechnungen, filterStatus]);
  const ausgaben = useMemo(() => records.filter(r => r.typ === 'Ausgabe'), [records]);

  const monthMap: Record<string, { einnahmen: number; ausgaben: number }> = {};
  records.forEach(r => {
    const m = r.datum.substring(0, 7);
    if (!monthMap[m]) monthMap[m] = { einnahmen: 0, ausgaben: 0 };
    if (r.typ === 'Einnahme') monthMap[m].einnahmen += Number(r.betrag);
    else monthMap[m].ausgaben += Number(r.betrag);
  });
  const chartData = Object.entries(monthMap).sort().slice(-12).map(([month, d]) => ({ month, ...d }));

  // Laufzeiten
  const laufzeiten = useMemo(() => deals.filter(d => d.start_datum && d.laufzeit_monate).map(d => {
    const start = new Date(d.start_datum);
    const end = new Date(d.start_datum);
    end.setMonth(end.getMonth() + d.laufzeit_monate);
    const remaining = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
    const pct = Math.min(100, Math.max(0, ((Date.now() - start.getTime()) / (end.getTime() - start.getTime())) * 100));
    return { ...d, endDate: end, remaining, pct };
  }).sort((a, b) => a.remaining - b.remaining), [deals]);

  const criticalCount = laufzeiten.filter(d => d.remaining < 14).length;

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Finanzen</h1>

      <Tabs value={currentTab} onValueChange={v => navigate(v === 'uebersicht' ? '/finanzen' : `/finanzen/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
          <TabsTrigger value="belege">Belege</TabsTrigger>
          <TabsTrigger value="buchhaltung">Buchhaltung</TabsTrigger>
          <TabsTrigger value="laufzeiten">Laufzeiten</TabsTrigger>
        </TabsList>

        <TabsContent value="uebersicht" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="MRR" value={`€${mrr.toLocaleString('de-DE')}`} icon={TrendingUp} />
            <StatCard title="ARR" value={`€${(mrr * 12).toLocaleString('de-DE')}`} icon={TrendingUp} />
            <StatCard title="Offene Rechnungen" value={`€${openTotal.toLocaleString('de-DE')}`} icon={AlertTriangle} subtitle={`${openInvoices.length} offen`} />
            <StatCard title="Überfällig" value={overdueCount} icon={TrendingDown} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-lg">Revenue (12 Monate)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                <BarChart data={chartData}>
                  <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} />
                  <YAxis stroke="#AEAEB2" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="einnahmen" fill="hsl(174, 90%, 31%)" name="Einnahmen" radius={[3,3,0,0]} />
                  <Bar dataKey="ausgaben" fill="hsl(174, 40%, 85%)" name="Ausgaben" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rechnungen" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {['Offen','Bezahlt','Entwurf'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nr.</TableHead><TableHead>Kunde</TableHead><TableHead>Betrag</TableHead><TableHead>Status</TableHead><TableHead>Datum</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredRechnungen.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.rechnung_nr || '–'}</TableCell>
                    <TableCell className="text-muted-foreground">{clientName(r.client_id)}</TableCell>
                    <TableCell className="font-medium">€{Number(r.betrag).toLocaleString('de-DE')}</TableCell>
                    <TableCell><Badge variant={r.zahlstatus === 'Bezahlt' ? 'default' : 'destructive'} className="text-xs">{r.zahlstatus}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        <TabsContent value="belege" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ausgaben & Belege</h2>
            <Button variant="outline" onClick={() => toast({ title: 'Upload folgt' })}><Upload className="h-4 w-4 mr-1" />Beleg hochladen</Button>
          </div>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Datum</TableHead><TableHead>Kunde</TableHead><TableHead>Betrag</TableHead><TableHead>Rechnung</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ausgaben.map(r => (
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

        <TabsContent value="buchhaltung" className="space-y-4 mt-4">
          <h2 className="text-lg font-semibold">Buchhaltung</h2>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nr.</TableHead><TableHead>Kunde</TableHead><TableHead>Betrag</TableHead><TableHead>Fälligkeit</TableHead><TableHead>Status</TableHead><TableHead>Interne Notiz</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invoices.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoice_nr}</TableCell>
                    <TableCell className="text-muted-foreground">{i.client_name || '–'}</TableCell>
                    <TableCell className="font-medium">€{Number(i.brutto || 0).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="text-muted-foreground">{i.faelligkeitsdatum || '–'}</TableCell>
                    <TableCell><Badge variant={i.status === 'Bezahlt' ? 'default' : 'secondary'} className="text-xs">{i.status}</Badge></TableCell>
                    <TableCell><Input placeholder="Notiz..." className="h-7 text-xs" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Empfehlungen</CardTitle></CardHeader>
            <CardContent className="text-center text-muted-foreground py-6">
              <p className="text-sm">Empfehlungs-Tracking: Empfehler → Gutschrift</p>
              <Button variant="outline" className="mt-3"><Plus className="h-4 w-4 mr-1" />Empfehlung eintragen</Button>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => toast({ title: 'DATEV Export', description: 'CSV wird generiert...' })}>DATEV Export (CSV)</Button>

          {/* Qonto Section */}
          <QontoBuchhaltung />
        </TabsContent>

        <TabsContent value="laufzeiten" className="space-y-4 mt-4">
          <h2 className="text-lg font-semibold">Laufzeiten</h2>
          {criticalCount > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3" role="alert">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive">{criticalCount} Kunden laufen in weniger als 14 Tagen aus</p>
            </div>
          )}
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Kunde</TableHead><TableHead>Start</TableHead><TableHead>Laufzeit</TableHead><TableHead>Ende</TableHead><TableHead>Verbleibend</TableHead><TableHead className="w-32">Progress</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {laufzeiten.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.client_name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.start_datum}</TableCell>
                    <TableCell className="text-muted-foreground">{d.laufzeit_monate}M</TableCell>
                    <TableCell className="text-muted-foreground">{d.endDate.toLocaleDateString('de-DE')}</TableCell>
                    <TableCell className={d.remaining < 14 ? 'text-destructive font-medium' : d.remaining < 60 ? 'text-warning font-medium' : 'text-muted-foreground'}>{d.remaining} Tage</TableCell>
                    <TableCell><Progress value={d.pct} className={`h-2 ${d.remaining < 14 ? '[&>div]:bg-destructive' : d.remaining < 60 ? '[&>div]:bg-warning' : ''}`} /></TableCell>
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
