import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronLeft, ChevronDown, Mail, Phone, Globe, Plus, CalendarPlus, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive', 'CC': 'bg-purple-400' };
const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success', 'Pausiert': 'bg-warning/20 text-warning',
  'Churned': 'bg-destructive/20 text-destructive', 'Lead': 'bg-primary/20 text-primary',
};

export default function KundenDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdminOrManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [finance, setFinance] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [adData, setAdData] = useState<any[]>([]);
  const [updates, setUpdates] = useState<{ text: string; ts: string }[]>([]);
  const [newUpdate, setNewUpdate] = useState('');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [c, tk, p, f, t, ad] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('tasks').select('*').eq('client_id', id).order('due_date', { ascending: true }),
        supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false }),
        supabase.from('finance').select('*').eq('client_id', id).order('datum', { ascending: false }),
        supabase.from('team').select('id, name'),
        supabase.from('ad_performance_intern').select('*').eq('client_id', id).order('datum', { ascending: false }),
      ]);
      if (c.data) setClient(c.data);
      if (tk.data) setTasks(tk.data);
      if (p.data) setProjects(p.data);
      if (f.data) setFinance(f.data);
      if (t.data) setTeam(t.data);
      if (ad.data) setAdData(ad.data);
      setLoading(false);
    };
    load();
  }, [id]);

  const getName = (tid: string | null) => team.find(t => t.id === tid)?.name || '–';

  const totalEinnahmen = finance.filter(f => f.typ === 'Einnahme').reduce((s, f) => s + Number(f.betrag), 0);
  const totalAusgaben = finance.filter(f => f.typ === 'Ausgabe').reduce((s, f) => s + Number(f.betrag), 0);
  const totalSpend = adData.reduce((s, r) => s + Number(r.spend || 0), 0);

  const addUpdate = () => {
    if (!newUpdate.trim()) return;
    setUpdates(prev => [{ text: newUpdate.trim(), ts: new Date().toLocaleString('de-DE') }, ...prev]);
    setNewUpdate('');
    toast({ title: 'Update hinzugefügt' });
  };

  const handleCreateTask = async () => {
    if (!isAdminOrManager || !id) return;
    const { error } = await supabase.from('tasks').insert({ title: 'Neue Aufgabe', client_id: id, status: 'Offen' });
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Aufgabe erstellt' });
    const { data } = await supabase.from('tasks').select('*').eq('client_id', id).order('due_date', { ascending: true });
    if (data) setTasks(data);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/kunden')} className="gap-1"><ChevronLeft className="h-4 w-4" /> Zurück</Button>
        <p className="text-muted-foreground">Kunde nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/kunden')} className="gap-1 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Zurück zu Kunden
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold">{client.name}</h1>
            <Badge variant="secondary" className={STATUS_STYLES[client.kundenstatus]}>{client.kundenstatus}</Badge>
            <span className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_DOT[client.ampelstatus]}`} />
              <span className="text-xs text-muted-foreground">{client.ampelstatus}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {client.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</span>}
            {client.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{client.phone}</span>}
            {client.website && <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{client.website}</span>}
          </div>
        </div>
        {isAdminOrManager && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCreateTask}><Plus className="h-4 w-4 mr-1" />Aufgabe erstellen</Button>
            <Button size="sm" variant="outline" onClick={() => toast({ title: 'Meeting geloggt', description: new Date().toLocaleString('de-DE') })}><CalendarPlus className="h-4 w-4 mr-1" />Meeting loggen</Button>
          </div>
        )}
      </div>

      {/* Quick info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">€{Number(client.clv || 0).toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">CLV</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{projects.length}</p><p className="text-xs text-muted-foreground">Projekte</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{tasks.filter(t => t.status !== 'Erledigt').length}</p><p className="text-xs text-muted-foreground">Offene Aufgaben</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">€{totalEinnahmen.toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Einnahmen</p></CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="uebersicht">
        <TabsList>
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="aufgaben">Aufgaben ({tasks.length})</TabsTrigger>
          <TabsTrigger value="projekte">Projekte ({projects.length})</TabsTrigger>
          <TabsTrigger value="finanzen">Finanzen ({finance.length})</TabsTrigger>
        </TabsList>

        {/* Tab: Übersicht */}
        <TabsContent value="uebersicht" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Roadmap</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Onboarding & Zugänge einrichten</li>
                <li>Kampagnen-Setup & Launch</li>
                <li>Optimierung & Skalierung</li>
              </ol>
            </CardContent>
          </Card>

          <Collapsible>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Zugänge & Tools</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <p>Meta Business Manager: {client.website ? '✓' : '–'}</p>
                    <p>Google Ads: –</p>
                    <p>CRM-Zugang: –</p>
                    <p>Analytics: –</p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Collapsible>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Dokumente</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Noch keine Dokumente hinterlegt.</p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Kundeninfo */}
          <Card>
            <CardHeader><CardTitle className="text-base">Kundeninfo</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Branche</span><span>{client.branche || '–'}</span>
                <span className="text-muted-foreground">Projekttyp</span><span>{client.projekttyp || '–'}</span>
                <span className="text-muted-foreground">Startdatum</span><span>{client.startdatum || '–'}</span>
                <span className="text-muted-foreground">Enddatum</span><span>{client.enddatum || '–'}</span>
                <span className="text-muted-foreground">Laufzeit</span><span>{client.laufzeit || '–'}</span>
                <span className="text-muted-foreground">Zahlstatus</span><span>{client.zahlstatus || '–'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Aufgaben */}
        <TabsContent value="aufgaben" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Aufgabe</TableHead><TableHead>Status</TableHead><TableHead>Zugewiesen</TableHead>
                <TableHead>Fällig</TableHead><TableHead>Geplant (h)</TableHead><TableHead>Ist (h)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Keine Aufgaben</TableCell></TableRow>
                ) : tasks.map(t => {
                  const overdue = t.status !== 'Erledigt' && t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{t.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{getName(t.assignee_id)}</TableCell>
                      <TableCell className={overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {t.due_date || '–'}{overdue && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                      </TableCell>
                      <TableCell>{t.geplante_zeit || 0}</TableCell>
                      <TableCell>{t.ist_zeit || 0}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* Tab: Projekte */}
        <TabsContent value="projekte" className="mt-4 space-y-4">
          {projects.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Projekte</CardContent></Card>
          ) : projects.map(p => (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.projekttyp || '–'} · {p.startdatum || '–'} → {p.enddatum || '–'}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Ads Budget</span><p className="font-medium">€{Number(p.ads_budget || 0).toLocaleString('de-DE')}</p></div>
                  <div><span className="text-muted-foreground">Spend</span><p className="font-medium">€{totalSpend.toLocaleString('de-DE')}</p></div>
                  <div><span className="text-muted-foreground">Saldo</span><p className="font-medium">€{Number(p.gesamt_saldo || 0).toLocaleString('de-DE')}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Tab: Finanzen */}
        <TabsContent value="finanzen" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-heading font-bold text-success">€{totalEinnahmen.toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Einnahmen</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-heading font-bold text-destructive">€{totalAusgaben.toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Ausgaben</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-heading font-bold">€{(totalEinnahmen - totalAusgaben).toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Saldo</p></CardContent></Card>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Datum</TableHead><TableHead>Typ</TableHead><TableHead>Betrag</TableHead>
                <TableHead>Rechnung</TableHead><TableHead>Zahlstatus</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {finance.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine Einträge</TableCell></TableRow>
                ) : finance.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="text-muted-foreground">{f.datum}</TableCell>
                    <TableCell><Badge variant={f.typ === 'Einnahme' ? 'default' : 'destructive'} className="text-xs">{f.typ}</Badge></TableCell>
                    <TableCell className="font-medium">€{Number(f.betrag).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="text-muted-foreground">{f.rechnung_nr || '–'}</TableCell>
                    <TableCell><Badge variant={f.zahlstatus === 'Bezahlt' ? 'secondary' : 'destructive'} className="text-xs">{f.zahlstatus}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Wichtige Updates */}
      <Card>
        <CardHeader><CardTitle className="text-base">Wichtige Updates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Update hinzufügen..." value={newUpdate} onChange={e => setNewUpdate(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUpdate()} />
            <Button size="sm" onClick={addUpdate}>Hinzufügen</Button>
          </div>
          {updates.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Updates.</p>}
          {updates.map((u, i) => (
            <div key={i} className="border border-border rounded-md p-3">
              <p className="text-sm">{u.text}</p>
              <p className="text-xs text-muted-foreground mt-1">{u.ts}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
