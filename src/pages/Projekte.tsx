import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, Loader2, FolderKanban, FileX, Clock, Users, LayoutGrid, BarChart3, Plus, User } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer, LabelList } from 'recharts';
import ProjekteSlidePanel from '@/components/projekte/ProjekteSlidePanel';
import NewProjectPanel from '@/components/projekte/NewProjectPanel';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

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
  { label: 'Meine Projekte', value: 'meine', icon: User },
  { label: 'Nach Kunde', value: 'kunde', icon: Users },
  { label: 'Nach Status', value: 'status', icon: LayoutGrid },
  { label: 'Nach Projektart', value: 'typ', icon: FolderKanban },
  { label: 'Nach Mitarbeiter', value: 'mitarbeiter', icon: Users },
  { label: 'KPI Tracking', value: 'kpi', icon: BarChart3 },
];

const KPI_BAR_COLORS = [
  'hsl(173, 58%, 39%)', 'hsl(142, 53%, 45%)', 'hsl(0, 72%, 51%)', 'hsl(45, 93%, 47%)',
  'hsl(270, 50%, 55%)', 'hsl(25, 95%, 53%)', 'hsl(213, 72%, 50%)', 'hsl(330, 65%, 55%)', 'hsl(220, 9%, 55%)',
];

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

function getInitials(name?: string | null) {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function isNearDeadline(deadline: string | null | undefined) {
  if (!deadline) return false;
  const d = new Date(deadline);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 14;
}

/* ── Draggable Project Card ───────────────────────── */
function DraggableProjectCard({
  project: p,
  customerName,
  onClick,
  isDragDisabled,
}: {
  project: any;
  customerName?: string;
  onClick: () => void;
  isDragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: p.id,
    disabled: isDragDisabled,
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    scale: isDragging ? '1.02' : undefined,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ProjectCardContent
        project={p}
        customerName={customerName}
        onClick={onClick}
        isDragging={isDragging}
      />
    </div>
  );
}

/* ── Pure card content (shared by draggable + overlay) ── */
function ProjectCardContent({
  project: p,
  customerName,
  onClick,
  isDragging,
}: {
  project: any;
  customerName?: string;
  onClick?: () => void;
  isDragging?: boolean;
}) {
  const name = p.projektname || p.name || 'Unbenannt';
  const status = p.projektstatus || '–';
  const typArr = Array.isArray(p.typ) ? p.typ : [];
  const brancheArr = Array.isArray(p.branche) ? p.branche : [];
  const firstBranche = brancheArr[0] || null;
  const members: { id: string; name: string; avatar_url?: string }[] = Array.isArray(p.mitarbeiter) ? p.mitarbeiter : [];
  const nearDeadline = isNearDeadline(p.deadline);

  return (
    <div
      onClick={e => { if (!isDragging && onClick) { e.stopPropagation(); onClick(); } }}
      className={`w-full text-left bg-card border border-border rounded-lg p-3.5 transition-all group cursor-grab active:cursor-grabbing
        ${isDragging ? 'shadow-xl ring-2 ring-primary/30' : 'hover:shadow-md hover:border-primary/30'}`}
    >
      <div className="flex items-start gap-2">
        <FolderKanban className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <h4 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{name}</h4>
      </div>

      {customerName && (
        <p className="text-xs text-muted-foreground mt-1.5 truncate pl-[22px]">{customerName}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground'}`}>{status}</span>
        {firstBranche && (
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] ${BRANCHE_COLORS[firstBranche] || 'bg-muted text-muted-foreground'}`}>{firstBranche}</span>
        )}
        {nearDeadline && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] bg-destructive/15 text-destructive">
            <Clock className="h-2.5 w-2.5" />Deadline
          </span>
        )}
      </div>

      {typArr.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {typArr.slice(0, 2).map((t: string) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/8 text-primary/80 font-medium">{t}</span>
          ))}
          {typArr.length > 2 && <span className="text-[10px] text-muted-foreground">+{typArr.length - 2}</span>}
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5">
        {p.startdatum ? <span className="text-[10px] text-muted-foreground">{fmtDate(p.startdatum)}</span> : <span />}
        {members.length > 0 && (
          <div className="flex -space-x-1.5">
            {members.slice(0, 3).map((m) => {
              const initials = getInitials(m.name);
              return m.avatar_url ? (
                <img key={m.id} src={m.avatar_url} alt={m.name} className="h-5 w-5 rounded-full border-2 border-card object-cover" title={m.name} />
              ) : (
                <div key={m.id} className="h-5 w-5 rounded-full border-2 border-card bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold" title={m.name}>{initials}</div>
              );
            })}
            {members.length > 3 && (
              <div className="h-5 w-5 rounded-full border-2 border-card bg-muted text-muted-foreground flex items-center justify-center text-[8px] font-bold">+{members.length - 3}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Droppable Kanban Column ──────────────────────── */
function DroppableKanbanColumn({
  columnId,
  title,
  count,
  headerClass,
  headerIcon,
  projects,
  customerNames,
  onSelect,
  isOverColumn,
  isDragDisabled,
}: {
  columnId: string;
  title: string;
  count: number;
  headerClass?: string;
  headerIcon?: React.ReactNode;
  projects: any[];
  customerNames: Record<string, string>;
  onSelect: (p: any) => void;
  isOverColumn: boolean;
  isDragDisabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const highlighted = isOver || isOverColumn;

  return (
    <div className="min-w-[280px] max-w-[320px] flex-shrink-0 flex flex-col" ref={setNodeRef}>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border transition-colors ${headerClass || 'bg-muted/30 border-border'}`}>
        {headerIcon}
        <h3 className="text-xs font-semibold truncate">{title}</h3>
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-md">{count}</Badge>
      </div>
      <div className={`flex-1 border-x border-b rounded-b-lg p-2 space-y-2 overflow-y-auto scrollbar-none max-h-[calc(100vh-260px)] transition-all duration-200
        ${highlighted ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/30' : 'bg-muted/10 border-border'}`}>
        {projects.length === 0 ? (
          <p className={`text-xs text-center py-6 transition-colors ${highlighted ? 'text-primary/60' : 'text-muted-foreground'}`}>
            {highlighted ? 'Hier ablegen' : 'Keine Projekte'}
          </p>
        ) : projects.map(p => {
          const kundenIds: string[] = p.verknuepfte_kunden_ids || [];
          const custName = kundenIds.map(id => customerNames[id]).filter(Boolean)[0] || undefined;
          return (
            <DraggableProjectCard
              key={p.id}
              project={p}
              customerName={custName}
              onClick={() => onSelect(p)}
              isDragDisabled={isDragDisabled}
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
  const [viewMode, setViewMode] = useState<'meine' | 'kunde' | 'status' | 'typ' | 'mitarbeiter' | 'kpi'>('status');
  const [deadlineFilter, setDeadlineFilter] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const autoSyncDone = useRef(false);
  const autoOpenDone = useRef(false);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const isDragEnabled = viewMode === 'status' || viewMode === 'typ' || viewMode === 'mitarbeiter';

  /* ── KPI chart data ── */
  const kpiChartData = useMemo(() => {
    const typCounts: Record<string, number> = {};
    projects.forEach(p => {
      const typ = (Array.isArray(p.typ) ? p.typ[0] : null) || 'Kein Typ';
      typCounts[typ] = (typCounts[typ] || 0) + 1;
    });
    return Object.entries(typCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count as number) - (a.count as number));
  }, [projects]);

  /* ── Data fetching ── */
  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
    return data || [];
  }, []);

  const fetchRelations = useCallback(async () => {
    const { data: deals } = await supabase.from('close_deals').select('id, client_name, notion_id');
    const nameMap: Record<string, string> = {};
    (deals || []).forEach((d: any) => { if (d.notion_id) nameMap[d.notion_id] = d.client_name; });
    setCustomerNames(nameMap);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Notion-Import läuft...');
    try {
      const { data, error } = await supabase.functions.invoke('sync-notion', { body: { target: 'projekte' } });
      if (error) throw error;
      toast.success(`${data?.synced?.projekte || 0} Projekte importiert`, { id: toastId });
      await fetchData();
    } catch (err: any) {
      toast.error('Import fehlgeschlagen', { id: toastId, description: err.message });
    } finally { setSyncing(false); }
  };

  useEffect(() => {
    fetchRelations();
    fetchData().then((data) => {
      if (data.length === 0 && !autoSyncDone.current) { autoSyncDone.current = true; handleSync(); }
      const projektId = searchParams.get('projekt');
      if (projektId && !autoOpenDone.current) {
        autoOpenDone.current = true;
        const match = data.find((p: any) => p.id === projektId);
        if (match) { setSelectedProject(match); setSearchParams({}, { replace: true }); }
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
          if (!groups['Ohne Kunde']) groups['Ohne Kunde'] = [];
          groups['Ohne Kunde'].push(p);
        } else {
          kundenIds.forEach(nid => {
            const name = customerNames[nid] || nid;
            if (!groups[name]) groups[name] = [];
            groups[name].push(p);
          });
        }
      });
    } else if (viewMode === 'mitarbeiter') {
      filtered.forEach(p => {
        const members: any[] = Array.isArray(p.mitarbeiter) ? p.mitarbeiter : [];
        if (members.length === 0) {
          if (!groups['Nicht zugewiesen']) groups['Nicht zugewiesen'] = [];
          groups['Nicht zugewiesen'].push(p);
        } else {
          members.forEach(member => {
            const key = member.name || member.id || 'Nicht zugewiesen';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
          });
        }
      });
    } else {
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
    if (viewMode === 'status') return STATUS_ORDER;
    return Object.keys(grouped).sort((a, b) => {
      if (a === 'Ohne Kunde' || a === 'Ohne Typ' || a === 'Nicht zugewiesen') return 1;
      if (b === 'Ohne Kunde' || b === 'Ohne Typ' || b === 'Nicht zugewiesen') return -1;
      return (grouped[b]?.length || 0) - (grouped[a]?.length || 0);
    });
  }, [grouped, viewMode]);

  const deadlineCount = useMemo(() => projects.filter(p => isNearDeadline(p.deadline)).length, [projects]);

  /* ── DnD Handlers ──────────────────────────────── */
  const activeProject = useMemo(() => {
    if (!activeId) return null;
    return projects.find(p => p.id === activeId) || null;
  }, [activeId, projects]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverColumnId(event.over?.id as string | null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);

    if (!over || !isDragEnabled) return;

    const projectId = active.id as string;
    const targetColumn = over.id as string;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (viewMode === 'status') {
      const oldStatus = project.projektstatus || 'Noch nicht gestartet';
      if (oldStatus === targetColumn) return;

      // Optimistic update
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, projektstatus: targetColumn } : p
      ));

      const { error } = await supabase.from('projects').update({ projektstatus: targetColumn } as any).eq('id', projectId);
      if (error) {
        // Revert
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, projektstatus: oldStatus } : p
        ));
        toast.error('Fehler beim Aktualisieren', { description: error.message });
      } else {
        toast.success(`Projektstatus aktualisiert → ${targetColumn}`);
      }
    } else if (viewMode === 'typ') {
      const oldTyp = Array.isArray(project.typ) ? [...project.typ] : [];
      const oldFirst = oldTyp[0] || 'Ohne Typ';
      if (oldFirst === targetColumn && targetColumn !== 'Ohne Typ') return;

      const newTyp = targetColumn === 'Ohne Typ' ? [] : [targetColumn, ...oldTyp.slice(1)];

      // Optimistic update
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, typ: newTyp } : p
      ));

      const { error } = await supabase.from('projects').update({ typ: newTyp } as any).eq('id', projectId);
      if (error) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, typ: oldTyp } : p
        ));
        toast.error('Fehler beim Aktualisieren', { description: error.message });
      } else {
        toast.success(`Projektart aktualisiert → ${targetColumn}`);
      }
    } else if (viewMode === 'mitarbeiter') {
      const oldMitarbeiter: any[] = Array.isArray(project.mitarbeiter) ? [...project.mitarbeiter] : [];

      if (targetColumn === 'Nicht zugewiesen') {
        // Only allow dropping to "Nicht zugewiesen" if already unassigned
        if (oldMitarbeiter.length === 0) return;
        const newMitarbeiter: any[] = [];

        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, mitarbeiter: newMitarbeiter } : p
        ));

        const { error } = await supabase.from('projects').update({ mitarbeiter: newMitarbeiter } as any).eq('id', projectId);
        if (error) {
          setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, mitarbeiter: oldMitarbeiter } : p
          ));
          toast.error('Fehler beim Aktualisieren', { description: error.message });
        } else {
          toast.success('Alle Mitarbeiter entfernt');
        }
      } else {
        // Check if already assigned to this member
        const alreadyAssigned = oldMitarbeiter.some((m: any) => m.name === targetColumn);
        if (alreadyAssigned) return;

        // Find the member info from existing data
        const targetMember = projects.flatMap((p: any) => Array.isArray(p.mitarbeiter) ? p.mitarbeiter : []).find((m: any) => m.name === targetColumn);
        const newMember = targetMember || { id: targetColumn, name: targetColumn };
        const newMitarbeiter = [...oldMitarbeiter, newMember];

        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, mitarbeiter: newMitarbeiter } : p
        ));

        const { error } = await supabase.from('projects').update({ mitarbeiter: newMitarbeiter } as any).eq('id', projectId);
        if (error) {
          setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, mitarbeiter: oldMitarbeiter } : p
          ));
          toast.error('Fehler beim Aktualisieren', { description: error.message });
        } else {
          toast.success(`${targetColumn} hinzugefügt`);
        }
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverColumnId(null);
  };

  /* ── Render ──────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-64" /><Skeleton className="h-96" />
      </div>
    );
  }

  // Resolve active project customer name for overlay
  const activeCustomerName = activeProject
    ? (activeProject.verknuepfte_kunden_ids || []).map((id: string) => customerNames[id]).filter(Boolean)[0] || undefined
    : undefined;

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Importieren
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowNewPanel(true)}>
            <Plus className="h-3.5 w-3.5" />
            Neues Projekt
          </Button>
        </div>
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

      {/* Search + deadline filter (hidden on KPI tab) */}
      {viewMode !== 'kpi' && viewMode !== 'meine' && (
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
      )}

      {/* KPI Tracking view */}
      {viewMode === 'kpi' && (
        <div className="flex-1 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-heading font-bold">KPI Tracking</h2>
            <span className="text-xs text-muted-foreground ml-1">Projekte nach Projektart</span>
          </div>
          {kpiChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Keine Daten vorhanden</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(360, kpiChartData.length * 22 + 80)}>
              <BarChart data={kpiChartData} margin={{ top: 20, right: 20, left: 10, bottom: kpiChartData.some(d => d.name.length > 12) ? 80 : 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v}
                  height={80}
                />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }} />
                  {kpiChartData.map((_, i) => (
                    <Cell key={i} fill={KPI_BAR_COLORS[i % KPI_BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Meine Projekte — empty placeholder */}
      {viewMode === 'meine' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <User className="h-10 w-10 opacity-30" />
          <p className="text-sm">Noch keine Projekte zugeordnet</p>
        </div>
      )}

      {/* Kanban board with DnD */}
      {viewMode !== 'kpi' && viewMode !== 'meine' && (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 overflow-x-auto scrollbar-none pb-4">
          <div className="flex gap-3 min-h-[400px]">
            {sortedGroupKeys.map(key => {
              const mitarbeiterIcon = viewMode === 'mitarbeiter' && key !== 'Nicht zugewiesen' ? (
                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">{getInitials(key)}</div>
              ) : undefined;
              return (
              <DroppableKanbanColumn
                key={key}
                columnId={key}
                title={key}
                count={grouped[key]?.length || 0}
                headerClass={viewMode === 'status' ? STATUS_HEADER_BG[key] : undefined}
                headerIcon={mitarbeiterIcon}
                projects={grouped[key] || []}
                customerNames={customerNames}
                onSelect={p => setSelectedProject(p)}
                isOverColumn={overColumnId === key}
                isDragDisabled={!isDragEnabled}
              />
              );
            })}
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

        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
          {activeProject ? (
            <div className="w-[280px] opacity-90 scale-[1.02] rotate-[1deg]">
              <ProjectCardContent
                project={activeProject}
                customerName={activeCustomerName}
                
                isDragging
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {/* Slide-in panel */}
      {selectedProject && (
        <ProjekteSlidePanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}

      {/* New project panel */}
      {showNewPanel && (
        <NewProjectPanel
          onClose={() => setShowNewPanel(false)}
          onCreated={() => fetchData()}
        />
      )}
    </div>
  );
}
