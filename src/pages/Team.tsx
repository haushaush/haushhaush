import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Users, GraduationCap, BookOpen, FolderOpen, Star, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DEPT_GROUPS = [
  { label: 'MANAGEMENT', departments: ['Management'] },
  { label: 'SALES', departments: ['Setter', 'Closer', 'Sales'] },
  { label: 'FULFILLMENT', departments: ['Fulfillment', 'Account-Manager', 'Tech', 'Websites', 'Media Buying', 'Backoffice', 'Operation'] },
];
const ALL_DEPTS = DEPT_GROUPS.flatMap(g => g.departments);
const AKADEMIE_KAPITEL = ['Mindset', 'Cold Calling', 'Sales', 'Setting', 'Closing', 'Einwandbehandlung', 'Deep Dive', 'Lead Scraping', 'Prüfung'];

export default function TeamPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const currentTab = tab || 'mitarbeiter';
  const [members, setMembers] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [timeOff, setTimeOff] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', rolle: 'Setter', department: 'Sales', startdatum: '' });

  useEffect(() => {
    Promise.all([
      supabase.from('team').select('*').order('name'),
      supabase.from('employment_contracts').select('*'),
      supabase.from('salary_payments').select('*'),
      supabase.from('time_off_requests').select('*'),
      supabase.from('probewoche_candidates').select('*').order('created_at', { ascending: false }),
    ]).then(([t, c, s, to, p]) => {
      setMembers(t.data || []);
      setContracts(c.data || []);
      setSalaries(s.data || []);
      setTimeOff(to.data || []);
      setCandidates(p.data || []);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('team').insert({ ...form, startdatum: form.startdatum || null } as any);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Mitarbeiter hinzugefügt' });
    setDialogOpen(false);
    const { data } = await supabase.from('team').select('*').order('name');
    if (data) setMembers(data);
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const getName = (id: string) => members.find(m => m.id === id)?.name || '–';
  const monthsSince = (date: string | null) => {
    if (!date) return null;
    const months = Math.floor((Date.now() - new Date(date).getTime()) / (30.44 * 86400000));
    return months;
  };

  const grouped = DEPT_GROUPS.map(group => ({
    label: group.label,
    members: members.filter(m => group.departments.includes(m.department || '')),
  })).filter(g => g.members.length > 0);
  const ungrouped = members.filter(m => !ALL_DEPTS.includes(m.department || ''));
  if (ungrouped.length > 0) grouped.push({ label: 'SONSTIGE', members: ungrouped });

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team & HR</h1>
          <p className="text-muted-foreground text-sm">{members.length} Teammitglieder</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Neuer Mitarbeiter</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Mitarbeiter hinzufügen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                <div><Label>E-Mail *</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
                <div><Label>Rolle</Label>
                  <Select value={form.rolle} onValueChange={v => setForm({...form, rolle: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['Admin','Account-Manager','Setter','Closer'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Abteilung</Label>
                  <Select value={form.department} onValueChange={v => setForm({...form, department: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ALL_DEPTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Startdatum</Label><Input type="date" value={form.startdatum} onChange={e => setForm({...form, startdatum: e.target.value})} /></div>
                <Button type="submit" className="w-full">Hinzufügen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={currentTab} onValueChange={v => navigate(`/hr/${v}`)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="mitarbeiter"><Users className="h-4 w-4 mr-1" />Mitarbeiter</TabsTrigger>
          <TabsTrigger value="vertraege"><FileText className="h-4 w-4 mr-1" />Verträge & Gehalt</TabsTrigger>
          <TabsTrigger value="probewoche">Probewoche</TabsTrigger>
          <TabsTrigger value="akademie"><GraduationCap className="h-4 w-4 mr-1" />Akademie</TabsTrigger>
          <TabsTrigger value="coaching">Coaching</TabsTrigger>
          <TabsTrigger value="wiki"><BookOpen className="h-4 w-4 mr-1" />Wiki</TabsTrigger>
          <TabsTrigger value="dokumente"><FolderOpen className="h-4 w-4 mr-1" />Dokumente</TabsTrigger>
        </TabsList>

        {/* MITARBEITER */}
        <TabsContent value="mitarbeiter" className="mt-4 space-y-6">
          {grouped.map(g => (
            <div key={g.label}>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">{g.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {g.members.map(m => {
                  const months = monthsSince(m.startdatum);
                  return (
                    <Card key={m.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/hr/mitarbeiter/${m.id}`)}>
                      <CardContent className="p-5 flex items-start gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-[hsl(174,40%,95%)] text-primary font-semibold">{getInitials(m.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{m.name}</p>
                          <Badge variant="secondary" className="text-xs mt-1">{m.rolle}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">{m.email}</p>
                          {months !== null && <p className="text-xs text-muted-foreground">Seit {months} Monaten</p>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* VERTRÄGE & GEHALT */}
        <TabsContent value="vertraege" className="mt-4 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Arbeitsverträge</CardTitle>
              <Button size="sm" variant="outline" onClick={() => toast({ title: 'Vertrag anlegen', description: 'Drawer folgt' })}><Plus className="h-4 w-4 mr-1" />Neuer Vertrag</Button>
            </CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mitarbeiter</TableHead><TableHead>Vertragsart</TableHead><TableHead>Brutto/M</TableHead>
                  <TableHead className="hidden sm:table-cell">Stunden/W</TableHead><TableHead>Start</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {contracts.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Keine Verträge</TableCell></TableRow>
                  ) : contracts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{getName(c.member_id)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{c.vertragsart}</Badge></TableCell>
                      <TableCell>€{Number(c.gehalt_brutto || 0).toLocaleString('de-DE')}</TableCell>
                      <TableCell className="hidden sm:table-cell">{c.arbeitsstunden_pro_woche}h</TableCell>
                      <TableCell className="text-muted-foreground">{c.startdatum || '–'}</TableCell>
                      <TableCell><Badge variant={c.status === 'Aktiv' ? 'default' : 'secondary'} className="text-[10px]">{c.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Gehaltsübersicht</CardTitle></CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mitarbeiter</TableHead><TableHead>Brutto</TableHead><TableHead>Netto</TableHead><TableHead>Status</TableHead><TableHead>Überwiesen am</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {salaries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine Gehaltsdaten</TableCell></TableRow>
                  ) : salaries.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{getName(s.member_id)}</TableCell>
                      <TableCell>€{Number(s.betrag_brutto || 0).toLocaleString('de-DE')}</TableCell>
                      <TableCell>€{Number(s.betrag_netto || 0).toLocaleString('de-DE')}</TableCell>
                      <TableCell><Badge variant={s.status === 'Überwiesen' ? 'default' : 'secondary'} className="text-[10px]">{s.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{s.ueberwiesen_am || '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Urlaub & Abwesenheit</CardTitle>
              <Button size="sm" variant="outline" onClick={() => toast({ title: 'Abwesenheit eintragen' })}><Plus className="h-4 w-4 mr-1" />Abwesenheit</Button>
            </CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mitarbeiter</TableHead><TableHead>Typ</TableHead><TableHead>Von</TableHead><TableHead>Bis</TableHead><TableHead>Tage</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {timeOff.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Keine Abwesenheiten</TableCell></TableRow>
                  ) : timeOff.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{getName(t.member_id)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{t.typ}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{t.von}</TableCell>
                      <TableCell className="text-muted-foreground">{t.bis}</TableCell>
                      <TableCell>{t.tage}</TableCell>
                      <TableCell><Badge variant={t.status === 'Genehmigt' ? 'default' : t.status === 'Abgelehnt' ? 'destructive' : 'secondary'} className="text-[10px]">{t.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent>
          </Card>
        </TabsContent>

        {/* PROBEWOCHE */}
        <TabsContent value="probewoche" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Probewoche</h2>
            <Button variant="outline" onClick={() => toast({ title: 'Neue Probewoche' })}><Plus className="h-4 w-4 mr-1" />Neue Probewoche</Button>
          </div>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Position</TableHead><TableHead>Zeitraum</TableHead><TableHead>Status</TableHead><TableHead>Bewertung</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {candidates.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine Probewochen</TableCell></TableRow>
                ) : candidates.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.position || '–'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{c.probewoche_start} – {c.probewoche_end}</TableCell>
                    <TableCell><Badge variant={c.status === 'Bestanden' ? 'default' : c.status === 'Nicht bestanden' ? 'destructive' : 'secondary'} className="text-[10px]">{c.status}</Badge></TableCell>
                    <TableCell><div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= (c.bewertung || 0) ? 'text-primary fill-primary' : 'text-muted'}`} />)}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        {/* AKADEMIE */}
        <TabsContent value="akademie" className="mt-4">
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mitarbeiter</TableHead>
                {AKADEMIE_KAPITEL.map(k => <TableHead key={k} className="text-center text-xs">{k}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {members.filter(m => ['Sales','Setter','Closer'].includes(m.department || '')).map(m => (
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
        </TabsContent>

        {/* COACHING */}
        <TabsContent value="coaching" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="font-medium">Coaching & Call-Feedback</p>
            <p className="text-sm mt-1">Score-Tracking, PDF-Upload und Trend-Analyse pro Setter.</p>
            <Button variant="outline" className="mt-4">Feedback erstellen</Button>
          </CardContent></Card>
        </TabsContent>

        {/* WIKI */}
        <TabsContent value="wiki" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Wiki & SOPs</p>
            <p className="text-sm mt-1">SOPs | Prozesse | Produkt-Infos | Onboarding</p>
            <Button variant="outline" className="mt-4"><Plus className="h-4 w-4 mr-1" />Neue Seite</Button>
          </CardContent></Card>
        </TabsContent>

        {/* DOKUMENTE */}
        <TabsContent value="dokumente" className="mt-4">
          <DriveBrowser folderId="hr-root" showUpload={true} showPin={false} folderChips={['Verträge', 'Dokumente', 'Coaching']} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
