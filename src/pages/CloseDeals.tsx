import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

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
  raw: any;
}

const STATUS_TYPE_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  won: 'bg-success/20 text-success',
  lost: 'bg-destructive/20 text-destructive',
};

export default function CloseDeals() {
  const [deals, setDeals] = useState<CloseDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<CloseDeal | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const loadFromCache = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('close_opportunities')
      .select('*')
      .order('date_updated', { ascending: false })
      .limit(1000);
    if (error) toast.error('Fehler beim Laden: ' + error.message);
    else {
      setDeals((data || []) as CloseDeal[]);
      if (data?.[0]) setLastSync((data[0] as any).synced_at);
    }
    setLoading(false);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      let skip = 0;
      const limit = 100;
      let total = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('close-proxy', {
          body: { endpoint: `/opportunity/?_limit=${limit}&_skip=${skip}`, method: 'GET' },
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
        if (skip > 5000) break;
      }
      toast.success(`${total} Deals synchronisiert`);
      await loadFromCache();
    } catch (e: any) {
      toast.error('Sync-Fehler: ' + (e.message || String(e)));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadFromCache(); }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return deals;
    return deals.filter(d => (d.status_type || '').toLowerCase() === statusFilter);
  }, [deals, statusFilter]);

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
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={sync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisiere…' : 'Sync'}
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Deal</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Wert</th>
              <th className="text-left px-4 py-3 font-medium">Pipeline</th>
              <th className="text-left px-4 py-3 font-medium">Lead</th>
              <th className="text-left px-4 py-3 font-medium">Erstellt am</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-12">
                Keine Deals gefunden. Klicke auf "Sync".
              </td></tr>
            ) : (
              filtered.map(deal => (
                <tr
                  key={deal.id}
                  onClick={() => setSelected(deal)}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between">
                  <span>{selected.lead_name || 'Deal'}</span>
                  {selected.lead_id && (
                    <a
                      href={`https://app.close.com/lead/${selected.lead_id}/`}
                      target="_blank" rel="noreferrer"
                      className="text-primary hover:underline text-sm flex items-center gap-1"
                    >
                      In Close öffnen <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-muted-foreground text-xs">Status</div>
                    <Badge className={STATUS_TYPE_COLORS[selected.status_type || ''] || ''}>
                      {selected.status_label || '—'}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Wert</div>
                    <div className="font-medium font-mono">{fmtMoney(selected)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Pipeline</div>
                    <div className="font-medium">{selected.pipeline_name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Confidence</div>
                    <div className="font-medium">{selected.raw?.confidence ?? '—'}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Erstellt</div>
                    <div className="font-medium">{fmtDate(selected.date_created)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Aktualisiert</div>
                    <div className="font-medium">{fmtDate(selected.date_updated)}</div>
                  </div>
                </div>

                {selected.raw?.note && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Notizen</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.raw.note}</p>
                  </div>
                )}

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw JSON</summary>
                  <pre className="mt-2 p-3 bg-muted rounded text-[10px] overflow-auto max-h-96">{JSON.stringify(selected.raw, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
