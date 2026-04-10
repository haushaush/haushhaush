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
import { Plus, Mail, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ROLLE_COLORS: Record<string, string> = {
  'Admin': 'bg-primary/20 text-primary',
  'Account-Manager': 'bg-success/20 text-success',
  'Setter': 'bg-warning/20 text-warning',
  'Closer': 'bg-purple-500/20 text-purple-400',
  'Management': 'bg-blue-500/20 text-blue-400',
  'Fulfillment': 'bg-teal-500/20 text-teal-400',
};

const DEPT_GROUPS = [
  { label: 'Management', departments: ['Management'] },
  { label: 'Sales', departments: ['Setter', 'Closer', 'Sales'] },
  { label: 'Fulfillment', departments: ['Fulfillment', 'Account-Manager', 'Tech', 'Websites', 'Media Buying', 'Backoffice', 'Operation'] },
];
const ALL_DEPTS = DEPT_GROUPS.flatMap(g => g.departments);
const ABTEILUNGEN = ['Management', 'Sales', 'Setter', 'Closer', 'Fulfillment', 'Tech', 'Websites', 'Backoffice', 'Media Buying'];

const getSeit = (d: string | null) => {
  if (!d) return '—';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return m >= 12 ? `${Math.floor(m / 12)} J. ${m % 12} M.` : `${m} Mon.`;
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
    const { data } = await supabase.from('team').select('*').order('name');
    if (data) setMembers(data);
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
    ? members.filter((m: any) => m.department === filterAbteilung || (m.abteilung && m.abteilung.includes(filterAbteilung)))
    : members;

  const grouped = GROUP_ORDER.map((group) => ({
    label: group,
    members: filteredMembers.filter((m: any) => (m.mitarbeiter_typ || 'Fulfillment') === group),
  })).filter((g) => g.members.length > 0);

  const groupedIds = new Set(grouped.flatMap((g) => g.members.map((m: any) => m.id)));
  const ungrouped = filteredMembers.filter((m) => !groupedIds.has(m.id));
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{m.name}</p>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${ROLLE_COLORS[m.rolle] || ''}`}>
                        {m.rolle}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.position || '–'}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      {m.email && (
                        <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{m.email}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{getSeit(m.einstiegsdatum)}</span>
                      {(m.abteilung || []).slice(0, 2).map((a: string) => (
                        <Badge key={a} variant="outline" className="text-[10px] px-1 py-0">{a}</Badge>
                      ))}
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
