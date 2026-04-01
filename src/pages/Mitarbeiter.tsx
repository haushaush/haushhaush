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
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Team = Database['public']['Tables']['team']['Row'];

const ROLLE_COLORS: Record<string, string> = {
  'Admin': 'bg-primary/20 text-primary',
  'Account-Manager': 'bg-success/20 text-success',
  'Setter': 'bg-warning/20 text-warning',
  'Closer': 'bg-purple-500/20 text-purple-400',
};

export default function Mitarbeiter() {
  const [members, setMembers] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', rolle: 'Setter' as Team['rolle'], startdatum: '' });

  const fetchData = async () => {
    const { data } = await supabase.from('team').select('*').order('name');
    if (data) setMembers(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('team').insert({ ...form, startdatum: form.startdatum || null });
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Mitarbeiter hinzugefügt' });
    setDialogOpen(false);
    setForm({ name: '', email: '', rolle: 'Setter', startdatum: '' });
    fetchData();
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Mitarbeiter werden geladen">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Mitarbeiter</h1>
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
                <div><Label htmlFor="team-rolle">Rolle</Label>
                  <Select value={form.rolle} onValueChange={v => setForm({...form, rolle: v as Team['rolle']})}>
                    <SelectTrigger id="team-rolle"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Admin', 'Account-Manager', 'Setter', 'Closer'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label htmlFor="team-start">Startdatum</Label><Input id="team-start" type="date" value={form.startdatum} onChange={e => setForm({...form, startdatum: e.target.value})} /></div>
                <Button type="submit" className="w-full min-h-[44px]">Hinzufügen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Teammitglieder</caption>
            <TableHeader><TableRow>
              <TableHead scope="col">Name</TableHead><TableHead scope="col">E-Mail</TableHead><TableHead scope="col">Rolle</TableHead><TableHead scope="col" className="hidden sm:table-cell">Startdatum</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Keine Mitarbeiter</TableCell></TableRow>
              ) : members.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs sm:text-sm">{m.email}</TableCell>
                  <TableCell><Badge variant="secondary" className={ROLLE_COLORS[m.rolle]}>{m.rolle}</Badge></TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{m.startdatum || '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
