import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Plus, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];
type ClientInsert = Database['public']['Tables']['clients']['Insert'];

const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive', 'CC': 'bg-purple-400' };
const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success', 'Pausiert': 'bg-warning/20 text-warning',
  'Churned': 'bg-destructive/20 text-destructive', 'Lead': 'bg-primary/20 text-primary',
};

export default function Kunden() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBranche, setFilterBranche] = useState('all');
  const [filterAmpel, setFilterAmpel] = useState('all');
  const [filterProjekttyp, setFilterProjekttyp] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isAdminOrManager } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<ClientInsert>({
    name: '', email: '', phone: '', website: '', branche: '',
    kundenstatus: 'Lead', ampelstatus: 'Grün', projekttyp: '', zahlstatus: '', laufzeit: '',
  });

  const fetchData = async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (data) setClients(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('clients').insert(form);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Kunde erstellt' });
    setDialogOpen(false);
    setForm({ name: '', email: '', phone: '', website: '', branche: '', kundenstatus: 'Lead', ampelstatus: 'Grün', projekttyp: '', zahlstatus: '', laufzeit: '' });
    fetchData();
  };

  const branchen = useMemo(() => [...new Set(clients.map(c => c.branche).filter(Boolean))], [clients]);
  const projekttypen = useMemo(() => [...new Set(clients.map(c => c.projekttyp).filter(Boolean))], [clients]);

  const filtered = useMemo(() => clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || c.kundenstatus === filterStatus;
    const matchBranche = filterBranche === 'all' || c.branche === filterBranche;
    const matchAmpel = filterAmpel === 'all' || c.ampelstatus === filterAmpel;
    const matchProjekttyp = filterProjekttyp === 'all' || c.projekttyp === filterProjekttyp;
    return matchSearch && matchStatus && matchBranche && matchAmpel && matchProjekttyp;
  }), [clients, search, filterStatus, filterBranche, filterAmpel, filterProjekttyp]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Kunden werden geladen">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Kunden</h1>
          <p className="text-muted-foreground text-sm">{clients.length} Kunden insgesamt</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-[44px]"><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Neuer Kunde</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-h-none">
              <DialogHeader><DialogTitle>Neuen Kunden anlegen</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label htmlFor="client-name">Name *</Label><Input id="client-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div><Label htmlFor="client-email">E-Mail</Label><Input id="client-email" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label htmlFor="client-phone">Telefon</Label><Input id="client-phone" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label htmlFor="client-website">Website</Label><Input id="client-website" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
                  <div><Label htmlFor="client-branche">Branche</Label><Input id="client-branche" value={form.branche || ''} onChange={e => setForm({ ...form, branche: e.target.value })} /></div>
                  <div><Label htmlFor="client-projekttyp">Projekttyp</Label><Input id="client-projekttyp" value={form.projekttyp || ''} onChange={e => setForm({ ...form, projekttyp: e.target.value })} /></div>
                  <div>
                    <Label>Kundenstatus</Label>
                    <Select value={form.kundenstatus} onValueChange={v => setForm({ ...form, kundenstatus: v as Client['kundenstatus'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['Lead', 'In Betreuung', 'Pausiert', 'Churned'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ampelstatus</Label>
                    <Select value={form.ampelstatus} onValueChange={v => setForm({ ...form, ampelstatus: v as Client['ampelstatus'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['Grün', 'Gelb', 'Rot', 'CC'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="client-zahlstatus">Zahlstatus</Label><Input id="client-zahlstatus" value={form.zahlstatus || ''} onChange={e => setForm({ ...form, zahlstatus: e.target.value })} /></div>
                  <div><Label htmlFor="client-laufzeit">Laufzeit</Label><Input id="client-laufzeit" value={form.laufzeit || ''} onChange={e => setForm({ ...form, laufzeit: e.target.value })} /></div>
                </div>
                <Button type="submit" className="w-full min-h-[44px]">Kunde anlegen</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-9 min-h-[44px]" placeholder="Name oder E-Mail suchen..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Kunden suchen" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] min-h-[44px]" aria-label="Kundenstatus filtern"><SelectValue placeholder="Kundenstatus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {['Lead', 'In Betreuung', 'Pausiert', 'Churned'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAmpel} onValueChange={setFilterAmpel}>
          <SelectTrigger className="w-[130px] min-h-[44px]" aria-label="Ampelstatus filtern"><SelectValue placeholder="Ampel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Ampel</SelectItem>
            {['Grün', 'Gelb', 'Rot', 'CC'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {branchen.length > 0 && (
          <Select value={filterBranche} onValueChange={setFilterBranche}>
            <SelectTrigger className="w-[130px] min-h-[44px] hidden sm:flex" aria-label="Branche filtern"><SelectValue placeholder="Branche" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Branchen</SelectItem>
              {branchen.map(b => <SelectItem key={b!} value={b!}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {projekttypen.length > 0 && (
          <Select value={filterProjekttyp} onValueChange={setFilterProjekttyp}>
            <SelectTrigger className="w-[130px] min-h-[44px] hidden sm:flex" aria-label="Projekttyp filtern"><SelectValue placeholder="Projekttyp" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {projekttypen.map(p => <SelectItem key={p!} value={p!}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Kundenliste mit Status, Ampelstatus und CLV</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Branche</TableHead>
                  <TableHead scope="col">Kundenstatus</TableHead>
                  <TableHead scope="col">Ampel</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Projekttyp</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">Startdatum</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">Laufzeit</TableHead>
                  <TableHead scope="col">CLV</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Zahlstatus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Keine Kunden gefunden</TableCell></TableRow>
                ) : filtered.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-primary/5 min-h-[44px]" onClick={() => navigate(`/kunden/${c.id}`)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate(`/kunden/${c.id}`)} role="link" aria-label={`Kunde ${c.name} öffnen`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.branche || '–'}</TableCell>
                    <TableCell><Badge variant="secondary" className={STATUS_STYLES[c.kundenstatus]}>{c.kundenstatus}</Badge></TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2" aria-label={`Ampelstatus: ${c.ampelstatus}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_DOT[c.ampelstatus] || 'bg-muted'}`} aria-hidden="true" />
                        <span className="text-xs text-muted-foreground">{c.ampelstatus}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">{c.projekttyp || '–'}</TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">{c.startdatum || '–'}</TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">{c.laufzeit || '–'}</TableCell>
                    <TableCell className="font-medium">€{Number(c.clv || 0).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.zahlstatus ? (
                        <Badge variant={c.zahlstatus.toLowerCase() === 'offen' ? 'destructive' : 'secondary'} className="text-xs">{c.zahlstatus}</Badge>
                      ) : <span className="text-muted-foreground">–</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
