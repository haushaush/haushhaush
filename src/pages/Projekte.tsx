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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type ClientRef = { id: string; name: string };

export default function Projekte() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isAdminOrManager } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ client_id: '', name: '', projekttyp: '', ads_budget: 0, status: 'Aktiv' });

  const fetchData = async () => {
    const [p, c] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name'),
    ]);
    if (p.data) setProjects(p.data);
    if (c.data) setClients(c.data);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('projects').insert({ ...form, ads_budget: form.ads_budget });
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Projekt erstellt' });
    setDialogOpen(false);
    fetchData();
  };

  const clientName = (id: string) => clients.find(c => c.id === id)?.name || '–';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Projekte</h1>
          <p className="text-muted-foreground text-sm">{projects.length} Projekte</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Neues Projekt</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Neues Projekt anlegen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label>Kunde *</Label>
                  <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Projektname *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                <div><Label>Projekttyp</Label><Input value={form.projekttyp} onChange={e => setForm({...form, projekttyp: e.target.value})} /></div>
                <div><Label>Ads Budget (€)</Label><Input type="number" value={form.ads_budget} onChange={e => setForm({...form, ads_budget: +e.target.value})} /></div>
                <Button type="submit" className="w-full" disabled={!form.client_id || !form.name}>Projekt anlegen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projekt</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine Projekte</TableCell></TableRow>
              ) : projects.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{clientName(p.client_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.projekttyp || '–'}</TableCell>
                  <TableCell>€{Number(p.ads_budget || 0).toLocaleString('de-DE')}</TableCell>
                  <TableCell>€{Number(p.gesamt_saldo || 0).toLocaleString('de-DE')}</TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
