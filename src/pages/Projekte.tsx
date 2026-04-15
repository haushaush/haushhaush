import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, Loader2, FolderKanban, FileX } from 'lucide-react';
import { toast } from 'sonner';
import ProjekteSlidePanel from '@/components/projekte/ProjekteSlidePanel';

const STATUS_STYLES: Record<string, string> = {
  'Noch nicht gestartet': 'bg-destructive/20 text-destructive',
  'Onboarding / Planung': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'In Bearbeitung': 'bg-warning/20 text-warning',
  'Internes Review': 'bg-muted text-muted-foreground',
  'Client Review': 'bg-muted text-muted-foreground',
  'Laufzeitbetreuung': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Abgeschlossen': 'bg-success/20 text-success',
  'Pausiert': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

const TABS = [
  { label: 'Alle', value: 'all' },
  { label: 'In Bearbeitung', value: 'In Bearbeitung' },
  { label: 'Onboarding / Planung', value: 'Onboarding / Planung' },
  { label: 'Laufzeitbetreuung', value: 'Laufzeitbetreuung' },
  { label: 'Abgeschlossen', value: 'Abgeschlossen' },
  { label: 'Pausiert', value: 'Pausiert' },
];

export default function Projekte() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const autoSyncDone = useRef(false);

  const fetchData = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
    return data || [];
  };

  const handleSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Notion-Import läuft...');
    try {
      const { data, error } = await supabase.functions.invoke('sync-notion', {
        body: { target: 'projekte' },
      });
      if (error) throw error;
      toast.success(`${data?.synced?.projekte || 0} Projekte importiert`, { id: toastId });
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
        handleSync();
      }
    });
  }, []);

  const filtered = useMemo(() => projects.filter(p => {
    const matchSearch = (p.projektname || p.name || '').toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === 'all' || p.projektstatus === activeTab;
    return matchSearch && matchTab;
  }), [projects, search, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: projects.length };
    TABS.forEach(t => {
      if (t.value !== 'all') counts[t.value] = projects.filter(p => p.projektstatus === t.value).length;
    });
    return counts;
  }, [projects]);

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
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold leading-tight">Projekte</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projects.length} Projekte {syncing && '· Synchronisiert...'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Importieren
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
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
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-9" placeholder="Projektname suchen..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-2">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr>
              <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[200px]">Projekt</th>
              <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[130px]">Status</th>
              <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[130px]">Typ</th>
              <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[100px]">Laufzeit</th>
              <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[140px] hidden lg:table-cell">Zeitraum</th>
              <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[100px] hidden md:table-cell">Zahlstatus</th>
              <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-3 px-4 min-w-[110px]">Cash Collect</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                      <FileX className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">
                      {syncing ? 'Projekte werden importiert...' : 'Keine Projekte gefunden'}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-[240px]">
                      {syncing ? 'Einen Moment bitte.' : 'Passe deine Filter an oder importiere Projekte aus Notion.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : filtered.map(p => {
              const name = p.projektname || p.name || 'Unbenannt';
              const status = p.projektstatus || '–';
              const typArr = Array.isArray(p.typ) ? p.typ : [];
              const dateRange = [fmtDate(p.startdatum), fmtDate(p.enddatum)].filter(Boolean).join(' – ') || '–';
              const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

              return (
                <tr
                  key={p.id}
                  className="h-14 border-b border-border/30 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedProject(p)}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedProject(p)}
                  role="button"
                >
                  <td className="px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                        {initials}
                      </div>
                      <span className="font-semibold text-sm truncate max-w-[200px]">{name}</span>
                    </div>
                  </td>
                  <td className="px-4">
                    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-[4px] ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground'}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4">
                    {typArr.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {typArr.slice(0, 2).map((t: string) => (
                          <span key={t} className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {t}
                          </span>
                        ))}
                        {typArr.length > 2 && <span className="text-[10px] text-muted-foreground">+{typArr.length - 2}</span>}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">–</span>}
                  </td>
                  <td className="px-4 text-sm text-muted-foreground">{p.laufzeit || '–'}</td>
                  <td className="text-muted-foreground text-xs px-4 hidden lg:table-cell">{dateRange}</td>
                  <td className="hidden md:table-cell px-4">
                    {p.zahlstatus ? (
                      <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded border border-border text-muted-foreground">
                        {p.zahlstatus}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">–</span>}
                  </td>
                  <td className="text-right px-4 font-bold tabular-nums font-mono text-sm">{fmt(p.cash_collect)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Slide-in panel */}
      {selectedProject && (
        <ProjekteSlidePanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </div>
  );
}
