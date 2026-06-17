import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Search } from 'lucide-react';

const LAUFZEIT_MONTHS: Record<string, number> = {
  '1 Monat': 1, '2 Monate': 2, '3 Monate': 3,
  '4 Monate': 4, '5 Monate': 5, '6 Monate': 6,
  '12 Monate': 12,
};

const STATUS_STYLES: Record<string, string> = {
  'Lead': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Offen': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'In Betreuung': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Done': 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'Follow Up': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const fmtDate = (d: Date | string | null) => {
  if (!d) return '–';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

type Row = {
  client: any;
  endDate: Date | null;
  days: number | null; // null = no end date
  pct: number;
  source: 'client' | 'project' | null;
  sourceLaufzeit: string | null;
};

function computeEndFrom(end: any, start: any, laufzeit: any): Date | null {
  if (end) {
    const d = new Date(end);
    if (!isNaN(d.getTime())) return d;
  }
  if (start && laufzeit && LAUFZEIT_MONTHS[laufzeit]) {
    const d = new Date(start);
    if (!isNaN(d.getTime())) {
      d.setMonth(d.getMonth() + LAUFZEIT_MONTHS[laufzeit]);
      return d;
    }
  }
  return null;
}

function progress(start: string | null, end: Date | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = end.getTime();
  const now = Date.now();
  if (now >= e) return 100;
  if (now <= s) return 0;
  return Math.round(((now - s) / (e - s)) * 100);
}

function verbleibendLabel(days: number | null): string {
  if (days === null) return 'kein Enddatum';
  if (days < 0) return `vor ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'} abgelaufen`;
  if (days === 0) return 'heute';
  return `in ${days} Tag${days === 1 ? '' : 'en'}`;
}

export default function KundenLaufzeiten() {
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'alle' | 'abgelaufen' | 'aktiv' | 'abgeschlossen'>('alle');

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('projects').select('client_id, startdatum, laufzeit, enddatum, status'),
    ]).then(([c, p]) => {
      setClients(c.data || []);
      setProjects(p.data || []);
      setLoading(false);
    });
  }, []);

  const projectsByClient = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of projects) {
      if (!p.client_id) continue;
      if (!m.has(p.client_id)) m.set(p.client_id, []);
      m.get(p.client_id)!.push(p);
    }
    return m;
  }, [projects]);

  const rows: Row[] = useMemo(() => clients.map(c => {
    const clientEnd = computeEndFrom(c.enddatum, c.startdatum, c.laufzeit);
    let bestEnd: Date | null = clientEnd;
    let source: 'client' | 'project' | null = clientEnd ? 'client' : null;
    let sourceLaufzeit: string | null = clientEnd ? (c.laufzeit || null) : null;
    const list = projectsByClient.get(c.id) || [];
    for (const p of list) {
      if (p.status === 'Abgeschlossen') continue;
      const pe = computeEndFrom(p.enddatum, p.startdatum, p.laufzeit);
      if (pe && (!bestEnd || pe.getTime() > bestEnd.getTime())) {
        bestEnd = pe;
        source = 'project';
        sourceLaufzeit = p.laufzeit || null;
      }
    }
    const days = bestEnd ? Math.ceil((bestEnd.getTime() - Date.now()) / 86400000) : null;
    const pct = progress(c.startdatum, bestEnd);
    return { client: c, endDate: bestEnd, days, pct, source, sourceLaufzeit };
  }).filter(r => r.endDate !== null), [clients, projectsByClient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter(r => !q || (r.client.name || '').toLowerCase().includes(q));

    if (tab === 'abgelaufen') {
      list = list.filter(r => r.endDate && r.days !== null && r.days < 0 && r.client.kundenstatus !== 'Done');
    } else if (tab === 'aktiv') {
      list = list.filter(r => r.endDate && r.days !== null && r.days >= 0 && r.client.kundenstatus !== 'Done');
    } else if (tab === 'abgeschlossen') {
      list = list.filter(r => r.client.kundenstatus === 'Done');
    }

    return list.sort((a, b) => {
      const aDone = a.client.kundenstatus === 'Done';
      const bDone = b.client.kundenstatus === 'Done';
      // Done customers always go to the bottom
      if (aDone && !bDone) return 1;
      if (!aDone && bDone) return -1;
      if (aDone && bDone) {
        // Done amongst themselves: latest end date first
        const ae = a.endDate?.getTime() ?? 0;
        const be = b.endDate?.getTime() ?? 0;
        return be - ae;
      }
      // Non-Done: by remaining days ascending
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });
  }, [rows, search, tab]);

  const counts = useMemo(() => ({
    alle: rows.length,
    abgelaufen: rows.filter(r => r.endDate && r.days !== null && r.days < 0 && r.client.kundenstatus !== 'Done').length,
    aktiv: rows.filter(r => r.endDate && r.days !== null && r.days >= 0 && r.client.kundenstatus !== 'Done').length,
    abgeschlossen: rows.filter(r => r.client.kundenstatus === 'Done').length,
  }), [rows]);

  const critical = counts.abgelaufen + rows.filter(r => r.days !== null && r.days >= 0 && r.days <= 7 && r.client.kundenstatus !== 'Done').length;

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Laufzeiten</h1>
        <p className="text-muted-foreground text-sm">Kunden nach Restlaufzeit – wer läuft bald aus?</p>
      </div>

      {critical > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3" role="alert">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">{critical} Kunden laufen in 7 Tagen oder weniger aus (inkl. bereits abgelaufen)</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="alle">Alle <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{counts.alle}</Badge></TabsTrigger>
            <TabsTrigger value="abgelaufen">Abgelaufen <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">{counts.abgelaufen}</Badge></TabsTrigger>
            <TabsTrigger value="aktiv">Aktiv <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-success/20 text-success border-0">{counts.aktiv}</Badge></TabsTrigger>
            <TabsTrigger value="abgeschlossen">Abgeschlossen <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{counts.abgeschlossen}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Kunde suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Kunde</TableHead>
            <TableHead>Startdatum</TableHead>
            <TableHead>Laufzeit</TableHead>
            <TableHead>Enddatum</TableHead>
            <TableHead>Verbleibend</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-40">Progress</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map(r => {
              const isDone = r.client.kundenstatus === 'Done';
              const hasEnd = r.endDate !== null && r.days !== null;
              const isRed = hasEnd && !isDone && r.days! <= 7;
              return (
                <TableRow key={r.client.id} className={isRed ? 'bg-destructive/10 hover:bg-destructive/15' : ''}>
                  <TableCell className={`font-medium ${isRed ? 'text-destructive' : ''}`}>{r.client.name || '–'}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.client.startdatum)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.client.laufzeit || '–'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.endDate ? (
                      <span>
                        {fmtDate(r.endDate)}
                        {r.source === 'project' && <span className="ml-1 text-[10px] text-muted-foreground/70">via Projekt</span>}
                      </span>
                    ) : (
                      <span className="italic">kein Enddatum</span>
                    )}
                  </TableCell>
                  <TableCell className={isRed ? 'text-destructive font-medium' : 'text-muted-foreground'}>{verbleibendLabel(r.days)}</TableCell>
                  <TableCell>
                    {r.client.kundenstatus && (
                      <Badge className={`${STATUS_STYLES[r.client.kundenstatus] || 'bg-muted text-muted-foreground'} border-0`}>
                        {r.client.kundenstatus}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {hasEnd ? (
                      <Progress value={r.pct} className={`h-2 ${isRed ? '[&>div]:bg-destructive' : r.days! <= 30 ? '[&>div]:bg-warning' : ''}`} />
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Kunden in dieser Kategorie</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}
