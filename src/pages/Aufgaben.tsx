import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Task = Database['public']['Tables']['tasks']['Row'];

const STATUS_COLORS: Record<string, string> = {
  'Offen': 'bg-warning/20 text-warning',
  'In Arbeit': 'bg-primary/20 text-primary',
  'Erledigt': 'bg-success/20 text-success',
  'Blockiert': 'bg-destructive/20 text-destructive',
};

export default function Aufgaben() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isAdminOrManager } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: '', status: 'Offen', assignee_id: '', client_id: '', project_id: '', geplante_zeit: 0, due_date: '' });

  const fetchData = async () => {
    const [t, tm, c, p] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('team').select('id, name'),
      supabase.from('clients').select('id, name'),
      supabase.from('projects').select('id, name'),
    ]);
    if (t.data) setTasks(t.data);
    if (tm.data) setTeam(tm.data);
    if (c.data) setClients(c.data);
    if (p.data) setProjects(p.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const insert: any = { title: form.title, status: form.status, geplante_zeit: form.geplante_zeit };
    if (form.assignee_id) insert.assignee_id = form.assignee_id;
    if (form.client_id) insert.client_id = form.client_id;
    if (form.project_id) insert.project_id = form.project_id;
    if (form.due_date) insert.due_date = form.due_date;
    const { error } = await supabase.from('tasks').insert(insert);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Aufgabe erstellt' });
    setDialogOpen(false);
    setForm({ title: '', status: 'Offen', assignee_id: '', client_id: '', project_id: '', geplante_zeit: 0, due_date: '' });
    fetchData();
  };

  const getName = (list: any[], id: string | null) => id ? list.find(i => i.id === id)?.name || '–' : '–';
  const filtered = filterStatus === 'all' ? tasks : tasks.filter(t => t.status === filterStatus);
  const isOverdue = (d: string | null) => d && new Date(d) < new Date();

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Aufgaben werden geladen">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Aufgaben</h1>
          <p className="text-muted-foreground text-sm">{tasks.length} Aufgaben</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button className="min-h-[44px]"><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Neue Aufgabe</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-none">
              <DialogHeader><DialogTitle>Aufgabe erstellen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label htmlFor="task-title">Titel *</Label><Input id="task-title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Zugewiesen an</Label>
                    <Select value={form.assignee_id} onValueChange={v => setForm({...form, assignee_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
                      <SelectContent>{team.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Kunde</Label>
                    <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Projekt</Label>
                    <Select value={form.project_id} onValueChange={v => setForm({...form, project_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="task-zeit">Geplante Zeit (h)</Label><Input id="task-zeit" type="number" step="0.5" value={form.geplante_zeit} onChange={e => setForm({...form, geplante_zeit: +e.target.value})} /></div>
                  <div><Label htmlFor="task-due">Fällig am</Label><Input id="task-due" type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
                </div>
                <Button type="submit" className="w-full min-h-[44px]">Aufgabe erstellen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Select value={filterStatus} onValueChange={setFilterStatus}>
        <SelectTrigger className="w-48 min-h-[44px]" aria-label="Status filtern"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Status</SelectItem>
          {['Offen', 'In Arbeit', 'Erledigt', 'Blockiert'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Aufgabenliste mit Status und Zeiterfassung</caption>
            <TableHeader><TableRow>
              <TableHead scope="col">Aufgabe</TableHead>
              <TableHead scope="col">Zugewiesen</TableHead>
              <TableHead scope="col" className="hidden sm:table-cell">Kunde</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="hidden md:table-cell">Zeit (Plan/Ist)</TableHead>
              <TableHead scope="col">Fällig</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine Aufgaben</TableCell></TableRow>
              ) : filtered.map(t => {
                const overdue = isOverdue(t.due_date) && t.status !== 'Erledigt';
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-muted-foreground">{getName(team, t.assignee_id)}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">{getName(clients, t.client_id)}</TableCell>
                    <TableCell><Badge variant="secondary" className={STATUS_COLORS[t.status] || ''}>{t.status}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        <span>{Number(t.geplante_zeit || 0).toFixed(1)}h</span>
                        <span className="text-muted-foreground">/</span>
                        <span className={Number(t.ist_zeit || 0) > Number(t.geplante_zeit || 0) ? 'text-destructive' : ''}>{Number(t.ist_zeit || 0).toFixed(1)}h</span>
                      </div>
                    </TableCell>
                    <TableCell className={overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      {t.due_date || '–'}
                      {overdue && <AlertTriangle className="inline h-3 w-3 ml-1" aria-label="Überfällig" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
