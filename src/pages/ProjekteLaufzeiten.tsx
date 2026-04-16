import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, AlertTriangle, CheckCircle2, Filter } from 'lucide-react';
import ProjekteSlidePanel from '@/components/projekte/ProjekteSlidePanel';

const LAUFZEIT_MONTHS: Record<string, number> = {
  '1 Monat': 1, '2 Monate': 2, '3 Monate': 3,
  '4 Monate': 4, '5 Monate': 5, '6 Monate': 6,
  '12 Monate': 12,
};

const LAUFZEIT_OPTIONS = Object.keys(LAUFZEIT_MONTHS);

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

const getLaufzeitEnd = (startDatum: string, laufzeit: string): Date | null => {
  const months = LAUFZEIT_MONTHS[laufzeit];
  if (!months || !startDatum) return null;
  const date = new Date(startDatum);
  date.setMonth(date.getMonth() + months);
  return date;
};

const isAbgelaufen = (endDate: Date) => endDate < new Date();

const daysRemaining = (endDate: Date) => Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const fmtDate = (d: string | Date | null) => {
  if (!d) return '–';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return '–'; }
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function getProgress(startDatum: string, endDate: Date): number {
  const start = new Date(startDatum).getTime();
  const end = endDate.getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (end - start)) * 100);
}

type ProjectWithEnd = {
  project: any;
  endDate: Date;
  expired: boolean;
  days: number;
  progress: number;
  customerName: string;
};

export default function ProjekteLaufzeiten() {
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLaufzeit, setFilterLaufzeit] = useState('');
  const [filterMitarbeiter, setFilterMitarbeiter] = useState('');
  const [selectedProject, setSelectedProject] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('close_deals').select('id, client_name'),
      ]);
      setProjects(p || []);
      const map: Record<string, string> = {};
      (d || []).forEach(deal => { map[deal.id] = deal.client_name; });
      setCustomers(map);
      setLoading(false);
    })();
  }, []);

  // Collect all unique mitarbeiter names
  const allMitarbeiter = useMemo(() => {
    const names = new Set<string>();
    projects.forEach(p => {
      const members = Array.isArray(p.mitarbeiter) ? p.mitarbeiter : [];
      members.forEach((m: any) => m.name && names.add(m.name));
    });
    return Array.from(names).sort();
  }, [projects]);

  const processed: ProjectWithEnd[] = useMemo(() => {
    return projects
      .filter(p => {
        const lz = p.laufzeit;
        if (!lz || lz === 'Einmalig' || lz === 'Unbegrenzt') return false;
        if (p.projektstatus === 'Abgeschlossen') return false;
        if (!p.startdatum) return false;
        return !!LAUFZEIT_MONTHS[lz];
      })
      .map(p => {
        const endDate = getLaufzeitEnd(p.startdatum, p.laufzeit)!;
        const expired = isAbgelaufen(endDate);
        const days = daysRemaining(endDate);
        const progress = getProgress(p.startdatum, endDate);
        const customerName = p.client_id ? (customers[p.client_id] || '–') : '–';
        return { project: p, endDate, expired, days, progress, customerName };
      })
      .filter(item => {
        const q = search.toLowerCase();
        if (q) {
          const name = (item.project.projektname || item.project.name || '').toLowerCase();
          if (!name.includes(q) && !item.customerName.toLowerCase().includes(q)) return false;
        }
        if (filterLaufzeit && item.project.laufzeit !== filterLaufzeit) return false;
        if (filterMitarbeiter) {
          const members = Array.isArray(item.project.mitarbeiter) ? item.project.mitarbeiter : [];
          if (!members.some((m: any) => m.name === filterMitarbeiter)) return false;
        }
        return true;
      });
  }, [projects, customers, search, filterLaufzeit, filterMitarbeiter]);

  const abgelaufen = useMemo(() =>
    processed.filter(i => i.expired).sort((a, b) => a.days - b.days), // most overdue first (most negative)
  [processed]);

  const aktiv = useMemo(() =>
    processed.filter(i => !i.expired).sort((a, b) => a.days - b.days), // soonest expiring first
  [processed]);

  const handleRefresh = async () => {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*');
    setProjects(data || []);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Laufzeit Projekte</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {processed.length} Projekte mit Laufzeit · {abgelaufen.length} abgelaufen · {aktiv.length} aktiv
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Projekt oder Kunde suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterLaufzeit}
          onChange={e => setFilterLaufzeit(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Alle Laufzeiten</option>
          {LAUFZEIT_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          value={filterMitarbeiter}
          onChange={e => setFilterMitarbeiter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Alle Mitarbeiter</option>
          {allMitarbeiter.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : (
        <>
          {/* Abgelaufen */}
          {abgelaufen.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                <h2 className="text-lg font-semibold text-destructive">Abgelaufen</h2>
                <Badge variant="destructive" className="text-xs">{abgelaufen.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {abgelaufen.map(item => (
                  <LaufzeitCard key={item.project.id} item={item} onClick={() => setSelectedProject(item.project)} />
                ))}
              </div>
            </section>
          )}

          {/* Aktiv */}
          {aktiv.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4.5 w-4.5 text-success" />
                <h2 className="text-lg font-semibold text-success">Aktiv</h2>
                <Badge className="bg-success/20 text-success border-0 text-xs">{aktiv.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {aktiv.map(item => (
                  <LaufzeitCard key={item.project.id} item={item} onClick={() => setSelectedProject(item.project)} />
                ))}
              </div>
            </section>
          )}

          {processed.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Keine Projekte mit Laufzeit gefunden</p>
            </div>
          )}
        </>
      )}

      {/* Slide panel */}
      {selectedProject && (
        <ProjekteSlidePanel
          project={selectedProject}
          onClose={() => { setSelectedProject(null); handleRefresh(); }}
        />
      )}
    </div>
  );
}

/* ── Card Component ── */
function LaufzeitCard({ item, onClick }: { item: ProjectWithEnd; onClick: () => void }) {
  const { project: p, endDate, expired, days, progress, customerName } = item;
  const name = p.projektname || p.name || 'Unbenannt';
  const status = p.projektstatus || '–';
  const members: { id: string; name: string; avatar_url?: string }[] = Array.isArray(p.mitarbeiter) ? p.mitarbeiter : [];

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
        expired
          ? 'bg-destructive/5 border-destructive/20 hover:border-destructive/40'
          : 'bg-success/5 border-success/20 hover:border-success/40'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{customerName}</p>
        </div>
        <Badge className={`text-[10px] shrink-0 ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground'}`}>
          {status}
        </Badge>
      </div>

      {/* Dates + Laufzeit */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{fmtDate(p.startdatum)} → {fmtDate(endDate)}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{p.laufzeit}</Badge>
      </div>

      {/* Progress */}
      <div className="mb-2">
        <Progress value={progress} className={`h-1.5 ${expired ? '[&>div]:bg-destructive' : '[&>div]:bg-success'}`} />
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${expired ? 'text-destructive' : 'text-success'}`}>
          {expired ? `Abgelaufen seit ${Math.abs(days)} Tagen` : `Noch ${days} Tage`}
        </span>

        {/* Mitarbeiter avatars */}
        {members.length > 0 && (
          <div className="flex -space-x-1.5">
            {members.slice(0, 3).map(m => (
              m.avatar_url ? (
                <img key={m.id} src={m.avatar_url} className="h-5 w-5 rounded-full border border-background object-cover" alt={m.name} />
              ) : (
                <div key={m.id} className="h-5 w-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[8px] font-bold border border-background">
                  {getInitials(m.name)}
                </div>
              )
            ))}
            {members.length > 3 && (
              <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[8px] font-bold border border-background">
                +{members.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
