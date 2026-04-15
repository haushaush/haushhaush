import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import KundenSlidePanel from '@/components/kunden/KundenSlidePanel';
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
import { Plus, Search, RefreshCw, Loader2, Database, LayoutGrid, TableIcon } from 'lucide-react';
import { toast } from 'sonner';
import KundenCardView from '@/components/kunden/KundenCardView';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const ART_STYLES: Record<string, string> = {
  'Beihilfe - PKV': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'PKV': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'BU': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Sterbegeld': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'Tierkrankenversicherung': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'TKV': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Erbschaftssteuer': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Dienstleister': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  'Rechtsschutz': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'Unfallversicherung': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
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

const isAktiv = (d: any) =>
  d.kundenstatus != null && d.kundenstatus !== 'Done';

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

export default function Kunden() {
  const [deals, setDeals] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [activeSubTab, setActiveSubTab] = useState('all');
  const [filterArt, setFilterArt] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
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
    const toastId = toast.loading('Notion-Import läuft...');
    try {
      const { data, error } = await supabase.functions.invoke('sync-notion', {
        body: { target: 'kunden' },
      });
      if (error) throw error;
      toast.success(`${data?.synced?.kunden || 0} Kunden importiert`, { id: toastId });
      await fetchData();
    } catch (err: any) {
      toast.error('Import fehlgeschlagen', { id: toastId, description: err.message });
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

  // Dynamic company tabs from active deals
  const dynamicCompanyTabs = useMemo(() => {
    const companies = new Set<string>();
    deals.forEach(d => {
      if (isAktiv(d) && d.unternehmen) {
        companies.add(d.unternehmen);
      }
    });
    return Array.from(companies).sort();
  }, [deals]);

  const TABS = [
    { label: 'Alle Kunden', value: 'all' },
    { label: 'Aktive Kunden', value: 'aktiv' },
    { label: 'Follow Up', value: 'followup' },
    { label: 'Abschlüsse', value: 'done' },
  ];

  const filtered = useMemo(() => deals.filter(d => {
    const matchSearch = d.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchArt = filterArt === 'all' || (Array.isArray(d.branche) ? d.branche[0] : d.art) === filterArt;

    let matchTab = true;
    if (activeTab === 'all') {
      matchTab = true;
    } else if (activeTab === 'aktiv') {
      matchTab = isAktiv(d);
      if (matchTab && activeSubTab !== 'all') {
        matchTab = d.unternehmen === activeSubTab;
      }
    } else if (activeTab === 'followup') {
      matchTab = d.kundenstatus === 'Follow Up';
    } else if (activeTab === 'done') {
      matchTab = d.zahlstatus === 'DONE';
    }

    return matchSearch && matchTab && matchArt;
  }), [deals, search, activeTab, activeSubTab, filterArt]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: deals.length };
    counts['aktiv'] = deals.filter(d => isAktiv(d)).length;
    counts['followup'] = deals.filter(d => d.kundenstatus === 'Follow Up').length;
    counts['done'] = deals.filter(d => d.zahlstatus === 'DONE').length;
    dynamicCompanyTabs.forEach(c => {
      counts[`company:${c}`] = deals.filter(d => isAktiv(d) && d.unternehmen === c).length;
    });
    return counts;
  }, [deals, dynamicCompanyTabs]);

  const uniqueBranchen = useMemo(() => {
    const set = new Set<string>();
    deals.forEach(d => {
      const b = Array.isArray(d.branche) ? d.branche[0] : d.art;
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [deals]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-64" /><Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Kunden</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-0.5">
            <Database className="h-3.5 w-3.5" />
            <span>Importiert aus Notion · {deals.length} Kunden</span>
            {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
        </div>
        <div className="flex gap-2">
          {/* View toggle */}
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              title="Tabellenansicht"
            >
              <TableIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              title="Kartenansicht"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" className="min-h-[40px]" onClick={handleNotionSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Erneut importieren
          </Button>
          {isAdminOrManager && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="min-h-[40px]"><Plus className="h-4 w-4 mr-2" />Hinzufügen</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-h-none">
                <DialogHeader><DialogTitle>Kunde manuell anlegen</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label htmlFor="deal-name">Kundenname *</Label><Input id="deal-name" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} required /></div>
                    <div><Label>Art</Label>
                      <Select value={form.art} onValueChange={v => setForm({ ...form, art: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{uniqueBranchen.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label htmlFor="deal-wert">Wert (€)</Label><Input id="deal-wert" type="number" step="0.01" value={form.wert_eur} onChange={e => setForm({ ...form, wert_eur: +e.target.value })} /></div>
                    <div><Label htmlFor="deal-laufzeit">Laufzeit (Monate)</Label><Input id="deal-laufzeit" type="number" value={form.laufzeit_monate} onChange={e => setForm({ ...form, laufzeit_monate: +e.target.value })} /></div>
                  </div>
                  <Button type="submit" className="w-full min-h-[44px]">Anlegen</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs — horizontally scrollable */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); if (tab.value !== 'aktiv') setActiveSubTab('all'); }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
              activeTab === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {tabCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Sub-tabs for Aktive Kunden */}
      {activeTab === 'aktiv' && dynamicCompanyTabs.length > 0 && (
        <div className="flex gap-0.5 overflow-x-auto pb-px scrollbar-none -mt-3">
          <button
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
              activeSubTab === 'all'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Alle
          </button>
          {dynamicCompanyTabs.map(c => (
            <button
              key={c}
              onClick={() => setActiveSubTab(c)}
              className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                activeSubTab === c
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {c}
              <span className="ml-1 text-[10px] text-muted-foreground">
                {tabCounts[`company:${c}`] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 min-h-[44px]" placeholder="Kundenname suchen..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterArt} onValueChange={setFilterArt}>
          <SelectTrigger className="w-[150px] min-h-[44px]"><SelectValue placeholder="Branche" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Branchen</SelectItem>
            {uniqueBranchen.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        <KundenCardView deals={filtered} onSelect={setSelectedDeal} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Kundenliste</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Branche</TableHead>
                    <TableHead>Kundenstatus</TableHead>
                    <TableHead>Ampel</TableHead>
                    <TableHead className="text-right">Gesamt-Saldo</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Ads-Budget</TableHead>
                    <TableHead className="hidden lg:table-cell">Zeitraum</TableHead>
                    <TableHead className="hidden md:table-cell">Zahlstatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        {syncing ? 'Daten werden importiert...' : 'Keine Kunden gefunden'}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(d => {
                    const branche0 = Array.isArray(d.branche) ? d.branche[0] : d.art;
                    const ks = d.kundenstatus || '–';
                    const ampelRaw = d.ampel || d.ampelstatus || '';
                    const ampel = AMPEL_MAP[ampelRaw] || { dot: 'bg-muted', label: ampelRaw || '–' };
                    const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ') || '–';

                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer hover:bg-primary/5"
                        onClick={() => setSelectedDeal(d)}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setSelectedDeal(d)}
                        role="button"
                      >
                        <TableCell className="font-medium max-w-[200px] truncate">{d.client_name}</TableCell>
                        <TableCell>
                          {branche0 ? (
                            <Badge variant="secondary" className={`text-[10px] border-0 ${ART_STYLES[branche0] || 'bg-muted text-muted-foreground'}`}>
                              {branche0}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">–</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>
                            {ks}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${ampel.dot}`} />
                            <span className="text-xs font-medium text-muted-foreground">{ampel.label}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt(d.gesamt_saldo ?? d.wert_eur)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">{fmt(d.ads_budget)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">{dateRange}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {d.zahlstatus ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{d.zahlstatus}</Badge>
                          ) : <span className="text-muted-foreground text-xs">–</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slide-in panel */}
      {selectedDeal && (
        <KundenSlidePanel deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      )}
    </div>
  );
}
