import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, Loader2, FolderKanban, FileX, Clock, Users, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import ProjekteSlidePanel from '@/components/projekte/ProjekteSlidePanel';

/* ── Status styles ────────────────────────────────── */
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

const STATUS_HEADER_BG: Record<string, string> = {
  'Noch nicht gestartet': 'bg-destructive/10 border-destructive/20',
  'Onboarding / Planung': 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  'In Bearbeitung': 'bg-warning/10 border-warning/20',
  'Internes Review': 'bg-muted/50 border-border',
  'Client Review': 'bg-muted/50 border-border',
  'Laufzeitbetreuung': 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  'Abgeschlossen': 'bg-success/10 border-success/20',
  'Pausiert': 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
};

const BRANCHE_COLORS: Record<string, string> = {
  'PKV': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'BU': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'Rechtsschutz': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Automotive': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Handwerk': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Immobilien': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Solar': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
};

const STATUS_ORDER = [
  'Noch nicht gestartet', 'Onboarding / Planung', 'In Bearbeitung',
  'Internes Review', 'Client Review', 'Laufzeitbetreuung',
  'Abgeschlossen', 'Pausiert',
];

const VIEW_TABS = [
  { label: 'Nach Kunde', value: 'kunde', icon: Users },
  { label: 'Nach Status', value: 'status', icon: LayoutGrid },
  { label: 'Nach Projektart', value: 'typ', icon: FolderKanban },
];

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

/* ── Helpers ──────────────────────────────────────── */
function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function isNearDeadline(deadline: string | null | undefined) {
  if (!deadline) return false;
  const d = new Date(deadline);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 14;
}

/* ── Project Card ─────────────────────────────────── */
function ProjectCard({
  project: p,
  customerName,
  teamMembers,
  onClick,
}: {
  project: any;
  customerName?: string;
  teamMembers: Record<string, { name: string; avatar_url?: string }>;
  onClick: () => void;
}) {
  const name = p.projektname || p.name || 'Unbenannt';
  const status = p.projektstatus || '–';
  const typArr = Array.isArray(p.typ) ? p.typ : [];
  const brancheArr = Array.isArray(p.branche) ? p.branche : [];
  const firstBranche = brancheArr[0] || null;
  const mitarbeiterIds: string[] = p.verknuepfte_mitarbeiter_ids || [];
  const nearDeadline = isNearDeadline(p.deadline);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-lg p-3.5 hover:shadow-md hover:border-primary/30 transition-all group"
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        <FolderKanban className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <h4 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {name}
        </h4>
      </div>

      {/* Customer name */}
      {customerName && (
        <p className="text-xs text-muted-foreground mt-1.5 truncate pl-5.5">{customerName}</p>
      )}

      {/* Status badge + Branche */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground'}`}>
          {status}
        </span>
        {firstBranche && (
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] ${BRANCHE_COLORS[firstBranche] || 'bg-muted text-muted-foreground'}`}>
            {firstBranche}
          </span>
        )}
        {nearDeadline && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] bg-destructive/15 text-destructive">
            <Clock className="h-2.5 w-2.5" />Deadline
          </span>
        )}
      </div>

      {/* Typ tags */}
      {typArr.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {typArr.slice(0, 2).map((t: string) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/8 text-primary/80 font-medium">{t}</span>
          ))}
          {typArr.length > 2 && <span className="text-[10px] text-muted-foreground">+{typArr.length - 2}</span>}
        </div>
      )}

      {/* Bottom row: date + team avatars */}
      <div className="flex items-center justify-between mt-2.5">
        {p.startdatum ? (
          <span className="text-[10px] text-muted-foreground">{fmtDate(p.startdatum)}</span>
        ) : <span />}

        {mitarbeiterIds.length > 0 && (
          <div className="flex -space-x-1.5">
            {mitarbeiterIds.slice(0, 3).map((nid: string) => {
              const member = teamMembers[nid];
              const initials = member ? getInitials(member.name) : '??';
              return member?.avatar_url ? (
                <img key={nid} src={member.avatar_url} alt={member.name}
                  className="h-5 w-5 rounded-full border-2 border-card object-cover"
                  title={member.name} />
              ) : (
                <div key={nid} className="h-5 w-5 rounded-full border-2 border-card bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold"
                  title={member?.name || nid}>
                  {initials}
                </div>
              );
            })}
            {mitarbeiterIds.length > 3 && (
              <div className="h-5 w-5 rounded-full border-2 border-card bg-muted text-muted-foreground flex items-center justify-center text-[8px] font-bold">
                +{mitarbeiterIds.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

/* ── Kanban Column ────────────────────────────────── */
function KanbanColumn({
  title,
  count,
  headerClass,
  projects,
  customerNames,
  teamMembers,
  onSelect,
}: {
  title: string;
  count: number;
  headerClass?: string;
  projects: any[];
  customerNames: Record<string, string>;
  teamMembers: Record<string, { name: string; avatar_url?: string }>;
  onSelect: (p: any) => void;
}) {
  return (
    <div className="min-w-[280px] max-w-[320px] flex-shrink-0 flex flex-col">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border ${headerClass || 'bg-muted/30 border-border'}`}>
        <h3 className="text-xs font-semibold truncate">{title}</h3>
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-md">{count}</Badge>
      </div>
      <div className="flex-1 bg-muted/10 border-x border-b border-border rounded-b-lg p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Keine Projekte</p>
        ) : projects.map(p => {
          // resolve first customer name for this project
          const kundenIds: string[] = p.verknuepfte_kunden_ids || [];
          const custName = kundenIds.map(id => customerNames[id]).filter(Boolean)[0] || undefined;
          return (
            <ProjectCard
              key={p.id}
              project={p}
              customerName={custName}
              teamMembers={teamMembers}
              onClick={() => onSelect(p)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────── */
export default function Projekte() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kunde' | 'status' | 'typ'>('status');
  const [deadlineFilter, setDeadlineFilter] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [teamMembers, setTeamMembers] = useState<Record<string, { name: string; avatar_url?: string }>>({});
  const autoSyncDone = useRef(false);
  const autoOpenDone = useRef(false);

  /* ── Data fetching ── */
  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
    return data || [];
  }, []);

  const fetchRelations = useCallback(async () => {
    // Fetch close_deals for customer name lookup by notion_id
    const { data: deals } = await supabase.from('close_deals').select('id, client_name, notion_id');
    const nameMap: Record<string, string> = {};
    (deals || []).forEach((d: any) => { if (d.notion_id) nameMap[d.notion_id] = d.client_name; });
    setCustomerNames(nameMap);

    // Fetch team members for avatar lookup by notion_id
    const { data: team } = await supabase.from('team').select('id, name, avatar_url, notion_id');
    const tMap: Record<string, { name: string; avatar_url?: string }> = {};
    (team || []).forEach((t: any) => { if (t.notion_id) tMap[t.notion_id] = { name: t.name, avatar_url: t.avatar_url }; });
    setTeamMembers(tMap);
  }, []);

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
    fetchRelations();
    fetchData().then((data) => {
      if (data.length === 0 && !autoSyncDone.current) {
        autoSyncDone.current = true;
        handleSync();
      }
      const projektId = searchParams.get('projekt');
      if (projektId && !autoOpenDone.current) {
        autoOpenDone.current = true;
        const match = data.find((p: any) => p.id === projektId);
        if (match) {
          setSelectedProject(match);
          setSearchParams({}, { replace: true });
        }
      }
    });
  }, []);

  /* ── Filtering ── */
  const filtered = useMemo(() => projects.filter(p => {
    const matchSearch = (p.projektname || p.name || '').toLowerCase().includes(search.toLowerCase());
    const matchDeadline = !deadlineFilter || isNearDeadline(p.deadline);
    return matchSearch && matchDeadline;
  }), [projects, search, deadlineFilter]);

  /* ── Grouping ── */
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};

    if (viewMode === 'status') {
      STATUS_ORDER.forEach(s => { groups[s] = []; });
      filtered.forEach(p => {
        const s = p.projektstatus || 'Noch nicht gestartet';
        if (!groups[s]) groups[s] = [];
        groups[s].push(p);
      });
    } else if (viewMode === 'kunde') {
      filtered.forEach(p => {
        const kundenIds: string[] = p.verknuepfte_kunden_ids || [];
        if (kundenIds.length === 0) {
          const key = 'Ohne Kunde';
          if (!groups[key]) groups[key] = [];
          groups[key].push(p);
        } else {
          kundenIds.forEach(nid => {
            const name = customerNames[nid] || nid;
            if (!groups[name]) groups[name] = [];
            groups[name].push(p);
          });
        }
      });
    } else {
      // By typ
      filtered.forEach(p => {
        const typArr = Array.isArray(p.typ) ? p.typ : [];
        const key = typArr[0] || 'Ohne Typ';
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
    }

    return groups;
  }, [filtered, viewMode, customerNames]);

  const sortedGroupKeys = useMemo(() => {
    if (viewMode === 'status') return STATUS_ORDER.filter(s => grouped[s]?.length > 0 || true);
    return Object.keys(grouped).sort((a, b) => {
      if (a === 'Ohne Kunde' || a === 'Ohne Typ') return 1;
      if (b === 'Ohne Kunde' || b === 'Ohne Typ') return -1;
      return (grouped[b]?.length || 0) - (grouped[a]?.length || 0);
    });
  }, [grouped, viewMode]);

  const deadlineCount = useMemo(() => projects.filter(p => isNearDeadline(p.deadline)).length, [projects]);

  /* ── Render ──────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-64" /><Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-5 h-full flex flex-col">
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

      {/* View mode tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {VIEW_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setViewMode(tab.value as any)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                viewMode === tab.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search + deadline filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Projektname suchen..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button
          variant={deadlineFilter ? 'default' : 'outline'}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setDeadlineFilter(f => !f)}
        >
          <Clock className="h-3.5 w-3.5" />
          Kurz vor Deadline
          {deadlineCount > 0 && (
            <Badge variant={deadlineFilter ? 'secondary' : 'destructive'} className="text-[10px] h-4 px-1 rounded-md ml-0.5">
              {deadlineCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-3 min-h-[400px]">
          {sortedGroupKeys.map(key => (
            <KanbanColumn
              key={key}
              title={key}
              count={grouped[key]?.length || 0}
              headerClass={viewMode === 'status' ? STATUS_HEADER_BG[key] : undefined}
              projects={grouped[key] || []}
              customerNames={customerNames}
              teamMembers={teamMembers}
              onSelect={p => setSelectedProject(p)}
            />
          ))}
          {sortedGroupKeys.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <FileX className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">Keine Projekte gefunden</p>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Passe deine Filter an oder importiere Projekte aus Notion.
              </p>
            </div>
          )}
        </div>
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
