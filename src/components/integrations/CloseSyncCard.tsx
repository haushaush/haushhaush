// Bulk Close.com sync UI — used in Einstellungen → Verknüpfungen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Loader2, RefreshCw, Search, Link2, Unlink, ChevronDown, Cloud,
  Users2, Calendar, Activity, Briefcase, RotateCw, X, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const MAX_BATCH = 30;

type LinkedRow = {
  client_id: string;
  close_lead_id: string;
  last_synced_at: string | null;
  client: { id: string; name: string; email: string | null } | null;
};
type UnlinkedRow = { id: string; name: string; email: string | null };
type CloseLead = { id: string; display_name?: string; name?: string; description?: string };

export function CloseSyncCard() {
  const [stats, setStats] = useState({ linked: 0, totalClients: 0, lastSync: null as string | null, activities: 0, opportunities: 0 });
  const [linked, setLinked] = useState<LinkedRow[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failedList, setFailedList] = useState<Array<{ client_id: string; name: string; error: string }>>([]);
  const [showFailed, setShowFailed] = useState(false);
  const [pickClient, setPickClient] = useState<UnlinkedRow | null>(null);

  // Sync-all-linked state
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [recent, setRecent] = useState<Array<{ name: string; status: 'ok' | 'warn' | 'err'; note?: string }>>([]);
  const cancelRef = useRef(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<{ ok: number; warn: number; err: number; failedIds: string[]; cancelled: boolean }>({
    ok: 0, warn: 0, err: 0, failedIds: [], cancelled: false,
  });

  const load = async () => {
    setLoading(true);
    const [{ data: links }, { count: cntClients }, { count: cntActivities }, { count: cntOpps }] = await Promise.all([
      supabase.from('close_link' as any).select('client_id, close_lead_id, last_synced_at, client:clients(id, name, email)'),
      supabase.from('clients').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('close_activities' as any).select('id', { count: 'exact', head: true }),
      supabase.from('close_opportunities' as any).select('id', { count: 'exact', head: true }),
    ]);
    const linkedRows = ((links || []) as any as LinkedRow[]).filter((l) => l.client);
    linkedRows.sort((a, b) => {
      const ta = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
      const tb = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
      return ta - tb;
    });
    setLinked(linkedRows);

    const linkedIds = new Set(linkedRows.map((l) => l.client_id));
    const { data: allClients } = await supabase.from('clients').select('id, name, email').is('deleted_at', null).order('name');
    setUnlinked((allClients || []).filter((c) => !linkedIds.has(c.id) && c.email));

    const lastSync = linkedRows.reduce<string | null>((acc, r) => {
      if (!r.last_synced_at) return acc;
      if (!acc || new Date(r.last_synced_at) > new Date(acc)) return r.last_synced_at;
      return acc;
    }, null);

    setStats({
      linked: linkedRows.length,
      totalClients: cntClients || 0,
      lastSync,
      activities: cntActivities || 0,
      opportunities: cntOpps || 0,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Scroll to #close on hash
  useEffect(() => {
    if (window.location.hash === '#close') {
      setTimeout(() => document.getElementById('close-sync-card')?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, []);

  const matchUnlinked = async () => {
    setMatching(true);
    const tId = toast.loading('Matche unverlinkte Kunden…');
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('sync-close-link');
      if (error) throw error;
      const dur = ((Date.now() - start) / 1000).toFixed(1);
      toast.success(`Matching fertig in ${dur}s · ${data?.matched ?? 0} neu, ${data?.unmatched ?? 0} ohne Treffer, ${data?.ambiguous ?? 0} mehrdeutig`, { id: tId });
      await load();
    } catch (e: any) {
      toast.error(`Matching fehlgeschlagen: ${e.message}`, { id: tId });
    } finally {
      setMatching(false);
    }
  };

  const runBatchSync = async (ids: string[]) => {
    if (ids.length === 0) { toast.info('Keine Kunden ausgewählt.'); return; }
    if (ids.length > MAX_BATCH) {
      toast.error(`Max ${MAX_BATCH} pro Run, bitte in Batches aufteilen.`);
      return;
    }
    setSyncing(true);
    setProgress({ current: 0, total: ids.length });
    setFailedList([]);
    const tId = toast.loading(`Syncing 0 von ${ids.length}…`);
    const start = Date.now();

    // Simulated progress ticker (server runs sequentially with ~800ms gap, ~1-2s per client).
    let tick = 0;
    const ticker = setInterval(() => {
      tick = Math.min(tick + 1, ids.length - 1);
      setProgress({ current: tick, total: ids.length });
      toast.loading(`Syncing ${tick} von ${ids.length}…`, { id: tId });
    }, 1200);

    try {
      const { data, error } = await supabase.functions.invoke('sync-close-batch', { body: { client_ids: ids } });
      clearInterval(ticker);
      if (error) throw error;
      const ok = data?.success?.length ?? 0;
      const failed: Array<{ client_id: string; error?: string }> = data?.failed ?? [];
      const dur = ((Date.now() - start) / 1000).toFixed(1);
      setProgress({ current: ids.length, total: ids.length });

      if (failed.length === 0) {
        toast.success(`${ok} Kunden synct in ${dur}s`, { id: tId });
      } else {
        const nameMap = new Map(linked.map((l) => [l.client_id, l.client?.name ?? l.client_id]));
        const failedDetailed = failed.map((f) => ({
          client_id: f.client_id,
          name: nameMap.get(f.client_id) ?? f.client_id,
          error: f.error ?? 'Unbekannter Fehler',
        }));
        setFailedList(failedDetailed);
        toast.error(`${ok} OK, ${failed.length} Fehler in ${dur}s`, {
          id: tId,
          action: { label: 'Details', onClick: () => setShowFailed(true) },
        });
      }
      setSelected(new Set());
      await load();
    } catch (e: any) {
      clearInterval(ticker);
      toast.error(`Bulk-Sync fehlgeschlagen: ${e.message}`, { id: tId });
    } finally {
      setSyncing(false);
      setTimeout(() => setProgress(null), 1500);
    }
  };

  const syncOne = async (clientId: string) => {
    setSyncing(true);
    const tId = toast.loading('Sync läuft…');
    try {
      const { error } = await supabase.functions.invoke('sync-close-lead-full', { body: { client_id: clientId } });
      if (error) throw error;
      toast.success('Sync OK', { id: tId });
      await load();
    } catch (e: any) {
      toast.error(`Fehler: ${e.message}`, { id: tId });
    } finally {
      setSyncing(false);
    }
  };

  const unlink = async (clientId: string) => {
    const { error } = await supabase.from('close_link' as any).delete().eq('client_id', clientId);
    if (error) { toast.error(`Lösen fehlgeschlagen: ${error.message}`); return; }
    toast.success('Verknüpfung gelöst');
    await load();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_BATCH) {
          toast.info(`Max ${MAX_BATCH} pro Bulk-Run.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    const d = new Date(s);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'heute';
    if (days === 1) return 'gestern';
    if (days < 30) return `vor ${days}d`;
    return d.toLocaleDateString('de-DE');
  };

  const selectAllVisible = () => {
    const ids = linked.slice(0, MAX_BATCH).map((l) => l.client_id);
    setSelected(new Set(ids));
  };

  return (
    <Card id="close-sync-card" className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-4 w-4 text-primary" />
          Close.com — Direkter Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={<Users2 className="h-3.5 w-3.5" />} label="Verlinkte Kunden" value={loading ? '…' : `${stats.linked} / ${stats.totalClients}`} />
          <StatTile icon={<Calendar className="h-3.5 w-3.5" />} label="Letzter Sync" value={loading ? '…' : formatDate(stats.lastSync)} />
          <StatTile icon={<Activity className="h-3.5 w-3.5" />} label="Activities" value={loading ? '…' : stats.activities.toLocaleString('de-DE')} />
          <StatTile icon={<Briefcase className="h-3.5 w-3.5" />} label="Opportunities" value={loading ? '…' : stats.opportunities.toLocaleString('de-DE')} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={matchUnlinked} disabled={matching || syncing} variant="outline" size="sm">
            {matching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
            Alle nicht-verlinkten matchen
          </Button>
          <Button
            onClick={() => runBatchSync(Array.from(selected))}
            disabled={syncing || matching || selected.size === 0}
            size="sm"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Ausgewählte syncen ({selected.size})
          </Button>
          {progress && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Syncing {progress.current} von {progress.total}…
            </span>
          )}
        </div>

        {/* Linked table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
            <p className="text-xs font-medium">Verlinkte Kunden ({linked.length}) · sortiert nach ältestem Sync</p>
            <button
              onClick={selectAllVisible}
              className="text-xs text-primary hover:underline"
              disabled={linked.length === 0}
            >
              Top {Math.min(MAX_BATCH, linked.length)} auswählen
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="w-8 px-3 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium">Name</th>
                  <th className="text-left px-2 py-2 font-medium hidden md:table-cell">Email</th>
                  <th className="text-left px-2 py-2 font-medium hidden lg:table-cell">Lead-ID</th>
                  <th className="text-left px-2 py-2 font-medium">Last Sync</th>
                  <th className="text-right px-2 py-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 mx-auto animate-spin" /></td></tr>
                ) : linked.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">Noch keine Verknüpfungen.</td></tr>
                ) : linked.map((row) => (
                  <tr key={row.client_id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(row.client_id)}
                        onCheckedChange={() => toggleSelect(row.client_id)}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium truncate max-w-[180px]">{row.client?.name}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[200px]">{row.client?.email || '—'}</td>
                    <td className="px-2 py-2 text-xs font-mono text-muted-foreground hidden lg:table-cell truncate max-w-[140px]">{row.close_lead_id}</td>
                    <td className="px-2 py-2 text-xs tabular-nums">{formatDate(row.last_synced_at)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => syncOne(row.client_id)} disabled={syncing}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => unlink(row.client_id)}>
                          <Unlink className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unmatched */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full">
            <ChevronDown className="h-4 w-4" />
            Nicht verlinkte Kunden ({unlinked.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="rounded-lg border border-border max-h-72 overflow-y-auto divide-y divide-border/50">
              {unlinked.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">Alle Kunden mit Email sind verlinkt.</p>
              ) : unlinked.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPickClient(c)}>
                    <Search className="h-3 w-3 mr-1.5" />
                    Manuell suchen
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <ManualLinkModal client={pickClient} onClose={(linkedNow) => { setPickClient(null); if (linkedNow) load(); }} />

        {/* Failed dialog */}
        <Dialog open={showFailed} onOpenChange={setShowFailed}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Sync-Fehler ({failedList.length})</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
              {failedList.map((f) => (
                <div key={f.client_id} className="py-2">
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-destructive">{f.error}</p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ManualLinkModal({ client, onClose }: { client: UnlinkedRow | null; onClose: (linked: boolean) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CloseLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!client) { setQ(''); setResults([]); return; }
    setQ(client.name);
  }, [client]);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('close-proxy', {
        body: { endpoint: `/lead/?query=${encodeURIComponent(q)}&_limit=10`, method: 'GET' },
      });
      if (error) throw error;
      setResults((data?.data || []).slice(0, 10));
    } catch (e: any) {
      toast.error(`Suche fehlgeschlagen: ${e.message}`);
    } finally {
      setSearching(false);
    }
  };

  const link = async (lead: CloseLead) => {
    if (!client) return;
    setLinking(lead.id);
    try {
      const { error } = await supabase.from('close_link' as any).insert({
        client_id: client.id,
        close_lead_id: lead.id,
        matched_via: 'manual',
        match_confidence: 1.0,
        last_synced_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Verlinkt');
      onClose(true);
    } catch (e: any) {
      toast.error(`Verlinken fehlgeschlagen: ${e.message}`);
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manuell verlinken: {client?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="In Close suchen..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <Button onClick={search} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <ul className="max-h-80 overflow-y-auto divide-y divide-border/50 -mx-2">
          {results.length === 0 ? (
            <li className="text-sm text-muted-foreground text-center py-6">Keine Treffer</li>
          ) : results.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.display_name || r.name || r.id}</p>
                {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => link(r)} disabled={linking === r.id}>
                {linking === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verlinken'}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
