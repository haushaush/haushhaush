import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Euro, TrendingUp, TrendingDown } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Database } from '@/integrations/supabase/types';

type Finance = Database['public']['Tables']['finance']['Row'];
const tooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };

export default function Finanzen() {
  const [records, setRecords] = useState<Finance[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterTyp, setFilterTyp] = useState<string>('all');
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
  const filtered = filterTyp === 'all' ? records : records.filter(r => r.typ === filterTyp);
  const clientName = (id: string | null) => id ? clients.find(c => c.id === id)?.name || '–' : '–';

  const monthMap: Record<string, { einnahmen: number; ausgaben: number }> = {};
  records.forEach(r => {
    const m = r.datum.substring(0, 7);
    if (!monthMap[m]) monthMap[m] = { einnahmen: 0, ausgaben: 0 };
    if (r.typ === 'Einnahme') monthMap[m].einnahmen += Number(r.betrag);
    else monthMap[m].ausgaben += Number(r.betrag);
  });
  const chartData = Object.entries(monthMap).sort().slice(-6).map(([month, d]) => ({ month, ...d }));

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Finanzdaten werden geladen">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Finanzen</h1>
          <p className="text-muted-foreground text-sm">Einnahmen & Ausgaben</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Einnahmen" value={`€${totalEinnahmen.toLocaleString('de-DE')}`} icon={TrendingUp} />
        <StatCard title="Ausgaben" value={`€${totalAusgaben.toLocaleString('de-DE')}`} icon={TrendingDown} />
        <StatCard title="Saldo" value={`€${(totalEinnahmen - totalAusgaben).toLocaleString('de-DE')}`} icon={Euro} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Monatliche Übersicht</CardTitle></CardHeader>
        <CardContent>
          <div role="img" aria-label={`Monatliche Finanzübersicht: ${chartData.map(d => `${d.month}: €${d.einnahmen} Einnahmen, €${d.ausgaben} Ausgaben`).join('; ')}`}>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
              <BarChart data={chartData}>
                <XAxis dataKey="month" stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 9 : 11} />
                <YAxis stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 9 : 11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="einnahmen" fill="hsl(43, 56%, 52%)" name="Einnahmen" radius={[3,3,0,0]} />
                <Bar dataKey="ausgaben" fill="hsl(0, 84%, 60%)" name="Ausgaben" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Select value={filterTyp} onValueChange={setFilterTyp}>
        <SelectTrigger className="w-48 min-h-[44px]" aria-label="Typ filtern"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle Typen</SelectItem><SelectItem value="Einnahme">Einnahmen</SelectItem><SelectItem value="Ausgabe">Ausgaben</SelectItem></SelectContent>
      </Select>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Finanzeinträge</caption>
            <TableHeader><TableRow>
              <TableHead scope="col">Datum</TableHead><TableHead scope="col">Kunde</TableHead><TableHead scope="col">Typ</TableHead>
              <TableHead scope="col">Betrag</TableHead><TableHead scope="col">Zahlstatus</TableHead><TableHead scope="col" className="hidden sm:table-cell">Rechnung</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine Einträge</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{r.datum}</TableCell>
                  <TableCell>{clientName(r.client_id)}</TableCell>
                  <TableCell><Badge variant={r.typ === 'Einnahme' ? 'default' : 'destructive'}>{r.typ}</Badge></TableCell>
                  <TableCell className="font-medium">€{Number(r.betrag).toLocaleString('de-DE')}</TableCell>
                  <TableCell><Badge variant="outline">{r.zahlstatus}</Badge></TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{r.rechnung_nr || '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
