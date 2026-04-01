import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Plus, ExternalLink, Calendar, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

type CreativeProject = {
  id: string;
  client_id: string;
  name: string;
  vertical: string;
  status: string;
  assigned_designer: string | null;
  due_date: string | null;
  drive_folder_url: string | null;
  created_at: string;
  notes: string | null;
};

type Client = { id: string; name: string };

const COLUMNS = [
  { status: 'Briefing', icon: '📋', label: 'Briefing' },
  { status: 'In Produktion', icon: '🎨', label: 'In Produktion' },
  { status: 'Interner Review', icon: '🔍', label: 'Interner Review' },
  { status: 'Kunde Review', icon: '👤', label: 'Kunde Review' },
  { status: 'Änderungen nötig', icon: '✏️', label: 'Änderungen nötig' },
  { status: 'Freigegeben', icon: '✅', label: 'Freigegeben' },
  { status: 'Live', icon: '🚀', label: 'Live' },
  { status: 'Archiviert', icon: '📁', label: 'Archiviert' },
];

const VERTICALS = ['PKV', 'BU', 'Rechtsschutz', 'Altersvorsorge', 'Sonstiges'];

const VERTICAL_COLORS: Record<string, string> = {
  PKV: 'bg-blue-500/20 text-blue-300',
  BU: 'bg-purple-500/20 text-purple-300',
  Rechtsschutz: 'bg-emerald-500/20 text-emerald-300',
  Altersvorsorge: 'bg-amber-500/20 text-amber-300',
  Sonstiges: 'bg-muted text-muted-foreground',
};

export default function Creatives() {
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [assetCounts, setAssetCounts] = useState<Record<string, { total: number; approved: number }>>({});
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', client_id: '', vertical: 'Sonstiges' as string, due_date: '', notes: '' });
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetchData = async () => {
      const [projRes, clientRes, assetsRes] = await Promise.all([
        supabase.from('creative_projects').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name'),
        supabase.from('creative_assets').select('id, project_id, status, is_active').eq('is_active', true),
      ]);
      setProjects((projRes.data || []) as unknown as CreativeProject[]);
      setClients(clientRes.data || []);
      const counts: Record<string, { total: number; approved: number }> = {};
      (assetsRes.data || []).forEach((a: any) => {
        if (!counts[a.project_id]) counts[a.project_id] = { total: 0, approved: 0 };
        counts[a.project_id].total++;
        if (a.status === 'Freigegeben') counts[a.project_id].approved++;
      });
      setAssetCounts(counts);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (clientFilter !== 'all' && p.client_id !== clientFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
  }, [projects, clientFilter, statusFilter]);

  const clientMap = useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [clients]);

  const handleCreate = async () => {
    if (!newProject.name || !newProject.client_id) {
      toast({ title: 'Fehler', description: 'Name und Kunde sind Pflichtfelder', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('creative_projects').insert({
      name: newProject.name,
      client_id: newProject.client_id,
      vertical: newProject.vertical as any,
      due_date: newProject.due_date || null,
      notes: newProject.notes || null,
    });
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Erstellt', description: 'Creative Projekt angelegt' });
      setDialogOpen(false);
      setNewProject({ name: '', client_id: '', vertical: 'Sonstiges', due_date: '', notes: '' });
      const res = await supabase.from('creative_projects').select('*').order('created_at', { ascending: false });
      setProjects((res.data || []) as unknown as CreativeProject[]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Creatives werden geladen">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div>
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Creatives</h1>
          <p className="text-muted-foreground text-sm">Ad Creative Review Pipeline</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-[44px]" aria-label="Neues Creative Projekt erstellen">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" /> Neues Creative Projekt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Neues Creative Projekt</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="cp-name">Projektname</Label>
                <Input id="cp-name" value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="cp-client">Kunde</Label>
                <Select value={newProject.client_id} onValueChange={v => setNewProject(p => ({ ...p, client_id: v }))}>
                  <SelectTrigger id="cp-client"><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cp-vertical">Vertical</Label>
                <Select value={newProject.vertical} onValueChange={v => setNewProject(p => ({ ...p, vertical: v }))}>
                  <SelectTrigger id="cp-vertical"><SelectValue /></SelectTrigger>
                  <SelectContent>{VERTICALS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cp-due">Deadline</Label>
                <Input id="cp-due" type="date" value={newProject.due_date} onChange={e => setNewProject(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="cp-notes">Notizen</Label>
                <Textarea id="cp-notes" value={newProject.notes} onChange={e => setNewProject(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <Button onClick={handleCreate} className="w-full min-h-[44px]">Projekt erstellen</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px] min-h-[44px]" aria-label="Kunde filtern"><SelectValue placeholder="Alle Kunden" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kunden</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] min-h-[44px]" aria-label="Status filtern"><SelectValue placeholder="Alle Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {COLUMNS.map(c => <SelectItem key={c.status} value={c.status}>{c.icon} {c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      <ScrollArea className="w-full" aria-label="Creative Pipeline Kanban Board">
        <div className="flex gap-4 pb-4" style={{ minWidth: isMobile ? `${COLUMNS.length * 280}px` : undefined }}>
          {COLUMNS.map(col => {
            const colProjects = filteredProjects.filter(p => p.status === col.status);
            return (
              <div key={col.status} className="flex-shrink-0 w-[260px] xl:w-[280px]">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span aria-hidden="true">{col.icon}</span>
                  <h3 className="text-sm font-semibold uppercase tracking-wide">{col.label}</h3>
                  <Badge variant="secondary" className="text-xs ml-auto">{colProjects.length}</Badge>
                </div>
                <div className="space-y-3 min-h-[100px]">
                  {colProjects.map(project => {
                    const counts = assetCounts[project.id] || { total: 0, approved: 0 };
                    const clientName = clientMap[project.client_id] || 'Unbekannt';
                    const overdue = isOverdue(project.due_date);
                    return (
                      <Card
                        key={project.id}
                        className="cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all"
                        tabIndex={0}
                        role="button"
                        aria-label={`${project.name} - ${clientName}`}
                        onClick={() => navigate(`/creatives/${project.id}`)}
                        onKeyDown={e => { if (e.key === 'Enter') navigate(`/creatives/${project.id}`); }}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {clientName.charAt(0)}
                              </div>
                              <span className="text-xs text-muted-foreground truncate">{clientName}</span>
                            </div>
                            {project.drive_folder_url && (
                              <a
                                href={project.drive_folder_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Google Drive Ordner öffnen"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            )}
                          </div>
                          <p className="font-medium text-sm leading-tight">{project.name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-[10px] ${VERTICAL_COLORS[project.vertical] || VERTICAL_COLORS.Sonstiges}`}>
                              {project.vertical}
                            </Badge>
                            {counts.total > 0 && (
                              <span className="text-[10px] text-muted-foreground">{counts.total} Creatives</span>
                            )}
                          </div>
                          {/* Progress bar */}
                          {counts.total > 0 && (
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden" aria-label={`${counts.approved} von ${counts.total} freigegeben`}>
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${(counts.approved / counts.total) * 100}%` }}
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            {project.due_date && (
                              <span className={`flex items-center gap-1 ${overdue ? 'text-destructive font-semibold' : ''}`}>
                                <Calendar className="h-3 w-3" aria-hidden="true" />
                                {new Date(project.due_date).toLocaleDateString('de-DE')}
                              </span>
                            )}
                            {project.assigned_designer && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" aria-hidden="true" />
                                {project.assigned_designer}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
