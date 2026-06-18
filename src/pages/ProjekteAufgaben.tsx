import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SlackListsModule } from '@/components/projekte/SlackListsModule';


export default function ProjekteAufgaben() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('alle');
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('*').order('due_date', { ascending: true }),
      supabase.from('clients').select('id, name'),
    ]).then(([t, c]) => {
      setTasks(t.data || []);
      setClients(c.data || []);
      setLoading(false);
    });
  }, []);

  const clientName = (id: string | null) => id ? clients.find(c => c.id === id)?.name || '' : '';
  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const grouped = useMemo(() => {
    const list = filter === 'erledigt' ? tasks.filter(t => t.status === 'Erledigt') : filter === 'offen' ? tasks.filter(t => t.status !== 'Erledigt') : tasks;
    const overdue = list.filter(t => t.status !== 'Erledigt' && t.due_date && t.due_date < today);
    const todayTasks = list.filter(t => t.status !== 'Erledigt' && t.due_date === today);
    const weekTasks = list.filter(t => t.status !== 'Erledigt' && t.due_date && t.due_date > today && t.due_date <= weekEnd);
    const later = list.filter(t => t.status !== 'Erledigt' && (!t.due_date || t.due_date > weekEnd));
    return { overdue, todayTasks, weekTasks, later };
  }, [tasks, filter, today, weekEnd]);

  const markDone = async (id: string) => {
    await supabase.from('tasks').update({ status: 'Erledigt' } as any).eq('id', id);
    setTasks(tasks.map(t => t.id === id ? { ...t, status: 'Erledigt' } : t));
    toast({ title: 'Aufgabe erledigt' });
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  const Section = ({ title, items, color }: { title: string; items: any[]; color?: string }) => items.length === 0 ? null : (
    <div>
      <p className={`text-xs font-medium uppercase tracking-widest mb-2 ${color || 'text-muted-foreground'}`}>{title} ({items.length})</p>
      <Card><CardContent className="p-0 divide-y divide-border">
        {items.map(t => (
          <div key={t.id} className={`flex items-center gap-3 p-3 text-sm ${t.status === 'Erledigt' ? 'opacity-50 line-through' : ''}`}>
            <Checkbox checked={t.status === 'Erledigt'} onCheckedChange={() => markDone(t.id)} />
            <span className="flex-1 truncate">{t.title}</span>
            {clientName(t.client_id) && <Badge variant="outline" className="text-[9px]">{clientName(t.client_id)}</Badge>}
            <span className="text-xs text-muted-foreground">{t.due_date || '–'}</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Aufgaben</h1>
          <p className="text-muted-foreground text-sm">{tasks.filter(t => t.status !== 'Erledigt').length} offen</p>
        </div>
        <Button onClick={() => toast({ title: 'Neue Aufgabe' })}><Plus className="h-4 w-4 mr-2" />Neue Aufgabe</Button>
      </div>

      <Tabs defaultValue="aufgaben">
        <TabsList>
          <TabsTrigger value="aufgaben">Aufgaben</TabsTrigger>
          <TabsTrigger value="slack">Slack-Listen</TabsTrigger>
        </TabsList>

        <TabsContent value="aufgaben" className="space-y-6 mt-6">
          <div className="flex gap-2">
            {['alle', 'offen', 'erledigt'].map(f => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="capitalize">{f}</Button>
            ))}
          </div>

          <div className="space-y-6">
            <Section title="Überfällig" items={grouped.overdue} color="text-destructive" />
            <Section title="Heute fällig" items={grouped.todayTasks} color="text-primary" />
            <Section title="Diese Woche" items={grouped.weekTasks} />
            <Section title="Später" items={grouped.later} />
          </div>
        </TabsContent>

        <TabsContent value="slack" className="mt-6">
          <SlackListsModule />
        </TabsContent>
      </Tabs>
    </div>
  );
}

