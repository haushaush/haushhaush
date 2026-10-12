import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProjects } from '@/hooks/useDataSources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Contract {
  id: string;
  name?: string | null;
  kundenstatus?: string | null;
  client_id?: string | null;
  status?: string | null;
  enddatum?: string | null;
  startdatum?: string | null;
  laufzeit?: string | null;
}

function contractEnd(contract: Contract): number | null {
  if (contract.enddatum) {
    const end = new Date(contract.enddatum).getTime();
    if (Number.isFinite(end)) return end;
  }
  const months = contract.laufzeit?.match(/^(\d+) Monate?$/)?.[1];
  if (!contract.startdatum || !months) return null;
  const end = new Date(contract.startdatum);
  if (!Number.isFinite(end.getTime())) return null;
  end.setMonth(end.getMonth() + Number(months));
  return end.getTime();
}

function dateLabel(date: number | string) {
  return new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function OperationalCards() {
  const navigate = useNavigate();
  const projects = useProjects();
  const [clients, setClients] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchClients = async () => {
      const result = await supabase.from('clients').select('id, name, kundenstatus, enddatum, startdatum, laufzeit');
      if (cancelled) return;
      setClients(result.data || []);
      setError(result.error?.message || null);
      setLoading(false);
    };
    void fetchClients();
    const interval = setInterval(fetchClients, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const expiringClients = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return clients.filter(client => !['Done', 'Churned', 'Lead'].includes(client.kundenstatus || ''))
      .map(client => {
        const ends = [contractEnd(client), ...projects.data
          .filter(project => project.client_id === client.id && project.status !== 'Abgeschlossen')
          .map(contractEnd)].filter((end): end is number => end !== null);
        const end = ends.length ? Math.max(...ends) : null;
        const days = end === null ? null : Math.ceil((end - today.getTime()) / 86400000);
        return { client, end, days };
      })
      .filter((row): row is { client: Contract; end: number; days: number } => row.end !== null && row.days !== null && row.days <= 14)
      .sort((a, b) => a.end - b.end)
      .slice(0, 5);
  }, [clients, projects.data]);

  const urgentProjects = useMemo(() => projects.data
    .filter(project => !['Abgeschlossen', 'Pausiert'].includes(project.status || '') && project.deadline && Number.isFinite(new Date(project.deadline).getTime()))
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 5), [projects.data]);

  const pending = loading || projects.loading;
  const failed = error || projects.error;

  return <>
    <Card className="rounded-[14px] min-w-0">
      <CardHeader className="p-6 pb-2">
        <CardTitle className="text-base font-semibold">Kunden Laufzeiten zuende</CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {pending ? <Skeleton className="h-40 w-full" /> : failed ? <p role="alert" className="text-sm text-muted-foreground py-6">Laufzeiten konnten nicht geladen werden.</p> : expiringClients.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Keine auslaufenden Kundenlaufzeiten in den nächsten 14 Tagen.</p> : expiringClients.map(({ client, end, days }) =>
          <Button key={client.id} variant="ghost" className="w-full h-auto rounded-none border-b border-border last:border-0 px-0 py-3 justify-between gap-3 text-left" onClick={() => navigate(`/kunden/${client.id}`)}>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{client.name}</span><span className="block text-xs text-muted-foreground tabular-nums mt-1">{dateLabel(end)}</span></span>
            <span className={`text-xs tabular-nums shrink-0 ${days < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{days < 0 ? 'Abgelaufen' : days === 0 ? 'Heute' : `In ${days} Tagen`}</span>
          </Button>)}
        <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground" onClick={() => navigate('/kunden/laufzeiten')}>Alle Laufzeiten <ArrowRight className="h-3 w-3 ml-1" /></Button>
      </CardContent>
    </Card>
    <Card className="rounded-[14px] min-w-0">
      <CardHeader className="p-6 pb-2"><CardTitle className="text-base font-semibold">Dringendste Projekte</CardTitle></CardHeader>
      <CardContent className="p-6 pt-0">
        {projects.loading ? <Skeleton className="h-40 w-full" /> : projects.error ? <p role="alert" className="text-sm text-muted-foreground py-6">Projekte konnten nicht geladen werden.</p> : urgentProjects.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Keine offenen Projekte mit Deadline.</p> : urgentProjects.map(project => {
          const client = clients.find(client => client.id === project.client_id);
          const overdue = new Date(project.deadline).getTime() < new Date().setHours(0, 0, 0, 0);
          return <Button key={project.id} variant="ghost" className="w-full h-auto rounded-none border-b border-border last:border-0 px-0 py-3 justify-between gap-3 text-left" onClick={() => navigate(`/projekte?project=${encodeURIComponent(project.id)}`)}>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className="block truncate text-xs text-muted-foreground mt-1">{client?.name || project.status}</span></span>
            <span className={`text-xs tabular-nums shrink-0 ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>{overdue && <span className="block">Überfällig</span>}{dateLabel(project.deadline)}</span>
          </Button>;
        })}
        <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground" onClick={() => navigate('/projekte')}>Alle Projekte <ArrowRight className="h-3 w-3 ml-1" /></Button>
      </CardContent>
    </Card>
  </>;
}