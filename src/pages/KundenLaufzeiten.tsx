import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';

export default function KundenLaufzeiten() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('close_deals').select('*').eq('status', 'Aktiv').order('start_datum').then(({ data }) => {
      setDeals(data || []);
      setLoading(false);
    });
  }, []);

  const withLaufzeit = useMemo(() => deals.filter(d => d.start_datum && d.laufzeit_monate).map(d => {
    const start = new Date(d.start_datum);
    const end = new Date(d.start_datum);
    end.setMonth(end.getMonth() + d.laufzeit_monate);
    const total = end.getTime() - start.getTime();
    const elapsed = Date.now() - start.getTime();
    const remaining = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    return { ...d, endDate: end, remaining, pct };
  }).sort((a, b) => a.remaining - b.remaining), [deals]);

  const critical = withLaufzeit.filter(d => d.remaining < 14).length;

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Laufzeiten</h1>
        <p className="text-muted-foreground text-sm">Aktive Verträge nach Ablaufdatum</p>
      </div>

      {critical > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3" role="alert">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">{critical} Kunden laufen in weniger als 14 Tagen aus</p>
        </div>
      )}

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Kunde</TableHead><TableHead>Startdatum</TableHead><TableHead>Laufzeit</TableHead>
            <TableHead>Enddatum</TableHead><TableHead>Verbleibend</TableHead><TableHead className="w-40">Progress</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {withLaufzeit.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.client_name}</TableCell>
                <TableCell className="text-muted-foreground">{d.start_datum}</TableCell>
                <TableCell className="text-muted-foreground">{d.laufzeit_monate}M</TableCell>
                <TableCell className="text-muted-foreground">{d.endDate.toLocaleDateString('de-DE')}</TableCell>
                <TableCell className={d.remaining < 14 ? 'text-destructive font-medium' : d.remaining < 60 ? 'text-warning font-medium' : 'text-muted-foreground'}>{d.remaining} Tage</TableCell>
                <TableCell><Progress value={d.pct} className={`h-2 ${d.remaining < 14 ? '[&>div]:bg-destructive' : d.remaining < 60 ? '[&>div]:bg-warning' : ''}`} /></TableCell>
              </TableRow>
            ))}
            {withLaufzeit.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine aktiven Laufzeiten</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}
