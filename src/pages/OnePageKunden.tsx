import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Globe, ExternalLink, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OnePageProject {
  id: string;
  name: string;
  page_url: string | null;
  status: 'active' | 'paused' | 'archived' | string;
  created_at: string;
  updated_at: string;
}

interface LeadStat {
  project_id: string;
  total: number;
  last7: number;
  last30: number;
  last_received: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  paused: 'Pausiert',
  archived: 'Archiviert',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  paused: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

function relativeTime(iso: string | null) {
  if (!iso) return 'Noch keine Leads';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `vor ${d} T.`;
  if (d < 30) return `vor ${Math.floor(d / 7)} W.`;
  return `vor ${Math.floor(d / 30)} M.`;
}

function activityColor(lastIso: string | null): string {
  if (!lastIso) return 'bg-muted-foreground/40';
  const hours = (Date.now() - new Date(lastIso).getTime()) / 3_600_000;
  if (hours < 24) return 'bg-emerald-500';
  if (hours < 24 * 7) return 'bg-amber-500';
  return 'bg-muted-foreground/40';
}

export default function OnePageKunden() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<OnePageProject[]>([]);
  const [stats, setStats] = useState<Record<string, LeadStat>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sort, setSort] = useState<'last' | 'name' | 'count'>('last');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', page_url: '', status: 'active' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: projData, error } = await supabase
      .from('onepage_projects')
      .select('id,name,page_url,status,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Projekte konnten nicht geladen werden');
      setLoading(false);
      return;
    }
    setProjects((projData || []) as OnePageProject[]);

    const { data: leadData } = await supabase
      .from('onepage_project_leads')
      .select('project_id,received_at')
      .order('received_at', { ascending: false })
      .limit(5000);

    const now = Date.now();
    const map: Record<string, LeadStat> = {};
    (leadData || []).forEach((l: { project_id: string; received_at: string }) => {
      const s = (map[l.project_id] ||= {
        project_id: l.project_id, total: 0, last7: 0, last30: 0, last_received: null,
      });
      s.total++;
      const age = now - new Date(l.received_at).getTime();
      if (age < 7 * 86400_000) s.last7++;
      if (age < 30 * 86400_000) s.last30++;
      if (!s.last_received || l.received_at > s.last_received) s.last_received = l.received_at;
    });
    setStats(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'count') return (stats[b.id]?.total || 0) - (stats[a.id]?.total || 0);
      const aT = stats[a.id]?.last_received || a.created_at;
      const bT = stats[b.id]?.last_received || b.created_at;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });
    return list;
  }, [projects, stats, statusFilter, search, sort]);

  const kpis = useMemo(() => {
    const active = projects.filter((p) => p.status === 'active').length;
    let total = 0, l30 = 0, l7 = 0;
    Object.values(stats).forEach((s) => {
      total += s.total; l30 += s.last30; l7 += s.last7;
    });
    return { active, total, l30, l7 };
  }, [projects, stats]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error('Name ist erforderlich');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('onepage_projects').insert({
      name: form.name.trim(),
      page_url: form.page_url.trim() || null,
      status: form.status,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes('row-level')
        ? 'Keine Berechtigung – nur Admins/Manager können Projekte anlegen.'
        : 'Anlegen fehlgeschlagen');
      return;
    }
    toast.success('Projekt angelegt');
    setCreateOpen(false);
    setForm({ name: '', page_url: '', status: 'active' });
    load();
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">OnePage Kunden</h1>
          <p className="text-sm text-muted-foreground mt-1">Alle Landingpages und ihre Leads</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled title="Bald verfügbar">
            <Upload className="h-4 w-4 mr-2" />
            CSV importieren
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Projekt hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neues OnePage Projekt</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="op-name">Name *</Label>
                  <Input id="op-name" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="z. B. Kunde XY – PKV Landing" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="op-url">Page URL</Label>
                  <Input id="op-url" value={form.page_url}
                    onChange={(e) => setForm((f) => ({ ...f, page_url: e.target.value }))}
                    placeholder="https://landing.example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="paused">Pausiert</SelectItem>
                      <SelectItem value="archived">Archiviert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? 'Speichern…' : 'Anlegen'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Aktive Projekte', value: kpis.active },
          { label: 'Leads gesamt', value: kpis.total },
          { label: 'Leads (30T)', value: kpis.l30 },
          { label: 'Leads (7T)', value: kpis.l7 },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Projekt suchen…" className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-1">
          {[
            { v: 'all', l: 'Alle' },
            { v: 'active', l: 'Aktiv' },
            { v: 'paused', l: 'Pausiert' },
            { v: 'archived', l: 'Archiviert' },
          ].map((c) => (
            <button key={c.v} onClick={() => setStatusFilter(c.v)}
              className={cn(
                'px-3 h-8 rounded text-xs font-medium border transition-colors',
                statusFilter === c.v
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/60'
              )}>
              {c.l}
            </button>
          ))}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as any)}>
          <SelectTrigger className="w-[180px] h-9 ml-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last">Letzter Lead</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="count">Anzahl Leads</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Lade Projekte…</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Globe className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
            <p className="font-medium">
              {projects.length === 0 ? 'Noch keine OnePage Projekte.' : 'Keine Projekte für diesen Filter.'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {projects.length === 0
                ? 'Leg dein erstes Projekt an oder importiere bestehende Projekte als CSV.'
                : 'Filter zurücksetzen oder Suche anpassen.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const s = stats[p.id];
            return (
              <Card key={p.id}
                onClick={() => navigate(`/onepage-leads/kunden/${p.id}`)}
                className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', activityColor(s?.last_received || null))} />
                        <h3 className="font-semibold text-base truncate">{p.name}</h3>
                      </div>
                      {p.page_url && (
                        <a href={p.page_url} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1 truncate">
                          {p.page_url.replace(/^https?:\/\//, '')}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      )}
                    </div>
                    <Badge variant="outline" className={cn('rounded text-[10px] px-2 py-0.5', STATUS_BADGE[p.status] || STATUS_BADGE.archived)}>
                      {STATUS_LABEL[p.status] || p.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-foreground tabular-nums">
                    <span className="font-semibold">{s?.total || 0}</span>
                    <span className="text-muted-foreground"> Leads gesamt · </span>
                    <span className="font-semibold">{s?.last7 || 0}</span>
                    <span className="text-muted-foreground"> in 7T</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Letzter Lead: {relativeTime(s?.last_received || null)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
