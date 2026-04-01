import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];
type ClientInsert = Database['public']['Tables']['clients']['Insert'];

const AMPEL_STYLES: Record<string, string> = {
  'Grün': 'bg-success/20 text-success border-success/30',
  'Gelb': 'bg-warning/20 text-warning border-warning/30',
  'Rot': 'bg-destructive/20 text-destructive border-destructive/30',
  'CC': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Pausiert': 'bg-warning/20 text-warning',
  'Churned': 'bg-destructive/20 text-destructive',
  'Lead': 'bg-primary/20 text-primary',
};

export default function Kunden() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isAdminOrManager } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState<ClientInsert>({
    name: '', email: '', phone: '', website: '', branche: '',
    kundenstatus: 'Lead', ampelstatus: 'Grün', projekttyp: '', zahlstatus: '', laufzeit: '',
  });

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (data) setClients(data);
  };

  useEffect(() => { fetchClients(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('clients').insert(form);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Kunde erstellt' });
    setDialogOpen(false);
    setForm({ name: '', email: '', phone: '', website: '', branche: '', kundenstatus: 'Lead', ampelstatus: 'Grün', projekttyp: '', zahlstatus: '', laufzeit: '' });
    fetchClients();
  };

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || c.kundenstatus === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Kunden</h1>
          <p className="text-muted-foreground text-sm">{clients.length} Kunden insgesamt</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Neuer Kunde</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Neuen Kunden anlegen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                  <div><Label>E-Mail</Label><Input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                  <div><Label>Telefon</Label><Input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                  <div><Label>Website</Label><Input value={form.website || ''} onChange={e => setForm({...form, website: e.target.value})} /></div>
                  <div><Label>Branche</Label><Input value={form.branche || ''} onChange={e => setForm({...form, branche: e.target.value})} /></div>
                  <div><Label>Projekttyp</Label><Input value={form.projekttyp || ''} onChange={e => setForm({...form, projekttyp: e.target.value})} /></div>
                  <div>
                    <Label>Kundenstatus</Label>
                    <Select value={form.kundenstatus} onValueChange={v => setForm({...form, kundenstatus: v as Client['kundenstatus']})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Lead', 'In Betreuung', 'Pausiert', 'Churned'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ampelstatus</Label>
                    <Select value={form.ampelstatus} onValueChange={v => setForm({...form, ampelstatus: v as Client['ampelstatus']})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Grün', 'Gelb', 'Rot', 'CC'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full">Kunde anlegen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Kunden suchen..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status filtern" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {['Lead', 'In Betreuung', 'Pausiert', 'Churned'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ampel</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Branche</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>CLV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine Kunden gefunden</TableCell></TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Badge variant="outline" className={AMPEL_STYLES[c.ampelstatus]}>{c.ampelstatus}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.branche || '–'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_STYLES[c.kundenstatus]}>{c.kundenstatus}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.email || '–'}</TableCell>
                  <TableCell className="font-medium">€{Number(c.clv || 0).toLocaleString('de-DE')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
