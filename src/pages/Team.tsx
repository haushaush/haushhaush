import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DriveBrowser } from '@/components/DriveBrowser';
import { Plus, Users, GraduationCap, BookOpen, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';

const ROLLE_COLORS: Record<string, string> = {
  'Admin': 'bg-primary/20 text-primary', 'Account-Manager': 'bg-success/20 text-success',
  'Setter': 'bg-warning/20 text-warning', 'Closer': 'bg-purple-500/20 text-purple-400',
};
const DEPT_ORDER = ['Management', 'Customer Success', 'Sales', 'Fulfillment', 'Intern'];
const AKADEMIE_KAPITEL = ['Mindset', 'Cold Calling', 'Sales', 'Setting', 'Closing', 'Einwandbehandlung', 'Deep Dive', 'Lead Scraping', 'Prüfung'];

export default function TeamPage() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'mitarbeiter';
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', rolle: 'Setter' as string, department: 'Sales', startdatum: '' });

  const fetchData = async () => {
    const { data } = await supabase.from('team').select('*').order('name');
    if (data) setMembers(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('team').insert({ ...form, startdatum: form.startdatum || null } as any);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Mitarbeiter hinzugefügt' });
    setDialogOpen(false);
    setForm({ name: '', email: '', rolle: 'Setter', department: 'Sales', startdatum: '' });
    fetchData();
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Group by department
  const grouped = DEPT_ORDER.map(dept => ({
    dept, members: members.filter(m => (m as any).department === dept),
  })).filter(g => g.members.length > 0);

  if (loading) return <div className="space-y-6" role="status" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Team</h1>
          <p className="text-muted-foreground text-sm">{members.length} Teammitglieder</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button className="min-h-[44px]"><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Neuer Mitarbeiter</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-none">
              <DialogHeader><DialogTitle>Mitarbeiter hinzufügen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label htmlFor="team-name">Name *</Label><Input id="team-name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                <div><Label htmlFor="team-email">E-Mail *</Label><Input id="team-email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
                <div><Label>Rolle</Label>
                  <Select value={form.rolle} onValueChange={v => setForm({...form, rolle: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['Admin', 'Account-Manager', 'Setter', 'Closer'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Abteilung</Label>
                  <Select value={form.department} onValueChange={v => setForm({...form, department: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DEPT_ORDER.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label htmlFor="team-start">Startdatum</Label><Input id="team-start" type="date" value={form.startdatum} onChange={e => setForm({...form, startdatum: e.target.value})} /></div>
                <Button type="submit" className="w-full min-h-[44px]">Hinzufügen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="mitarbeiter" className="min-h-[44px]"><Users className="h-4 w-4 mr-1" aria-hidden="true" />Mitarbeiter</TabsTrigger>
          <TabsTrigger value="akademie" className="min-h-[44px]"><GraduationCap className="h-4 w-4 mr-1" aria-hidden="true" />Akademie</TabsTrigger>
          <TabsTrigger value="coaching" className="min-h-[44px]">Coaching</TabsTrigger>
          <TabsTrigger value="wiki" className="min-h-[44px]"><BookOpen className="h-4 w-4 mr-1" aria-hidden="true" />Wiki</TabsTrigger>
          <TabsTrigger value="dokumente" className="min-h-[44px]"><FolderOpen className="h-4 w-4 mr-1" aria-hidden="true" />Dokumente</TabsTrigger>
        </TabsList>

        {/* TAB 1: MITARBEITER — grouped by department */}
        <TabsContent value="mitarbeiter" className="mt-4 space-y-6">
          {grouped.map(g => (
            <div key={g.dept}>
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">{g.dept}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {g.members.map(m => (
                  <Card key={m.id} className="hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer">
                    <CardContent className="p-5 flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/10 text-primary font-heading font-bold">{getInitials(m.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.name}</p>
                        <Badge variant="secondary" className={`text-xs mt-1 ${ROLLE_COLORS[m.rolle] || ''}`}>{m.rolle}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{m.email}</p>
                        {m.startdatum && <p className="text-xs text-muted-foreground">seit {m.startdatum}</p>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* TAB 2: AKADEMIE */}
        <TabsContent value="akademie" className="mt-4">
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Vertriebsakademie Fortschritt</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Mitarbeiter</TableHead>
                {AKADEMIE_KAPITEL.map(k => <TableHead key={k} scope="col" className="text-center text-xs">{k}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {members.filter(m => ['Setter', 'Closer', 'Account-Manager'].includes(m.rolle) && ['Sales', 'Customer Success'].includes((m as any).department || '')).map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    {AKADEMIE_KAPITEL.map(k => (
                      <TableCell key={k} className="text-center">
                        <span className="inline-block h-4 w-4 rounded-full bg-muted" aria-label="Nicht gestartet" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
          <p className="text-xs text-muted-foreground mt-2">Progress-Tracking wird aktiviert, sobald Lektionen zugewiesen werden.</p>
        </TabsContent>

        {/* TAB 3: COACHING */}
        <TabsContent value="coaching" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="font-medium">Coaching & Call-Feedback</p>
            <p className="text-sm mt-1">Score-Tracking, PDF-Upload und Trend-Analyse pro Setter.</p>
            <Button variant="outline" className="mt-4 min-h-[44px]">Feedback erstellen</Button>
          </CardContent></Card>
        </TabsContent>

        {/* TAB 4: WIKI */}
        <TabsContent value="wiki" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
            <p className="font-medium">Wiki & SOPs</p>
            <p className="text-sm mt-1">Hierarchische Seitenstruktur: SOPs | Prozesse | Produkt-Infos | Onboarding</p>
            <Button variant="outline" className="mt-4 min-h-[44px]"><Plus className="h-4 w-4 mr-1" />Neue Seite</Button>
          </CardContent></Card>
        </TabsContent>

        {/* TAB 5: DOKUMENTE */}
        <TabsContent value="dokumente" className="mt-4">
          <DriveBrowser folderId="hr-root" showUpload={true} showPin={false} folderChips={['Verträge', 'Dokumente', 'Coaching']} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
