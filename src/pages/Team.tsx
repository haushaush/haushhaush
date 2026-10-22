import { useCallback, useEffect, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { MitarbeiterEntfernenDialog } from '@/components/team/MitarbeiterEntfernenDialog';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Users, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CreateTeamMemberTab } from '@/components/settings/CreateTeamMemberTab';

const DEPT_GROUPS = [
  { label: 'MANAGEMENT', departments: ['Management'] },
  { label: 'SALES',      departments: ['Sales'] },
  { label: 'FULFILLMENT',departments: ['Fulfillment'] },
  { label: 'INTERN',     departments: ['Intern'] },
];
const ALL_DEPTS = DEPT_GROUPS.flatMap(g => g.departments);
const ALLOWED_TABS = ['mitarbeiter', 'checkins', 'erstellen'];

export default function TeamPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const requestedTab = tab && ALLOWED_TABS.includes(tab) ? tab : 'mitarbeiter';
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole('admin');
  const currentTab = requestedTab === 'erstellen' && !isAdmin ? 'mitarbeiter' : requestedTab;
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', rolle: 'Setter', department: 'Sales', startdatum: '' });
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [gesperrt, setGesperrt] = useState<Set<string>>(new Set());
  const [entfernen, setEntfernen] = useState<{ id: string; name: string } | null>(null);
  const [ehemaligeOffen, setEhemaligeOffen] = useState(false);

  const ladeAlles = useCallback(async () => {
    const [t, r, s] = await Promise.all([
      supabase.from('team').select('*').order('name'),
      supabase.from('user_roles').select('user_id').eq('role', 'admin'),
      (supabase.from as any)('user_access_status').select('user_id, is_active').eq('is_active', false),
    ]);
    setMembers(t.data || []);
    setAdminIds(new Set((r.data || []).map((x: any) => x.user_id)));
    setGesperrt(new Set(((s.data || []) as any[]).map(x => x.user_id)));
    setLoading(false);
  }, []);

  useEffect(() => { ladeAlles(); }, [ladeAlles]);

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
  const monthsSince = (date: string | null) => {
    if (!date) return null;
    const months = Math.floor((Date.now() - new Date(date).getTime()) / (30.44 * 86400000));
    return months;
  };

  const aktive = members.filter(m => !gesperrt.has(m.id));
  const ehemalige = members.filter(m => gesperrt.has(m.id));
  const grouped = DEPT_GROUPS.map(group => ({
    label: group.label,
    members: aktive.filter(m => group.departments.includes(m.department || '')),
  })).filter(g => g.members.length > 0);
  const ungrouped = aktive.filter(m => !ALL_DEPTS.includes(m.department || ''));
  if (ungrouped.length > 0) grouped.push({ label: 'SONSTIGE', members: ungrouped });

  const sperrGrund = (m: any): string | null => {
    if (m.id === user?.id) return 'Der eigene Account lässt sich nicht löschen.';
    const aktiveAdmins = [...adminIds].filter(id => !gesperrt.has(id));
    if (adminIds.has(m.id) && aktiveAdmins.length <= 1) return 'Der letzte verbleibende Admin lässt sich nicht löschen.';
    return null;
  };

  const kachel = (m: any) => {
    const months = monthsSince(m.startdatum);
    const grund = sperrGrund(m);
    return (
      <Card key={m.id} className="relative hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/hr/mitarbeiter/${m.id}`)}>
        {isAdmin && (
          <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Aktionen für ${m.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/hr/mitarbeiter/${m.id}`)}><Pencil className="h-3.5 w-3.5 mr-2" />Bearbeiten</DropdownMenuItem>
                <div title={grund ?? undefined}>
                  <DropdownMenuItem disabled={!!grund} className="text-destructive focus:text-destructive" onClick={() => setEntfernen({ id: m.id, name: m.name })}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Mitarbeiter löschen
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <CardContent className="p-5 flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-[hsl(174,40%,95%)] text-primary font-semibold">{getInitials(m.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 pr-6">
            <p className="font-medium truncate">{m.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{m.position || '–'}</p>
            <Badge variant="secondary" className="text-xs mt-1">{m.rolle}</Badge>
            <p className="text-xs text-muted-foreground mt-1">{m.email}</p>
            {months !== null && <p className="text-xs text-muted-foreground">Seit {months} Monaten</p>}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Team & HR</h1>
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
          {isAdmin && (
            <TabsTrigger value="erstellen"><UserPlus className="h-4 w-4 mr-1" />Mitarbeiter erstellen</TabsTrigger>
          )}
        </TabsList>

        {/* MITARBEITER */}
        <TabsContent value="mitarbeiter" className="mt-4 space-y-6">
          {grouped.map(g => (
            <div key={g.label}>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">{g.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {g.members.map(m => kachel(m))}
              </div>
            </div>
          ))}
          {ehemalige.length > 0 && (
            <div>
              <button type="button" onClick={() => setEhemaligeOffen(o => !o)} aria-expanded={ehemaligeOffen}
                className="flex items-center gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3 hover:text-foreground">
                {ehemaligeOffen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                EHEMALIGE · {ehemalige.length}
              </button>
              {ehemaligeOffen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-70">
                  {ehemalige.map(m => kachel(m))}
                </div>
              )}
            </div>
          )}
          <MitarbeiterEntfernenDialog person={entfernen} onClose={() => setEntfernen(null)} onDone={() => { setEntfernen(null); ladeAlles(); }} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="erstellen" className="mt-4">
            <CreateTeamMemberTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
