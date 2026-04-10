import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DEPT_DISPLAY: Record<string, string> = {
  'Management': 'Management',
  'Sales': 'Mitarbeiter Sales',
  'Fulfillment': 'Mitarbeiter Fulfillment',
  'Intern': 'Mitarbeiter Intern',
};

const TEAM_SEED = [
  // MANAGEMENT
  { name: "Maximilian Büsse",   email: "maximilian@haushhaush.de",      rolle: "Admin", department: "Management", position: "CEO · Head of Fulfillment",  startdatum: "2023-02-23" },
  { name: "Noah Mrosek",        email: "info@viral-connect.de",          rolle: "Admin", department: "Management", position: "CEO · Head of Sales",         startdatum: "2025-02-01" },
  { name: "Dennis Öztürk",      email: "dennis@haushhaush.de",           rolle: "Admin", department: "Management", position: "Head of Development",         startdatum: "2023-09-01" },
  { name: "Max Driesner",       email: "max.driesner@viralconnect.de",   rolle: "Admin", department: "Management", position: "Business Strategy",           startdatum: "2024-02-01" },
  // INTERN
  { name: "Justin Jackstell",   email: "justin@viralconnect.de",         rolle: "Account-Manager", department: "Intern", position: "Customer Success",      startdatum: "2024-02-01" },
  { name: "Antonia Götte",      email: "antonia@viralconnect.de",        rolle: "Account-Manager", department: "Intern", position: "Buchhaltung",            startdatum: "2024-02-01" },
  { name: "Olga Malachowski",   email: "buchhaltung@haushaush.de",       rolle: "Account-Manager", department: "Intern", position: "Buchhaltung",            startdatum: "2024-02-01" },
  // FULFILLMENT
  { name: "Jelle Altmiks",      email: "jelle@viralconnect.de",          rolle: "Account-Manager", department: "Fulfillment", position: "Foto & Video",     startdatum: "2025-09-04" },
  { name: "Khalifa Ben Ameur",  email: "khalifa@viralconnect.de",        rolle: "Account-Manager", department: "Fulfillment", position: "Development",       startdatum: "2025-09-04" },
  { name: "Lara Peter",         email: "lara@viralconnect.de",           rolle: "Account-Manager", department: "Fulfillment", position: "Account Setup",     startdatum: "2024-02-01" },
  { name: "Lilly Matejcek",     email: "lilly@viralconnect.de",          rolle: "Account-Manager", department: "Fulfillment", position: "Grafikdesign",      startdatum: "2024-02-01" },
  { name: "Lucian Ciocea",      email: "lucian@viralconnect.de",         rolle: "Account-Manager", department: "Fulfillment", position: "Webdesign",         startdatum: "2024-02-01" },
  { name: "Mohammed Arkbawi",   email: "mohammed@viralconnect.de",       rolle: "Account-Manager", department: "Fulfillment", position: "Development",       startdatum: "2024-02-01" },
  { name: "Osman Hanci",        email: "osman@viralconnect.de",          rolle: "Account-Manager", department: "Fulfillment", position: "Webdesign",         startdatum: "2025-08-06" },
  { name: "Samet Karayel",      email: "samet@viralconnect.de",          rolle: "Account-Manager", department: "Fulfillment", position: "Media Buying",      startdatum: "2024-02-01" },
  { name: "Thalia Schiedeck",   email: "thalia@viralconnect.de",         rolle: "Account-Manager", department: "Fulfillment", position: "Account Setup",     startdatum: "2025-09-04" },
  // SALES
  { name: "Lleyton Puls",       email: "lleyton@viralconnect.de",        rolle: "Setter", department: "Sales", position: "Setting · Mail Marketing",        startdatum: "2024-02-01" },
  { name: "Manis Achami",       email: "manis@viralconnect.de",          rolle: "Setter", department: "Sales", position: "Vorqualifikation",                startdatum: "2025-09-04" },
  { name: "Marc Hammer",        email: "marc@viralconnect.de",           rolle: "Setter", department: "Sales", position: "Cold Calling",                    startdatum: "2024-02-01" },
  { name: "Marcel Veit",        email: "marcel@viralconnect.de",         rolle: "Closer", department: "Sales", position: "Cold Calling",                    startdatum: "2024-02-01" },
  { name: "Nico von Engelmann", email: "nico@viralconnect.de",           rolle: "Setter", department: "Sales", position: "Setting",                         startdatum: "2024-02-01" },
];

const DEPT_GROUPS = [
  { label: 'MANAGEMENT', departments: ['Management'] },
  { label: 'MITARBEITER SALES', departments: ['Sales'] },
  { label: 'MITARBEITER FULFILLMENT', departments: ['Fulfillment'] },
  { label: 'MITARBEITER INTERN', departments: ['Intern'] },
];
const ALL_DEPTS = DEPT_GROUPS.flatMap(g => g.departments);
const ABTEILUNGEN = DEPT_GROUPS.map(g => g.label);

const getSeit = (m: any) => {
  const d = m.startdatum || m.einstiegsdatum;
  if (!d) return '—';
  const months = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return months >= 12 ? `${Math.floor(months / 12)} J. ${months % 12} M.` : `${months} Mon.`;
};

export default function Mitarbeiter() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterAbteilung, setFilterAbteilung] = useState<string | null>(null);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', rolle: 'Setter' as string, startdatum: '' });

  const fetchData = async () => {
    setLoading(true);
    const { data: existing } = await supabase.from('team').select('*').order('name');
    if (existing && existing.length > 0) {
      setMembers(existing);
      setLoading(false);
      return;
    }
    // DB is empty — seed once via edge function
    await supabase.functions.invoke('seed-team', { body: { members: TEAM_SEED } });
    const { data: seeded } = await supabase.from('team').select('*').order('name');
    if (seeded) setMembers(seeded);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const insertData: any = { name: form.name, email: form.email, rolle: form.rolle, startdatum: form.startdatum || null };
    const { error } = await supabase.from('team').insert(insertData);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Mitarbeiter hinzugefügt' });
    setDialogOpen(false);
    setForm({ name: '', email: '', rolle: 'Setter', startdatum: '' });
    fetchData();
  };

  const initials = (name: string) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '??';

  const filteredMembers = filterAbteilung
    ? members.filter((m: any) => {
        const group = DEPT_GROUPS.find(g => g.label === filterAbteilung);
        return group ? group.departments.includes(m.department || '') : false;
      })
    : members;

  const grouped = DEPT_GROUPS.map((group) => ({
    label: group.label,
    members: filteredMembers.filter((m: any) => group.departments.includes(m.department || '')),
  })).filter((g) => g.members.length > 0);

  const ungrouped = filteredMembers.filter((m: any) => !ALL_DEPTS.includes(m.department || ''));
  if (ungrouped.length > 0) grouped.push({ label: 'Sonstige', members: ungrouped });

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-[14px]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Mitarbeiter</h1>
          <p className="text-muted-foreground text-sm">{filteredMembers.length} Teammitglieder</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-[44px]"><Plus className="h-4 w-4 mr-2" />Neuer Mitarbeiter</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-none">
              <DialogHeader><DialogTitle>Mitarbeiter hinzufügen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label htmlFor="team-name">Name *</Label><Input id="team-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div><Label htmlFor="team-email">E-Mail *</Label><Input id="team-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                <div><Label htmlFor="team-rolle">Rolle</Label>
                  <Select value={form.rolle} onValueChange={v => setForm({ ...form, rolle: v })}>
                    <SelectTrigger id="team-rolle"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Admin', 'Account-Manager', 'Setter', 'Closer'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label htmlFor="team-start">Startdatum</Label><Input id="team-start" type="date" value={form.startdatum} onChange={e => setForm({ ...form, startdatum: e.target.value })} /></div>
                <Button type="submit" className="w-full min-h-[44px]">Hinzufügen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterAbteilung(null)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${!filterAbteilung ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
        >
          Alle
        </button>
        {ABTEILUNGEN.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setFilterAbteilung(a)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterAbteilung === a ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
          >
            {a}
          </button>
        ))}
      </div>

      {grouped.map((group) => (
        <div key={group.label} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            {group.label}
            <Badge variant="secondary" className="text-xs font-normal">{group.members.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.members.map((m: any) => (
              <Card
                key={m.id}
                className="rounded-[14px] cursor-pointer hover:border-primary/40 transition-colors group"
                onClick={() => navigate(`/hr/mitarbeiter/${m.id}`)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <Avatar className="h-11 w-11 mt-0.5">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.position || '–'}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{DEPT_DISPLAY[m.department] || m.department || '–'}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{getSeit(m)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
