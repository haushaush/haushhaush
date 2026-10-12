import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';

type Row = {
  client_id: string; kunde: string | null; close_lead_id: string | null; close_status_label: string | null;
  startdatum: string | null; laufzeit_monate: number | null; vertragsende: string | null; fehlt: string[];
};
const dt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

export default function KundenLaufzeiten() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('kunden_laufzeit_stand').select('client_id, kunde, close_lead_id, close_status_label, startdatum, laufzeit_monate, vertragsende, fehlt')
      .then(({ data }) => { setRows((data as Row[]) || []); setLoading(false); });
  }, []);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const klar = useMemo(() => rows.filter(r => r.vertragsende)
    .map(r => ({ ...r, rest: Math.ceil((new Date(r.vertragsende!).getTime() - today.getTime()) / 86400000) }))
    .sort((a, b) => a.rest - b.rest), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const unklar = rows.filter(r => !r.vertragsende).sort((a, b) => (a.kunde || '').localeCompare(b.kunde || ''));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Laufzeiten</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Aktive Kunden laut Close („Aktueller Klient“, „Pausiert“). Vertragsende = Startdatum + Laufzeit aus dem gewonnenen Abschluss.</p>
      </div>
      {loading ? <Skeleton className="h-40" /> : <>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Aktive Kunden mit Laufzeit ({klar.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Kunde</TableHead><TableHead>Start</TableHead><TableHead>Laufzeit</TableHead><TableHead>Vertragsende</TableHead><TableHead className="text-right">Restlaufzeit</TableHead></TableRow></TableHeader>
              <TableBody>
                {klar.map(r => (
                  <TableRow key={r.client_id}>
                    <TableCell className="font-medium">{r.kunde}</TableCell>
                    <TableCell className="tabular-nums">{dt(r.startdatum)}</TableCell>
                    <TableCell className="tabular-nums">{r.laufzeit_monate} Mon.</TableCell>
                    <TableCell className="tabular-nums">{dt(r.vertragsende)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rest} Tage {r.rest < 30 && <Badge variant="destructive" className="ml-2">unter 30 Tage</Badge>}</TableCell>
                  </TableRow>
                ))}
                {!klar.length && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Noch kein aktiver Kunde mit vollständiger Laufzeit.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Laufzeit unklar ({unklar.length})</CardTitle>
            <p className="text-xs text-muted-foreground">Bitte in Close am Abschluss nachtragen — hier wird nichts geschätzt.</p></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Kunde</TableHead><TableHead>Was fehlt</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {unklar.map(r => (
                  <TableRow key={r.client_id}>
                    <TableCell className="font-medium">{r.kunde}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.fehlt.join(', ')}</TableCell>
                    <TableCell>{r.close_lead_id && <a href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">In Close öffnen <ExternalLink className="h-3 w-3" /></a>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>}
    </div>
  );
}
