import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import KundenSlidePanel from '@/components/kunden/KundenSlidePanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Search, RefreshCw, Loader2, LayoutGrid, TableIcon, ArrowUpDown, ArrowUp, ArrowDown, Users, FileX, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import KundenCardView from '@/components/kunden/KundenCardView';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
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

type SortKey = 'client_name' | 'kundenstatus' | 'gesamt_saldo' | 'ads_budget' | 'ampel';
type SortDir = 'asc' | 'desc';

const AMPEL_ORDER: Record<string, number> = { AA: 1, A: 2, Grün: 2, BB: 3, B: 4, Gelb: 4, CC: 5, C: 6, Rot: 6 };

export default function Kunden() {
  const [deals, setDeals] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [activeSubTab, setActiveSubTab] = useState('all');
  const [filterArt, setFilterArt] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { isAdminOrManager } = useAuth();
  const navigate = useNavigate();
  const autoSyncDone = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('close_deals').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Fehler beim Löschen', { description: error.message });
      setDeleting(false);
      return;
    }
    toast.success('Kunde wurde gelöscht');
    setDeleteTarget(null);
    setSelectedDeal(null);
    setDeleting(false);
    fetchData();
  };

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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const COMPANY_SUB_TABS = ['Allianz', 'Hanse Merkur', 'Barmenia Gothaer', 'Signal Iduna', 'Individuell'];

  const TABS = [
    { label: 'Alle', value: 'all' },
    { label: 'Aktiv', value: 'aktiv' },
    { label: 'Follow Up', value: 'followup' },
    { label: 'Abschlüsse', value: 'done' },
  ];

  const filtered = useMemo(() => {
    let result = deals.filter(d => {
      const matchSearch = d.client_name?.toLowerCase().includes(search.toLowerCase());
      const matchArt = filterArt === 'all' || (Array.isArray(d.branche) ? d.branche[0] : d.art) === filterArt;

      let matchTab = true;
      if (activeTab === 'aktiv') {
        matchTab = isAktiv(d);
        if (matchTab && activeSubTab !== 'all') matchTab = d.unternehmen === activeSubTab;
      } else if (activeTab === 'followup') {
        matchTab = d.kundenstatus === 'Follow Up';
      } else if (activeTab === 'done') {
        matchTab = d.zahlstatus === 'DONE';
      }

      return matchSearch && matchTab && matchArt;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        let va: any, vb: any;
        if (sortKey === 'gesamt_saldo') { va = a.gesamt_saldo ?? a.wert_eur ?? 0; vb = b.gesamt_saldo ?? b.wert_eur ?? 0; }
        else if (sortKey === 'ads_budget') { va = a.ads_budget ?? 0; vb = b.ads_budget ?? 0; }
        else if (sortKey === 'ampel') { va = AMPEL_ORDER[a.ampel || a.ampelstatus || ''] ?? 99; vb = AMPEL_ORDER[b.ampel || b.ampelstatus || ''] ?? 99; }
        else if (sortKey === 'client_name') { va = (a.client_name || '').toLowerCase(); vb = (b.client_name || '').toLowerCase(); }
        else { va = (a[sortKey] || '').toString().toLowerCase(); vb = (b[sortKey] || '').toString().toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [deals, search, activeTab, activeSubTab, filterArt, sortKey, sortDir]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: deals.length };
    counts['aktiv'] = deals.filter(d => isAktiv(d)).length;
    counts['followup'] = deals.filter(d => d.kundenstatus === 'Follow Up').length;
    counts['done'] = deals.filter(d => d.zahlstatus === 'DONE').length;
    COMPANY_SUB_TABS.forEach(c => {
      counts[`company:${c}`] = deals.filter(d => isAktiv(d) && d.unternehmen === c).length;
    });
    return counts;
  }, [deals]);

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold leading-tight">Kunden</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {deals.length} Kunden {syncing && '· Synchronisiert...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              title="Kartenansicht"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              title="Tabellenansicht"
            >
              <TableIcon className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleNotionSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Sync
          </Button>
          {isAdminOrManager && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-9"><Plus className="h-3.5 w-3.5 mr-1.5" />Neu</Button>
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

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); if (tab.value !== 'aktiv') setActiveSubTab('all'); }}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs ${activeTab === tab.value ? 'text-primary-foreground/70' : 'text-muted-foreground/60'}`}>
              {tabCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}

        {/* Sub-tabs inline for Aktiv */}
        {activeTab === 'aktiv' && (
          <>
            <div className="w-px h-5 bg-border mx-1.5 shrink-0" />
            <button
              onClick={() => setActiveSubTab('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeSubTab === 'all'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              Alle
            </button>
            {COMPANY_SUB_TABS.map(c => (
              <button
                key={c}
                onClick={() => setActiveSubTab(c)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeSubTab === c
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {c}
                {(tabCounts[`company:${c}`] ?? 0) > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground/60">
                    {tabCounts[`company:${c}`]}
                  </span>
                )}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterArt} onValueChange={setFilterArt}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Branche" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Branchen</SelectItem>
            {uniqueBranchen.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        <KundenCardView deals={filtered} onSelect={setSelectedDeal} onDelete={setDeleteTarget} />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[200px]">
                  <button onClick={() => toggleSort('client_name')} className="group flex items-center gap-1.5 hover:text-foreground transition-colors">
                    Kunde <SortIcon col="client_name" />
                  </button>
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[130px]">Branche</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[120px]">
                  <button onClick={() => toggleSort('kundenstatus')} className="group flex items-center gap-1.5 hover:text-foreground transition-colors">
                    Status <SortIcon col="kundenstatus" />
                  </button>
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[70px]">
                  <button onClick={() => toggleSort('ampel')} className="group flex items-center gap-1.5 hover:text-foreground transition-colors">
                    Ampel <SortIcon col="ampel" />
                  </button>
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[110px]">
                  <button onClick={() => toggleSort('gesamt_saldo')} className="group flex items-center gap-1.5 ml-auto hover:text-foreground transition-colors">
                    Saldo <SortIcon col="gesamt_saldo" />
                  </button>
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[100px] hidden md:table-cell">
                  <button onClick={() => toggleSort('ads_budget')} className="group flex items-center gap-1.5 ml-auto hover:text-foreground transition-colors">
                    Ads <SortIcon col="ads_budget" />
                  </button>
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[140px] hidden lg:table-cell">Zeitraum</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[120px] hidden md:table-cell">Zahlung</th>
                <th className="w-10 pb-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16">
                    <EmptyState syncing={syncing} />
                  </td>
                </tr>
              ) : filtered.map(d => {
                const branche0 = Array.isArray(d.branche) ? d.branche[0] : d.art;
                const ks = d.kundenstatus || '–';
                const ampelRaw = d.ampel || d.ampelstatus || '';
                const ampel = AMPEL_MAP[ampelRaw] || { dot: 'bg-muted', label: ampelRaw || '–' };
                const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ') || '–';
                const initials = (d.client_name || '??').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

                return (
                  <tr
                    key={d.id}
                    className="group h-14 border-b border-border/30 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedDeal(d)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelectedDeal(d)}
                    role="button"
                  >
                    <td className="px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                          {initials}
                        </div>
                        <span className="font-semibold text-sm truncate max-w-[180px]">{d.client_name}</span>
                      </div>
                    </td>
                    <td className="px-4">
                      {branche0 ? (
                        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {branche0}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">–</span>}
                    </td>
                    <td className="px-4">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-[4px] ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>
                        {ks}
                      </span>
                    </td>
                    <td className="px-4">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${ampel.dot}`} />
                        <span className="text-xs font-medium">{ampel.label}</span>
                      </span>
                    </td>
                    <td className="text-right px-4 font-bold tabular-nums font-mono text-sm">{fmt(d.gesamt_saldo ?? d.wert_eur)}</td>
                    <td className="text-right px-4 tabular-nums font-mono text-sm text-muted-foreground hidden md:table-cell">{fmt(d.ads_budget)}</td>
                    <td className="text-muted-foreground text-xs px-4 hidden lg:table-cell">{dateRange}</td>
                    <td className="hidden md:table-cell px-4">
                      {d.zahlstatus ? (
                        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded border border-border text-muted-foreground">
                          {d.zahlstatus}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">–</span>}
                    </td>
                    <td className="px-1" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-all">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => setSelectedDeal(d)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(d)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-background rounded-xl border border-border shadow-xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Kunde löschen</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Möchtest du <strong>{deleteTarget.client_name}</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? 'Löscht…' : 'Löschen'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-in panel */}
      {selectedDeal && (
        <KundenSlidePanel
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onDelete={(id) => {
            setSelectedDeal(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ syncing }: { syncing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
        <FileX className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        {syncing ? 'Daten werden importiert...' : 'Keine Kunden gefunden'}
      </p>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        {syncing ? 'Einen Moment bitte.' : 'Passe deine Filter an oder importiere Kunden aus Notion.'}
      </p>
    </div>
  );
}
