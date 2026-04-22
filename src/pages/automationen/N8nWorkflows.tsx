import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RefreshCw, ExternalLink, Play, Search, Workflow, Zap, AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { N8nWorkflowDetailPanel } from '@/components/automationen/N8nWorkflowDetailPanel';

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags?: Array<{ id: string; name: string } | string>;
  nodes?: any[];
  updatedAt?: string;
  createdAt?: string;
}

interface N8nExecution {
  id: string;
  workflowId: string;
  status?: 'success' | 'error' | 'running' | 'canceled' | 'waiting';
  startedAt?: string;
  stoppedAt?: string;
  mode?: string;
  finished?: boolean;
}

interface Stats {
  active_count: number;
  executions_today: number;
  errors_24h: number;
  success_rate_7d: number;
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'error';
type SortKey = 'updated' | 'name' | 'active' | 'errors';

function relTime(iso?: string) {
  if (!iso) return '–';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `vor ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} T.`;
}

function triggerLabel(nodes: any[] = []) {
  const trigger = nodes.find((n) => /trigger|webhook|cron/i.test(n.type)) || nodes[0];
  if (!trigger) return 'Manual';
  const t = String(trigger.type || '');
  const map: Record<string, string> = {
    'n8n-nodes-base.webhook': 'Webhook',
    'n8n-nodes-base.scheduleTrigger': 'Schedule',
    'n8n-nodes-base.manualTrigger': 'Manual',
    'n8n-nodes-base.emailReadImap': 'Email',
    'n8n-nodes-base.cron': 'Cron',
  };
  if (map[t]) return map[t];
  const seg = t.split('.').pop() || t;
  return seg.replace(/Trigger$/i, '').replace(/^./, (c) => c.toUpperCase());
}

function tagName(t: any): string {
  return typeof t === 'string' ? t : (t?.name || '');
}

export default function N8nWorkflowsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState<string>('');
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [wfRes, execRes, statsRes, settingsRes] = await Promise.all([
        supabase.functions.invoke('n8n-proxy', { body: { action: 'list_workflows' } }),
        supabase.functions.invoke('n8n-proxy', { body: { action: 'list_executions', limit: 100 } }),
        supabase.functions.invoke('n8n-proxy', { body: { action: 'stats_summary' } }),
        supabase.from('integration_settings').select('config').eq('provider', 'n8n')
          .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const cfg: any = settingsRes.data?.config || {};
      setInstanceUrl(cfg.instance_url || '');

      const firstErr = wfRes.error || (wfRes.data as any)?.error;
      if (firstErr === 'not_configured' || (wfRes.data as any)?.error === 'not_configured') {
        setNotConfigured(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setNotConfigured(false);

      if ((wfRes.data as any)?.workflows) setWorkflows((wfRes.data as any).workflows);
      if ((execRes.data as any)?.executions) setExecutions((execRes.data as any).executions);
      if (statsRes.data && !(statsRes.data as any).error) setStats(statsRes.data as Stats);
      setLastUpdated(new Date());
    } catch (e: any) {
      if (!silent) toast.error('Fehler beim Laden: ' + (e.message || 'Unbekannt'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30s while tab visible
  useEffect(() => {
    const tick = () => { if (!document.hidden) fetchAll(true); };
    intervalRef.current = window.setInterval(tick, 30_000);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [fetchAll]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    workflows.forEach((w) => (w.tags || []).forEach((t) => { const n = tagName(t); if (n) s.add(n); }));
    return Array.from(s).sort();
  }, [workflows]);

  // last execution per workflow
  const lastExecByWorkflow = useMemo(() => {
    const map = new Map<string, N8nExecution>();
    for (const ex of executions) {
      const cur = map.get(ex.workflowId);
      if (!cur || (ex.startedAt && cur.startedAt && new Date(ex.startedAt) > new Date(cur.startedAt))) {
        map.set(ex.workflowId, ex);
      }
    }
    return map;
  }, [executions]);

  // success-rate over last 20 executions per workflow
  const successRateByWorkflow = useMemo(() => {
    const grouped = new Map<string, N8nExecution[]>();
    for (const ex of executions) {
      if (!grouped.has(ex.workflowId)) grouped.set(ex.workflowId, []);
      grouped.get(ex.workflowId)!.push(ex);
    }
    const out = new Map<string, { rate: number; total: number }>();
    grouped.forEach((arr, wfId) => {
      const sorted = arr.sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()).slice(0, 20);
      const ok = sorted.filter((e) => e.status === 'success').length;
      out.set(wfId, { rate: sorted.length > 0 ? Math.round((ok / sorted.length) * 100) : 0, total: sorted.length });
    });
    return out;
  }, [executions]);

  const filtered = useMemo(() => {
    let list = workflows.slice();
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((w) => w.name.toLowerCase().includes(q));
    if (statusFilter === 'active') list = list.filter((w) => w.active);
    else if (statusFilter === 'inactive') list = list.filter((w) => !w.active);
    else if (statusFilter === 'error') {
      list = list.filter((w) => lastExecByWorkflow.get(w.id)?.status === 'error');
    }
    if (tagFilter !== 'all') {
      list = list.filter((w) => (w.tags || []).some((t) => tagName(t) === tagFilter));
    }
    list.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'active') return Number(b.active) - Number(a.active);
      if (sortKey === 'errors') {
        const ea = executions.filter((e) => e.workflowId === a.id && e.status === 'error').length;
        const eb = executions.filter((e) => e.workflowId === b.id && e.status === 'error').length;
        return eb - ea;
      }
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
    return list;
  }, [workflows, search, statusFilter, tagFilter, sortKey, lastExecByWorkflow, executions]);

  const toggleWorkflow = async (wf: N8nWorkflow) => {
    setTogglingId(wf.id);
    const action = wf.active ? 'deactivate_workflow' : 'activate_workflow';
    const { data, error } = await supabase.functions.invoke('n8n-proxy', { body: { action, workflow_id: wf.id } });
    setTogglingId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.message || error?.message || 'Fehler');
      return;
    }
    setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? { ...w, active: !wf.active } : w)));
    toast.success(wf.active ? 'Workflow deaktiviert' : 'Workflow aktiviert');
  };

  const executeWorkflow = async (wf: N8nWorkflow) => {
    setExecutingId(wf.id);
    const { data, error } = await supabase.functions.invoke('n8n-proxy', {
      body: { action: 'execute_workflow', workflow_id: wf.id },
    });
    setExecutingId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.message || error?.message || 'Ausführung fehlgeschlagen');
      return;
    }
    toast.success(`"${wf.name}" gestartet`);
    fetchAll(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">n8n Workflows</h1>
          <p className="text-sm text-muted-foreground">Alle Automationen im Überblick</p>
        </div>
        <Card className="p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">n8n nicht verbunden</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Verbinde deine n8n Instanz, um alle Workflows hier zu verwalten.
          </p>
          <Button asChild>
            <Link to="/einstellungen">Jetzt einrichten</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const selectedWorkflow = workflows.find((w) => w.id === selectedId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">n8n Workflows</h1>
          <p className="text-sm text-muted-foreground">Alle Automationen im Überblick</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchAll()} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
          {instanceUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={instanceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                In n8n öffnen
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Aktive Workflows</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats?.active_count ?? workflows.filter((w) => w.active).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Ausführungen heute</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats?.executions_today ?? 0}</p>
        </Card>
        <Card className={`p-4 ${(stats?.errors_24h ?? 0) > 0 ? 'border-l-[3px] border-l-destructive' : ''}`}>
          <p className="text-xs text-muted-foreground">Fehler 24h</p>
          <p className={`text-2xl font-bold mt-1 ${(stats?.errors_24h ?? 0) > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {stats?.errors_24h ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Erfolgsrate 7T</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats?.success_rate_7d ?? 0}%</p>
        </Card>
      </div>

      {lastUpdated && (
        <p className="text-[11px] text-muted-foreground -mt-3">
          Zuletzt aktualisiert: {lastUpdated.toLocaleTimeString('de-DE')}
        </p>
      )}

      {/* Filter bar */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Workflow suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'active', 'inactive', 'error'] as StatusFilter[]).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              className="h-9 text-xs"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Alle' : s === 'active' ? 'Aktiv' : s === 'inactive' ? 'Inaktiv' : 'Fehlerhaft'}
            </Button>
          ))}
        </div>
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-48 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Zuletzt geändert</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="active">Aktive zuerst</SelectItem>
            <SelectItem value="errors">Meiste Fehler</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Workflow table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 w-8"></th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2 hidden md:table-cell">Trigger</th>
                <th className="px-2 py-2 hidden md:table-cell">Nodes</th>
                <th className="px-2 py-2 hidden lg:table-cell">Letzte Ausführung</th>
                <th className="px-2 py-2 hidden lg:table-cell">Erfolgsrate</th>
                <th className="px-2 py-2 text-right pr-4">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Workflow className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                  Keine Workflows gefunden
                </td></tr>
              ) : filtered.map((wf) => {
                const lastEx = lastExecByWorkflow.get(wf.id);
                const successRate = successRateByWorkflow.get(wf.id);
                const dotClass = !wf.active
                  ? 'bg-muted-foreground/30 ring-1 ring-muted-foreground/40'
                  : lastEx?.status === 'error'
                    ? 'bg-destructive'
                    : 'bg-success';
                return (
                  <tr
                    key={wf.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                    onClick={() => setSelectedId(wf.id)}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-foreground">{wf.name}</div>
                      {wf.tags && wf.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {wf.tags.slice(0, 4).map((t, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {tagName(t)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 hidden md:table-cell">
                      <Badge variant="secondary" className="text-[10px] rounded">{triggerLabel(wf.nodes)}</Badge>
                    </td>
                    <td className="px-2 py-3 hidden md:table-cell text-muted-foreground">{wf.nodes?.length ?? 0}</td>
                    <td className="px-2 py-3 hidden lg:table-cell text-muted-foreground">
                      {lastEx ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${lastEx.status === 'success' ? 'bg-success' : lastEx.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />
                          {relTime(lastEx.startedAt)}
                        </span>
                      ) : '–'}
                    </td>
                    <td className="px-2 py-3 hidden lg:table-cell">
                      {successRate && successRate.total > 0 ? (
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-success" style={{ width: `${successRate.rate}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">{successRate.rate}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-2 py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Switch
                          checked={wf.active}
                          disabled={togglingId === wf.id}
                          onCheckedChange={() => toggleWorkflow(wf)}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={executingId === wf.id} onClick={() => executeWorkflow(wf)} title="Ausführen">
                          {executingId === wf.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                        {instanceUrl && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="In n8n öffnen">
                            <a href={`${instanceUrl.replace(/\/+$/, '')}/workflow/${wf.id}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <N8nWorkflowDetailPanel
        workflow={selectedWorkflow}
        executions={executions.filter((e) => selectedId && e.workflowId === selectedId)}
        instanceUrl={instanceUrl}
        onClose={() => setSelectedId(null)}
        onToggle={toggleWorkflow}
        onExecute={executeWorkflow}
        toggling={togglingId === selectedId}
      />
    </div>
  );
}
