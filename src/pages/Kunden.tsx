import { useEffect, useState, useMemo, useRef } from 'react';
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
import { Plus, Search, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Aktiv': 'bg-success/20 text-success',
  'Pausiert': 'bg-warning/20 text-warning',
  'Churned': 'bg-destructive/20 text-destructive',
};

const ART_STYLES: Record<string, string> = {
  'Beihilfe - PKV': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'PKV': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'BU': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Sterbegeld': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'Tierkrankenversicherung': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Erbschaftssteuer': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Dienstleister': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const AMPEL_MAP: Record<string, { dot: string; label: string }> = {
  'AA': { dot: 'bg-success', label: 'AA' },
  'A': { dot: 'bg-success', label: 'A' },
  'Grün': { dot: 'bg-success', label: 'A' },
  'BB': { dot: 'bg-warning', label: 'BB' },
  'B': { dot: 'bg-warning', label: 'B' },
  'Gelb': { dot: 'bg-warning', label: 'B' },
  'CC': { dot: 'bg-destructive', label: 'CC' },
  'C': { dot: 'bg-destructive', label: 'C' },
  'Rot': { dot: 'bg-destructive', label: 'C' },
};

const LEISTUNG_SHORT: Record<string, string> = {
  'Meta Werbeanzeigen': 'Meta Ads', 'Ads Landing Page - Onepage': 'OnePage',
  'CRM Setup & Anbindung': 'CRM', 'Vorqualifizierung': 'Vorquali', 'Superchat': 'Superchat',
};

const ART_OPTIONS = ['PKV', 'BU', 'Beihilfe - PKV', 'Sterbegeld', 'Tierkrankenversicherung', 'Erbschaftssteuer', 'Dienstleister', 'Sonstiges'];

export default function Kunden() {
  const [deals, setDeals] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterArt, setFilterArt] = useState('all');
  const [filterAmpel, setFilterAmpel] = useState('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isAdminOrManager } = useAuth();
  const navigate = useNavigate();
  const autoSyncDone = useRef(false);

  const [form, setForm] = useState({
    client_name: '', art: 'PKV', wert_eur: 0, laufzeit_monate: 12,
    deal_type: 'Neukunde', status: 'Aktiv', ampelstatus: 'Grün',
  });

  const fetchData = async () => {
    const [d, t] = await Promise.all([
      supabase.from('close_deals').select('*').order('created_at', { ascending: false }),
      supabase.from('team').select('id, name'),
    ]);
    setDeals(d.data || []);
    setTeam(t.data || []);
    setLoading(false);
    return d.data || [];
  };

  const handleNotionSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Notion-Sync läuft...');
    try {
      const { data, error } = await supabase.functions.invoke('sync-notion', {
        body: { target: 'kunden' },
      });
      if (error) throw error;
      toast.success(`${data?.synced?.kunden || 0} Kunden synchronisiert`, { id: toastId });
      await fetchData();
    } catch (err: any) {
      toast.error('Notion-Sync fehlgeschlagen', { id: toastId, description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData().then((data) => {
      if (data.length === 0 && !autoSyncDone.current) {
        autoSyncDone.current = true;
        handleNotionSync();
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('close_deals').insert(form);
    if (error) { toast.error('Fehler', { description: error.message }); return; }
    toast.success('Deal erstellt');
    setDialogOpen(false);
    setForm({ client_name: '', art: 'PKV', wert_eur: 0, laufzeit_monate: 12, deal_type: 'Neukunde', status: 'Aktiv', ampelstatus: 'Grün' });
    fetchData();
  };

  const handleCloseSync = () => {
    toast.info('Close Sync wird via n8n angestoßen...');
  };

  const getName = (id: string | null) => team.find(t => t.id === id)?.name || '–';

  const getDisplayArt = (d: any) => d.art || (Array.isArray(d.branche) && d.branche[0]) || '–';
  const getDisplayWert = (d: any) => {
    const v = d.wert_eur ?? d.gesamt_saldo ?? 0;
    return `€${Number(v).toLocaleString('de-DE')}`;
  };
  const getDisplayStatus = (d: any) => d.kundenstatus || d.status || '–';
  const getDisplayAmpel = (d: any) => d.ampel || d.ampelstatus || '–';

  const filtered = useMemo(() => deals.filter(d => {
    const matchSearch = d.client_name?.toLowerCase().includes(search.toLowerCase());
    const st = getDisplayStatus(d);
    const matchStatus = filterStatus === 'all' || st === filterStatus || d.status === filterStatus;
    const art = getDisplayArt(d);
    const matchArt = filterArt === 'all' || art === filterArt;
    const ampel = getDisplayAmpel(d);
    const matchAmpel = filterAmpel === 'all' || ampel === filterAmpel;
    const matchAssigned = filterAssigned === 'all' || d.assigned_to === filterAssigned;
    return matchSearch && matchStatus && matchArt && matchAmpel && matchAssigned;
  }), [deals, search, filterStatus, filterArt, filterAmpel, filterAssigned]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    deals.forEach(d => { const s = getDisplayStatus(d); if (s && s !== '–') set.add(s); });
    return Array.from(set).sort();
  }, [deals]);

  const uniqueArts = useMemo(() => {
    const set = new Set<string>();
    deals.forEach(d => { const a = getDisplayArt(d); if (a && a !== '–') set.add(a); });
    return Array.from(set).sort();
  }, [deals]);

  const uniqueAmpels = useMemo(() => {
    const set = new Set<string>();
    deals.forEach(d => { const a = getDisplayAmpel(d); if (a && a !== '–') set.add(a); });
    return Array.from(set).sort();
  }, [deals]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Kunden werden geladen">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-64" /><Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Kunden</h1>
          <p className="text-muted-foreground text-sm">{deals.length} Kunden</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-[44px]" onClick={handleNotionSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />}
            Notion Sync
          </Button>
          <Button variant="outline" className="min-h-[44px]" onClick={handleCloseSync}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />Close Sync
          </Button>
          {isAdminOrManager && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="min-h-[44px]"><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Manuell hinzufügen</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-h-none">
                <DialogHeader><DialogTitle>Deal manuell anlegen</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label htmlFor="deal-name">Kundenname *</Label><Input id="deal-name" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} required /></div>
                    <div><Label>Art</Label>
                      <Select value={form.art} onValueChange={v => setForm({ ...form, art: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ART_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label htmlFor="deal-wert">Wert (€)</Label><Input id="deal-wert" type="number" step="0.01" value={form.wert_eur} onChange={e => setForm({ ...form, wert_eur: +e.target.value })} /></div>
                    <div><Label htmlFor="deal-laufzeit">Laufzeit (Monate)</Label><Input id="deal-laufzeit" type="number" value={form.laufzeit_monate} onChange={e => setForm({ ...form, laufzeit_monate: +e.target.value })} /></div>
                    <div><Label>Typ</Label>
                      <Select value={form.deal_type} onValueChange={v => setForm({ ...form, deal_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="Neukunde">Neukunde</SelectItem><SelectItem value="Upsell">Upsell</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><Label>Ampelstatus</Label>
                      <Select value={form.ampelstatus} onValueChange={v => setForm({ ...form, ampelstatus: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{['Grün', 'Gelb', 'Rot'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" className="w-full min-h-[44px]">Deal anlegen</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-9 min-h-[44px]" placeholder="Kundenname suchen..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Kunden suchen" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] min-h-[44px]" aria-label="Status filtern"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {uniqueStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterArt} onValueChange={setFilterArt}>
          <SelectTrigger className="w-[120px] min-h-[44px]" aria-label="Art filtern"><SelectValue placeholder="Art" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Arten</SelectItem>
            {uniqueArts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAmpel} onValueChange={setFilterAmpel}>
          <SelectTrigger className="w-[120px] min-h-[44px]" aria-label="Ampel filtern"><SelectValue placeholder="Ampel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            {uniqueAmpels.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssigned} onValueChange={setFilterAssigned}>
          <SelectTrigger className="w-[140px] min-h-[44px] hidden sm:flex" aria-label="Assigned filtern"><SelectValue placeholder="Zugewiesen" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle</SelectItem>{team.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Kundenliste</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Kunde</TableHead>
                  <TableHead scope="col">Art</TableHead>
                  <TableHead scope="col">Wert</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Laufzeit</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Ampel</TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">Leistungen</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">Zugewiesen</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {syncing ? 'Daten werden synchronisiert...' : 'Keine Kunden gefunden'}
                  </TableCell></TableRow>
                ) : filtered.map(d => {
                  const displayArt = getDisplayArt(d);
                  const displayStatus = getDisplayStatus(d);
                  const displayAmpel = getDisplayAmpel(d);
                  const ampelInfo = AMPEL_MAP[displayAmpel] || { dot: 'bg-muted', label: displayAmpel };

                  return (
                    <TableRow key={d.id} className="cursor-pointer hover:bg-primary/5 min-h-[44px]" onClick={() => navigate(`/kunden/${d.id}`)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate(`/kunden/${d.id}`)} role="link" aria-label={`Kunde ${d.client_name} öffnen`}>
                      <TableCell className="font-medium">{d.client_name}</TableCell>
                      <TableCell><Badge variant="secondary" className={`text-[10px] border-0 ${ART_STYLES[displayArt] || 'bg-muted text-muted-foreground'}`}>{displayArt}</Badge></TableCell>
                      <TableCell className="font-medium">{getDisplayWert(d)}</TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {d.laufzeit_monate ? `${d.laufzeit_monate} M` : d.start_datum || '–'}
                      </TableCell>
                      <TableCell><Badge variant="secondary" className={`text-xs ${STATUS_STYLES[displayStatus] || 'bg-muted text-muted-foreground'}`}>{displayStatus}</Badge></TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5" aria-label={`Ampel: ${displayAmpel}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${ampelInfo.dot}`} aria-hidden="true" />
                          <span className="text-xs font-medium text-muted-foreground">{ampelInfo.label}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {Array.isArray(d.leistungen) && d.leistungen.map((l: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{LEISTUNG_SHORT[l] || l}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">{getName(d.assigned_to)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {(d.close_opportunity_url || d.notion_url) && (
                          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={e => { e.stopPropagation(); window.open(d.close_opportunity_url || d.notion_url, '_blank'); }}>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Öffnen</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
