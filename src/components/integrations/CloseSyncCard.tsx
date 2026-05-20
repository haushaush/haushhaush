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
type Suggestion = {
  close_lead_id: string;
  display_name: string;
  contact_name: string | null;
  emails: string[];
  phones: string[];
  status_label: string;
  confidence: number;
  match_reasons: string[];
};

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

  // Suggestions cache + bulk-load
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[] | 'loading' | 'error' | 'empty'>>({});
  const [linkingPair, setLinkingPair] = useState<string | null>(null);
  const [recentlyLinked, setRecentlyLinked] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const bulkCancelRef = useRef(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [unlinkedSort, setUnlinkedSort] = useState<'confidence' | 'alpha'>('confidence');
  // TODO: Multi-Select Bulk-Link in nächstem Sprint — Checkbox visuell, noch nicht funktional
  const [selectedUnlinked, setSelectedUnlinked] = useState<Set<string>>(new Set());

  // Sync-all-linked state
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [recent, setRecent] = useState<Array<{ name: string; status: 'ok' | 'warn' | 'err'; note?: string }>>([]);
  const cancelRef = useRef(false);
  const matchCancelRef = useRef(false);
  const [matchProgress, setMatchProgress] = useState<{ iterations: number; totalMatched: number; remaining: number; unmatched: number; ambiguous: number } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<{ ok: number; warn: number; err: number; failedIds: string[]; cancelled: boolean }>({
    ok: 0, warn: 0, err: 0, failedIds: [], cancelled: false,
  });

  // Reset & re-sync state
  const [resetStage, setResetStage] = useState<0 | 1 | 2>(0);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetRunning, setResetRunning] = useState(false);

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
    setUnlinked((allClients || []).filter((c) => !linkedIds.has(c.id)));

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
    matchCancelRef.current = false;
    setMatchProgress({ iterations: 0, totalMatched: 0, remaining: 0, unmatched: 0, ambiguous: 0 });
    const tId = toast.loading('Matche unverlinkte Kunden…');
    const start = Date.now();
    const MAX_ITERATIONS = 50;
    let totalMatched = 0;
    let iterations = 0;
    let lastRemaining: number | undefined;

    try {
      while (iterations < MAX_ITERATIONS) {
        if (matchCancelRef.current) break;
        const { data, error } = await supabase.functions.invoke('sync-close-link', { body: {} });
        if (error) throw error;

        const matched = (data?.email_matched || 0)
          + (data?.email_variant_matched || 0)
          + (data?.name_fallback_exact || 0)
          + (data?.name_fuzzy || 0);
        totalMatched += matched;
        iterations++;
        lastRemaining = data?.remaining;

        setMatchProgress({
          iterations,
          totalMatched,
          remaining: data?.remaining ?? 0,
          unmatched: data?.no_match ?? 0,
          ambiguous: data?.ambiguous ?? 0,
        });
        toast.loading(`Durchlauf ${iterations} · ${totalMatched} verlinkt · ${data?.remaining ?? 0} verbleibend`, { id: tId });

        // Stop if nothing left or nothing matched this round (avoids infinite loop on ambiguous-only)
        if (!data?.remaining || data.remaining === 0) break;
        if (matched === 0 && (data?.processed ?? 0) === 0) break;

        await new Promise((r) => setTimeout(r, 1500));
      }

      const dur = ((Date.now() - start) / 1000).toFixed(1);
      if (matchCancelRef.current) {
        toast.warning(`Abgebrochen · ${totalMatched} neu in ${iterations} Durchläufen (${dur}s)`, { id: tId });
      } else {
        toast.success(`Fertig · ${totalMatched} neu verlinkt in ${iterations} Durchläufen (${dur}s)`, { id: tId });
      }
      await load();
    } catch (e: any) {
      toast.error(`Match-Loop gestoppt: ${e.message}`, { id: tId });
    } finally {
      setMatching(false);
      matchCancelRef.current = false;
      setTimeout(() => setMatchProgress(null), 4000);
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

  const chunk = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const startSyncAllLinked = () => {
    if (linked.length === 0) { toast.info('Keine verlinkten Kunden.'); return; }
    setConfirmAllOpen(true);
  };

  const runSyncAllLinked = async () => {
    setConfirmAllOpen(false);
    const ids = linked.map((l) => l.client_id);
    const nameMap = new Map(linked.map((l) => [l.client_id, l.client?.name ?? l.client_id]));
    const total = ids.length;
    const chunks = chunk(ids, MAX_BATCH);

    cancelRef.current = false;
    setSyncAllRunning(true);
    setSyncAllProgress({ current: 0, total });
    setRecent([]);
    let ok = 0, warn = 0, err = 0;
    const failedIds: string[] = [];
    let consecutiveBatchFailures = 0;
    let processed = 0;

    for (let i = 0; i < chunks.length; i++) {
      if (cancelRef.current) break;
      const batch = chunks[i];
      try {
        const { data, error } = await supabase.functions.invoke('sync-close-batch', { body: { client_ids: batch } });
        if (error) throw error;

        const successArr: any[] = data?.success ?? [];
        const failedArr: Array<{ client_id: string; error?: string }> = data?.failed ?? [];
        consecutiveBatchFailures = 0;

        const newRecent: typeof recent = [];
        for (const s of successArr) {
          const id = typeof s === 'string' ? s : s?.client_id;
          if (!id) continue;
          ok++;
          newRecent.push({ name: nameMap.get(id) ?? id, status: 'ok' });
        }
        for (const f of failedArr) {
          const isWarn = /needs_review|ambiguous|no_lead|no_link/i.test(f.error ?? '');
          if (isWarn) warn++; else { err++; failedIds.push(f.client_id); }
          newRecent.push({ name: nameMap.get(f.client_id) ?? f.client_id, status: isWarn ? 'warn' : 'err', note: f.error });
        }
        setRecent((prev) => [...newRecent.reverse(), ...prev].slice(0, 5));
      } catch (e: any) {
        consecutiveBatchFailures++;
        err += batch.length;
        for (const id of batch) failedIds.push(id);
        setRecent((prev) => [
          { name: `Batch ${i + 1}`, status: 'err' as const, note: e.message },
          ...prev,
        ].slice(0, 5));
        if (consecutiveBatchFailures >= 3) {
          toast.error('3 Batches in Folge fehlgeschlagen — Stop.');
          break;
        }
      }
      processed += batch.length;
      setSyncAllProgress({ current: Math.min(processed, total), total });
    }

    setSummary({ ok, warn, err, failedIds, cancelled: cancelRef.current });
    setSummaryOpen(true);
    setSyncAllRunning(false);
    await load();
  };

  const cancelSyncAll = () => {
    cancelRef.current = true;
    toast.info('Wird nach aktuellem Batch beendet…');
  };

  const retryFailed = async () => {
    setSummaryOpen(false);
    const ids = summary.failedIds.slice(0, MAX_BATCH);
    if (ids.length === 0) return;
    await runBatchSync(ids);
  };

  const runResetAndResync = async () => {
    setResetStage(0);
    setResetConfirmText('');
    setResetRunning(true);
    const tId = toast.loading('Lösche alle Close-Daten…');
    try {
      const { data, error } = await supabase.functions.invoke('reset-close-data');
      if (error) throw error;
      const d = data?.deleted ?? {};
      toast.success(
        `Reset OK: ${d.leads ?? 0} Leads, ${d.opps ?? 0} Opps, ${d.activities ?? 0} Activities gelöscht. Starte Re-Sync…`,
        { id: tId, duration: 4000 },
      );
      await load();
      // Trigger same bulk-sync flow as Button 2
      if (linked.length > 0 || (data?.linked_clients_count ?? 0) > 0) {
        await runSyncAllLinked();
      } else {
        toast.info('Keine verlinkten Kunden — nichts zu syncen.');
      }
    } catch (e: any) {
      toast.error(`Reset fehlgeschlagen: ${e.message}`, { id: tId });
    } finally {
      setResetRunning(false);
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

  // ───────── Suggestions ─────────
  const loadSuggestionsFor = async (clientId: string) => {
    setSuggestions((s) => ({ ...s, [clientId]: 'loading' }));
    try {
      const { data, error } = await supabase.functions.invoke('search-close-suggestions', {
        body: { client_id: clientId },
      });
      if (error) throw error;
      const arr: Suggestion[] = data?.suggestions ?? [];
      setSuggestions((s) => ({ ...s, [clientId]: arr.length ? arr : 'empty' }));
    } catch (e: any) {
      console.error('[suggestions] fail', e);
      setSuggestions((s) => ({ ...s, [clientId]: 'error' }));
      toast.error(`Vorschläge fehlgeschlagen: ${e.message}`);
    }
  };

  const loadAllSuggestions = async () => {
    if (unlinked.length === 0) return;
    bulkCancelRef.current = false;
    setBulkLoading(true);
    setBulkProgress({ done: 0, total: unlinked.length });
    const ids = unlinked.map((u) => u.id);
    const BATCH = 20;
    let done = 0;
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        if (bulkCancelRef.current) break;
        const batch = ids.slice(i, i + BATCH);
        // mark loading
        setSuggestions((prev) => {
          const next = { ...prev };
          for (const id of batch) if (!next[id] || next[id] === 'error') next[id] = 'loading';
          return next;
        });
        try {
          const { data, error } = await supabase.functions.invoke('search-close-suggestions-batch', {
            body: { client_ids: batch },
          });
          if (error) throw error;
          const results: Array<{ client_id: string; suggestions?: Suggestion[]; error?: string }> = data?.results ?? [];
          setSuggestions((prev) => {
            const next = { ...prev };
            for (const r of results) {
              if (r.error) next[r.client_id] = 'error';
              else {
                const arr = r.suggestions ?? [];
                next[r.client_id] = arr.length ? arr : 'empty';
              }
            }
            return next;
          });
        } catch (e: any) {
          console.warn('[bulk suggestions] batch fail', e);
          setSuggestions((prev) => {
            const next = { ...prev };
            for (const id of batch) next[id] = 'error';
            return next;
          });
        }
        done += batch.length;
        setBulkProgress({ done, total: ids.length });
      }
      if (bulkCancelRef.current) toast.info(`Abgebrochen — ${done}/${ids.length} Vorschläge geladen.`);
      else toast.success(`Vorschläge geladen für ${done} Kunden.`);
    } finally {
      setBulkLoading(false);
    }
  };

  const linkSuggestion = async (clientId: string, leadId: string, displayName: string) => {
    const key = `${clientId}:${leadId}`;
    setLinkingPair(key);
    // Optimistic: ausgrauen + nach 1.5s entfernen
    setRecentlyLinked((s) => new Set(s).add(clientId));
    try {
      const { error } = await supabase.functions.invoke('sync-close-link', {
        body: { client_id: clientId, manual_close_lead_id: leadId, matched_via: 'manual' },
      });
      if (error) throw error;
      toast.success(`Verlinkt mit ${displayName}`);
      setTimeout(() => {
        setUnlinked((u) => u.filter((c) => c.id !== clientId));
        setSuggestions((s) => { const n = { ...s }; delete n[clientId]; return n; });
        setRecentlyLinked((s) => { const n = new Set(s); n.delete(clientId); return n; });
        setStats((st) => ({ ...st, linked: st.linked + 1 }));
        load();
      }, 1500);
    } catch (e: any) {
      // Rollback
      setRecentlyLinked((s) => { const n = new Set(s); n.delete(clientId); return n; });
      toast.error(`Verlinken fehlgeschlagen: ${e.message}`);
    } finally {
      setLinkingPair(null);
    }
  };

  const sortedUnlinked = useMemo(() => {
    const arr = [...unlinked];
    if (unlinkedSort === 'alpha') {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    } else {
      arr.sort((a, b) => {
        const ca = suggestions[a.id];
        const cb = suggestions[b.id];
        const va = Array.isArray(ca) ? (ca[0]?.confidence ?? 0) : -1;
        const vb = Array.isArray(cb) ? (cb[0]?.confidence ?? 0) : -1;
        if (vb !== va) return vb - va;
        return a.name.localeCompare(b.name, 'de');
      });
    }
    // Linked-pending zum Schluss
    arr.sort((a, b) => Number(recentlyLinked.has(a.id)) - Number(recentlyLinked.has(b.id)));
    return arr;
  }, [unlinked, suggestions, unlinkedSort, recentlyLinked]);

  const confidenceColor = (c: number) =>
    c >= 0.85 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    : c >= 0.65 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
    : 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30';


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

        {/* Primary actions */}
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={matchUnlinked} disabled={matching || syncing || syncAllRunning} size="sm">
                  {matching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
                  Alle nicht-verlinkten matchen
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sucht Close-Leads für Kunden ohne Verknüpfung. Läuft automatisch in Schleife bis alle durch sind.</TooltipContent>
            </Tooltip>

            {matching && (
              <Button
                onClick={() => { matchCancelRef.current = true; }}
                size="sm"
                variant="ghost"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Abbrechen
              </Button>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={startSyncAllLinked} disabled={matching || syncing || syncAllRunning || linked.length === 0} size="sm">
                  {syncAllRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1.5" />}
                  Alle verlinkten Kunden neu syncen
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Holt aktuelle Daten aus Close für alle verlinkten Kunden (Won-Deals, Activities, Custom Fields). Dauert bei 220 Kunden ca. 5–10 Min.
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setResetStage(1)}
                  disabled={matching || syncing || syncAllRunning || resetRunning}
                  size="sm"
                  variant="destructive"
                  className="ml-auto"
                >
                  {resetRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />}
                  Alle Close-Daten zurücksetzen &amp; neu holen
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Löscht alle Close-Daten (Leads, Contacts, Opps, Activities, Tasks). Verknüpfungen bleiben. Anschließend werden alle verlinkten Kunden frisch gesynct.
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* Live progress for match-all loop */}
        {matchProgress && (matching || matchProgress.iterations > 0) && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs tabular-nums flex items-center gap-3 flex-wrap">
            {matching && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            <span className="font-medium">Durchlauf {matchProgress.iterations}</span>
            <span className="text-muted-foreground">·</span>
            <span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{matchProgress.totalMatched}</span> verlinkt</span>
            <span className="text-muted-foreground">·</span>
            <span>{matchProgress.remaining} verbleibend</span>
            {matchProgress.ambiguous > 0 && <><span className="text-muted-foreground">·</span><span className="text-amber-600 dark:text-amber-400">{matchProgress.ambiguous} mehrdeutig</span></>}
          </div>
        )}

        {/* Progress for sync-all */}

        {syncAllRunning && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums font-medium">
                Synct… {syncAllProgress.current} / {syncAllProgress.total}
                {syncAllProgress.total > 0 && ` (${Math.round((syncAllProgress.current / syncAllProgress.total) * 100)}%)`}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelSyncAll}>
                <X className="h-3 w-3 mr-1" /> Abbrechen
              </Button>
            </div>
            <Progress value={syncAllProgress.total ? (syncAllProgress.current / syncAllProgress.total) * 100 : 0} className="h-1.5" />
            {recent.length > 0 && (
              <ul className="text-xs space-y-0.5 mt-2">
                {recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-muted-foreground">
                    {r.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                    {r.status === 'warn' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {r.status === 'err' && <XCircle className="h-3 w-3 text-destructive" />}
                    <span className="truncate">{r.name}{r.note ? ` — ${r.note}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Selected-sync action above table */}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-between">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => runBatchSync(Array.from(selected))}
                  disabled={syncing || matching || syncAllRunning || selected.size === 0}
                  size="sm"
                  variant="outline"
                >
                  {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Ausgewählte Kunden syncen ({selected.size})
                </Button>
              </TooltipTrigger>
              <TooltipContent>Frisch syncen für ausgewählte Kunden (max {MAX_BATCH}).</TooltipContent>
            </Tooltip>
            {progress && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Syncing {progress.current} / {progress.total}…
              </span>
            )}
          </div>
        </TooltipProvider>

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

        {/* Unmatched — mit Suggestions */}
        <TooltipProvider delayDuration={200}>
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full">
            <ChevronDown className="h-4 w-4" />
            Nicht verlinkte Kunden ({unlinked.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {/* Multi-Select-Vorschau Banner */}
            <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              💡 In Kürze: Mehrere Kunden auf einmal verlinken via Checkbox-Auswahl.
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={loadAllSuggestions}
                disabled={bulkLoading || unlinked.length === 0}
              >
                {bulkLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
                Vorschläge für alle {unlinked.length} laden
              </Button>
              {bulkLoading && (
                <Button size="sm" variant="ghost" onClick={() => { bulkCancelRef.current = true; }}>
                  <X className="h-3.5 w-3.5 mr-1.5" /> Abbrechen
                </Button>
              )}
              {bulkLoading && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {bulkProgress.done}/{bulkProgress.total}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <select
                  className="text-xs bg-background border border-border rounded px-2 py-1"
                  value={unlinkedSort}
                  onChange={(e) => setUnlinkedSort(e.target.value as any)}
                >
                  <option value="confidence">Sortierung: beste Treffer zuerst</option>
                  <option value="alpha">Sortierung: alphabetisch</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unlinked.length === 0}
                  onClick={() => {
                    const lines = unlinked.map((c) => `${c.name} | ${c.email ?? ''}`).join('\n');
                    const blob = new Blob([lines + '\n'], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `unlinked-clients-${new Date().toISOString().slice(0, 10)}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Als TXT exportieren
                </Button>
              </div>
            </div>
            {bulkLoading && (
              <Progress value={bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0} className="h-1.5" />
            )}

            <div className="rounded-lg border border-border max-h-[640px] overflow-y-auto divide-y divide-border/50">
              {unlinked.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">Alle Kunden sind verlinkt.</p>
              ) : sortedUnlinked.map((c) => {
                const sug = suggestions[c.id];
                const isLinkedPending = recentlyLinked.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`px-3 py-3 space-y-2 transition-opacity ${isLinkedPending ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedUnlinked.has(c.id)}
                        onCheckedChange={() => {
                          setSelectedUnlinked((p) => {
                            const n = new Set(p);
                            if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                            return n;
                          });
                        }}
                        disabled
                        aria-label="Mehrfachauswahl (bald)"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate flex items-center gap-2">
                          {c.name}
                          {isLinkedPending && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{c.email ?? 'keine Email'}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setPickClient(c)}>
                        Andere suchen →
                      </Button>
                    </div>

                    {/* Suggestions area */}
                    {!sug ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-7"
                        onClick={() => loadSuggestionsFor(c.id)}
                        disabled={bulkLoading}
                      >
                        <Search className="h-3 w-3 mr-1.5" />
                        Vorschläge laden
                      </Button>
                    ) : sug === 'loading' ? (
                      <div className="ml-7 space-y-1.5">
                        <div className="h-12 rounded bg-muted/40 animate-pulse" />
                        <div className="h-12 rounded bg-muted/40 animate-pulse" />
                      </div>
                    ) : sug === 'error' ? (
                      <div className="ml-7 flex items-center gap-2 text-xs text-destructive">
                        <XCircle className="h-3 w-3" />
                        Vorschläge konnten nicht geladen werden.
                        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => loadSuggestionsFor(c.id)}>
                          Erneut
                        </Button>
                      </div>
                    ) : sug === 'empty' ? (
                      <div className="ml-7 rounded border border-dashed border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                        Keine Vorschläge — {c.name} wurde in Close nicht gefunden. Eventuell nicht im verbundenen Workspace oder mit abweichendem Namen.
                        <a
                          href={`https://app.close.com/search/${encodeURIComponent(c.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 ml-2 text-primary hover:underline"
                        >
                          In Close prüfen →
                        </a>
                      </div>
                    ) : (
                      <ul className="ml-7 space-y-1.5">
                        {sug.slice(0, 3).map((s) => {
                          const isLinking = linkingPair === `${c.id}:${s.close_lead_id}`;
                          return (
                            <li
                              key={s.close_lead_id}
                              className="rounded-md border border-border bg-background px-3 py-2 flex items-center gap-3"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border tabular-nums ${confidenceColor(s.confidence)}`}>
                                    {Math.round(s.confidence * 100)}%
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs font-medium mb-1">Match-Gründe</p>
                                  <ul className="text-xs space-y-0.5">
                                    {s.match_reasons.length ? s.match_reasons.map((r, i) => <li key={i}>• {r}</li>) : <li>—</li>}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{s.display_name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {s.contact_name && <span className="mr-2">{s.contact_name}</span>}
                                  {s.emails[0] && <span className="mr-2">{s.emails[0]}</span>}
                                  {s.status_label !== '—' && <span className="opacity-70">· {s.status_label}</span>}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isLinking || isLinkedPending}
                                onClick={() => linkSuggestion(c.id, s.close_lead_id, s.display_name)}
                              >
                                {isLinking ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Link2 className="h-3 w-3 mr-1.5" />}
                                Verlinken
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
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

        {/* Confirm sync-all */}
        <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alle verlinkten Kunden neu syncen?</AlertDialogTitle>
              <AlertDialogDescription>
                Es werden {linked.length} Kunden synct — das kann ca. {Math.max(1, Math.round((linked.length * 2.5) / 60))} Minuten dauern.
                Sicher?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={runSyncAllLinked}>Starten</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Summary */}
        <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Sync abgeschlossen{summary.cancelled ? ' (abgebrochen)' : ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Erfolgreich: <span className="tabular-nums font-medium">{summary.ok}</span></div>
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Mit Warnung: <span className="tabular-nums font-medium">{summary.warn}</span></div>
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> Fehlgeschlagen: <span className="tabular-nums font-medium">{summary.err}</span></div>
              {summary.failedIds.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded border border-border bg-muted/20 p-2 text-xs">
                  {summary.failedIds.slice(0, 50).map((id) => {
                    const name = linked.find((l) => l.client_id === id)?.client?.name ?? id;
                    return <div key={id} className="truncate">{name}</div>;
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              {summary.failedIds.length > 0 && (
                <Button variant="outline" size="sm" onClick={retryFailed} disabled={syncing || syncAllRunning}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Erneut versuchen (max {MAX_BATCH})
                </Button>
              )}
              <Button size="sm" onClick={() => setSummaryOpen(false)}>Schließen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Stage 1: warn modal */}
        <AlertDialog open={resetStage === 1} onOpenChange={(o) => !o && setResetStage(0)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Alle Close-Daten zurücksetzen?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p><strong>Folgende Daten werden gelöscht:</strong> close_leads, close_contacts, close_opportunities, close_activities, close_tasks.</p>
                  <p><strong>NICHT gelöscht:</strong> close_link (Verknüpfungen bleiben bestehen).</p>
                  <p>Anschließend werden alle <strong>{stats.linked} verlinkten Kunden</strong> frisch gesynct. Dauer ca. {Math.max(1, Math.ceil(stats.linked * 2.5 / 60))} Min.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); setResetStage(2); }}>Weiter</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset Stage 2: type-to-confirm */}
        <AlertDialog open={resetStage === 2} onOpenChange={(o) => !o && setResetStage(0)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bestätigung erforderlich</AlertDialogTitle>
              <AlertDialogDescription>
                Bitte <code className="font-mono font-semibold">RESET CLOSE</code> eingeben, um fortzufahren.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              autoFocus
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET CLOSE"
              className="font-mono"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setResetConfirmText('')}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                disabled={resetConfirmText.trim() !== 'RESET CLOSE'}
                onClick={(e) => { e.preventDefault(); runResetAndResync(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Reset &amp; neu syncen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
