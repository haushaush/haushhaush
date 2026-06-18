import { useEffect, useState, useMemo } from 'react';
import { Werbebudgets } from '@/components/finanzen/Werbebudgets';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Wallet } from 'lucide-react';
import { useQontoAccounts } from '@/hooks/useDataSources';
import { StatCard } from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useIsMobile } from '@/hooks/use-mobile';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E5E7', borderRadius: '8px', color: '#1D1D1F' };
const ALLOWED_TABS = ['uebersicht', 'rechnungen', 'werbebudgets'];

export default function Finanzen() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab && ALLOWED_TABS.includes(tab) ? tab : 'uebersicht';
  const [records, setRecords] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const isMobile = useIsMobile();
  const qonto = useQontoAccounts();

  useEffect(() => {
    Promise.all([
      supabase.from('finance').select('*').order('datum', { ascending: false }),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('recurring_revenues').select('*').eq('is_active', true),
      supabase.from('clients').select('id, name'),
    ]).then(([f, inv, rec, c]) => {
      setRecords(f.data || []);
      setInvoices(inv.data || []);
      setRecurring(rec.data || []);
      setClients(c.data || []);
      setLoading(false);
    });
  }, []);

  const mrr = recurring.reduce((s, r) => s + Number(r.monthly_amount || 0), 0);
  const openInvoices = invoices.filter(i => i.status === 'Versendet');
  const openTotal = openInvoices.reduce((s, i) => s + Number(i.brutto || 0), 0);
  const overdueCount = invoices.filter(i => i.status === 'Versendet' && i.faelligkeitsdatum && (Date.now() - new Date(i.faelligkeitsdatum).getTime()) / 86400000 > 14).length;
  const clientName = (id: string | null) => id ? clients.find(c => c.id === id)?.name || '–' : '–';

  const rechnungen = useMemo(() => records.filter(r => r.typ === 'Einnahme'), [records]);
  const filteredRechnungen = useMemo(() => filterStatus === 'all' ? rechnungen : rechnungen.filter(r => r.zahlstatus === filterStatus), [rechnungen, filterStatus]);

  const monthMap: Record<string, { einnahmen: number; ausgaben: number }> = {};
  records.forEach(r => {
    const m = r.datum.substring(0, 7);
    if (!monthMap[m]) monthMap[m] = { einnahmen: 0, ausgaben: 0 };
    if (r.typ === 'Einnahme') monthMap[m].einnahmen += Number(r.betrag);
    else monthMap[m].ausgaben += Number(r.betrag);
  });
  const chartData = Object.entries(monthMap).sort().slice(-12).map(([month, d]) => ({ month, ...d }));

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Finanzen</h1>

      <Tabs value={currentTab} onValueChange={v => navigate(v === 'uebersicht' ? '/finanzen' : `/finanzen/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
          <TabsTrigger value="werbebudgets">Werbebudgets</TabsTrigger>
        </TabsList>

        <TabsContent value="uebersicht" className="space-y-6 mt-4">
          {/* Qonto Live Konten */}
          {!qonto.loading && qonto.data.accounts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Qonto Live</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-primary">
                    Gesamt: €{qonto.data.total_balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                  </span>
                  <button onClick={qonto.refetch} className="p-1 rounded hover:bg-muted transition-colors">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {qonto.data.accounts.map((acc: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-foreground">{acc.name}</p>
                        {acc.main && <Badge variant="secondary" className="text-[9px]">HAUPT</Badge>}
                      </div>
                      <p className={`text-xl font-bold ${acc.balance < 100 ? 'text-warning' : 'text-foreground'}`}>
                        €{acc.balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">{acc.iban}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

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

        <TabsContent value="werbebudgets" className="space-y-4 mt-4">
          <Werbebudgets />
        </TabsContent>
      </Tabs>
    </div>
  );
}
