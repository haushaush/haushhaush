import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { SortableTh } from '@/components/close/SortableTh';
import { CloseDealDetailPanel } from '@/components/close/CloseDealDetailPanel';

interface CloseDeal {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  status_label: string | null;
  status_type: string | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
  value: number | null;
  value_formatted: string | null;
  value_currency: string | null;
  date_created: string | null;
  date_updated: string | null;
  note?: string | null;
}

interface OppStatus {
  id: string;
  label: string;
  type: string;
}

const STATUS_TYPE_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  won: 'bg-success/20 text-success',
  lost: 'bg-destructive/20 text-destructive',
};

export default function CloseDeals() {
  const [deals, setDeals] = useState<CloseDeal[]>([]);
  const [statuses, setStatuses] = useState<OppStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('date_updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadFromCache = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('close_opportunities')
      .select('*')
      .order('date_updated', { ascending: false })
      .range(0, 4999);
    if (error) toast.error('Fehler beim Laden: ' + error.message);
    else {
      setDeals((data || []) as CloseDeal[]);
      if (data?.[0]) setLastSync((data[0] as any).synced_at);
    }
    setLoading(false);
  };

  const loadStatuses = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('close-proxy', {
        body: { endpoint: '/status/opportunity/', method: 'GET' },
      });
      if (error || data?.error) return;
      const items = (data?.data || []).map((s: any) => ({ id: s.id, label: s.label, type: s.type }));
      setStatuses(items);
    } catch {}
  };

  const sync = async () => {
    setSyncing(true);
    try {
      let skip = 0;
      const limit = 200;
      const maxRecords = 5000;
      let total = 0;
      let hasMore = true;
      let pageCount = 0;
      while (hasMore && total < maxRecords) {
        pageCount++;
        const { data, error } = await supabase.functions.invoke('close-proxy', {
          body: { endpoint: `/opportunity/?_limit=${limit}&_skip=${skip}&_order_by=-date_updated`, method: 'GET' },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const items = data?.data || [];
        if (items.length === 0) break;

        const rows = items.map((o: any) => ({
          id: o.id,
          lead_id: o.lead_id || null,
          lead_name: o.lead_name || null,
          status_label: o.status_label || null,
          status_type: o.status_type || null,
          pipeline_id: o.pipeline_id || null,
          pipeline_name: o.pipeline_name || null,
          value: typeof o.value === 'number' ? o.value / 100 : null,
          value_formatted: o.value_formatted || null,
          value_currency: o.value_currency || null,
          value_period: o.value_period || null,
          note: o.note || null,
          confidence: o.confidence ?? null,
          date_won: o.date_won || null,
          date_lost: o.date_lost || null,
          raw: o,
          date_created: o.date_created || null,
          date_updated: o.date_updated || null,
          synced_at: new Date().toISOString(),
        }));

        const { error: upErr } = await supabase.from('close_opportunities').upsert(rows, { onConflict: 'id' });
        if (upErr) throw upErr;
        total += items.length;

        hasMore = data?.has_more === true;
        skip += limit;

        if (pageCount % 3 === 0) {
          toast.info(`Sync läuft… ${total} Deals geladen`, { id: 'deal-sync-progress' });
        }
      }
      toast.success(`${total} Deals synchronisiert`);
      await loadFromCache();
    } catch (e: any) {
      toast.error('Sync-Fehler: ' + (e.message || String(e)));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadFromCache(); loadStatuses(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let result = deals;
    if (statusFilter !== 'all') {
      // Match by status type (active/won/lost) OR specific status id
      result = result.filter(d =>
        (d.status_type || '').toLowerCase() === statusFilter ||
        (d as any).status_id === statusFilter ||
        d.status_label === statuses.find(s => s.id === statusFilter)?.label
      );
    }
    const getVal = (d: CloseDeal): any => {
      if (sortField === 'value') return d.value ?? 0;
      return (d as any)[sortField] ?? '';
    };
    return [...result].sort((a, b) => {
      const valA = getVal(a);
      const valB = getVal(b);
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [deals, statusFilter, sortField, sortDir, statuses]);

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return '—'; }
  };

  const fmtMoney = (d: CloseDeal) => {
    if (d.value_formatted) return d.value_formatted;
    if (d.value == null) return '—';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency', currency: d.value_currency || 'EUR', maximumFractionDigits: 0,
    }).format(d.value);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Close Deals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lastSync ? `Zuletzt synchronisiert: ${format(parseISO(lastSync), 'dd.MM.yyyy HH:mm', { locale: de })}` : 'Noch nicht synchronisiert'}
          </p>
        </div>
        <Button onClick={sync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisiere…' : 'Sync'}
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Active (alle)</SelectItem>
            <SelectItem value="won">Won (alle)</SelectItem>
            <SelectItem value="lost">Lost (alle)</SelectItem>
            {statuses.length > 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground border-t border-border mt-1">Spezifische Status</div>
            )}
            {statuses.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} Deal{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <SortableTh field="lead_name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Deal</SortableTh>
              <SortableTh field="status_label" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Status</SortableTh>
              <SortableTh field="value" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right">Wert</SortableTh>
              <SortableTh field="pipeline_name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Pipeline</SortableTh>
              <SortableTh field="lead_name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Lead</SortableTh>
              <SortableTh field="date_created" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Erstellt am</SortableTh>
              <SortableTh field="date_updated" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Zuletzt aktualisiert</SortableTh>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-12">
                Keine Deals gefunden. Klicke auf "Sync".
              </td></tr>
            ) : (
              filtered.map(deal => (
                <tr
                  key={deal.id}
                  onClick={() => setSelectedId(deal.id)}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{deal.raw?.note?.split('\n')[0]?.slice(0, 60) || deal.lead_name || 'Deal'}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_TYPE_COLORS[deal.status_type || ''] || 'bg-muted text-muted-foreground'}>
                      {deal.status_label || deal.status_type || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMoney(deal)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.pipeline_name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.lead_name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(deal.date_created)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(deal.date_updated)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CloseDealDetailPanel
        dealId={selectedId}
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </div>
  );
}
