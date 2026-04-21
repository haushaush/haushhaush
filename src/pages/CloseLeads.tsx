import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, ExternalLink, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { SortableTh } from '@/components/close/SortableTh';

interface CloseLead {
  id: string;
  display_name: string | null;
  status_label: string | null;
  status_id: string | null;
  contacts: any[];
  date_created: string | null;
  date_updated: string | null;
  raw: any;
}

interface LeadStatus {
  id: string;
  label: string;
}

export default function CloseLeads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<CloseLead[]>([]);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<CloseLead | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('date_updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadFromCache = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('close_leads')
      .select('*')
      .order('date_updated', { ascending: false })
      .limit(1000);
    if (error) toast.error('Fehler beim Laden: ' + error.message);
    else {
      setLeads((data || []) as CloseLead[]);
      if (data?.[0]) setLastSync((data[0] as any).synced_at);
    }
    setLoading(false);
  };

  const loadStatuses = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('close-proxy', {
        body: { endpoint: '/status/lead/', method: 'GET' },
      });
      if (error || data?.error) return;
      const items = (data?.data || []).map((s: any) => ({ id: s.id, label: s.label }));
      setStatuses(items);
    } catch {}
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
          body: { endpoint: `/lead/?_limit=${limit}&_skip=${skip}`, method: 'GET' },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const items = data?.data || [];
        if (items.length === 0) break;

        const rows = items.map((l: any) => ({
          id: l.id,
          display_name: l.display_name || l.name || null,
          status_label: l.status_label || null,
          status_id: l.status_id || null,
          description: l.description || null,
          url: l.url || null,
          contacts: l.contacts || [],
          custom: l.custom || {},
          addresses: l.addresses || [],
          raw: l,
          date_created: l.date_created || null,
          date_updated: l.date_updated || null,
          synced_at: new Date().toISOString(),
        }));

        const { error: upErr } = await supabase.from('close_leads').upsert(rows, { onConflict: 'id' });
        if (upErr) throw upErr;
        total += items.length;

        hasMore = data?.has_more === true;
        skip += limit;
        if (skip > 5000) break;
      }
      toast.success(`${total} Leads synchronisiert`);
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
    const q = search.toLowerCase().trim();
    let result = leads;
    if (q) result = result.filter(l => (l.display_name || '').toLowerCase().includes(q));
    if (statusFilter !== 'all') result = result.filter(l => l.status_id === statusFilter);

    const getVal = (l: CloseLead): any => {
      if (sortField === 'contacts') return l.contacts?.length || 0;
      return (l as any)[sortField] ?? '';
    };
    return [...result].sort((a, b) => {
      const valA = getVal(a);
      const valB = getVal(b);
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [leads, search, statusFilter, sortField, sortDir]);

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(parseISO(d), 'dd.MM.yyyy HH:mm', { locale: de }); } catch { return '—'; }
  };

  const handleAlsKunde = () => {
    if (!selected) return;
    const c = selected.contacts?.[0] || {};
    const params = new URLSearchParams({
      name: selected.display_name || '',
      email: c.emails?.[0]?.email || '',
      phone: c.phones?.[0]?.phone || '',
    });
    navigate(`/kunden?new=1&${params.toString()}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Close Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lastSync ? `Zuletzt synchronisiert: ${fmtDate(lastSync)}` : 'Noch nicht synchronisiert'}
          </p>
        </div>
        <Button onClick={sync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisiere…' : 'Sync'}
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Lead suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {statuses.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} Lead{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <SortableTh field="display_name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Lead Name</SortableTh>
              <SortableTh field="status_label" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Status</SortableTh>
              <SortableTh field="contacts" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Kontakte</SortableTh>
              <SortableTh field="date_created" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Erstellt am</SortableTh>
              <SortableTh field="date_updated" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Zuletzt aktualisiert</SortableTh>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-12">
                Keine Leads gefunden. Klicke auf "Sync", um Leads aus Close zu laden.
              </td></tr>
            ) : (
              filtered.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{lead.display_name || '—'}</td>
                  <td className="px-4 py-3">
                    {lead.status_label && <Badge variant="secondary">{lead.status_label}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.contacts?.length || 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(lead.date_created)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(lead.date_updated)}</td>
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
                  <span>{selected.display_name || 'Lead'}</span>
                  {selected.raw?.url && (
                    <a href={selected.raw.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1">
                      Open in Close <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Status</div>
                    <div className="font-medium">{selected.status_label || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Erstellt</div>
                    <div className="font-medium">{fmtDate(selected.date_created)}</div>
                  </div>
                </div>

                {selected.contacts && selected.contacts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Kontakte</h3>
                    <div className="space-y-2">
                      {selected.contacts.map((c: any, i: number) => (
                        <div key={i} className="border border-border rounded-lg p-3 text-sm">
                          <div className="font-medium">{c.name || c.display_name || 'Unbenannt'}</div>
                          {c.title && <div className="text-muted-foreground text-xs">{c.title}</div>}
                          {c.emails?.map((e: any, j: number) => (
                            <div key={j} className="text-muted-foreground text-xs">📧 {e.email}</div>
                          ))}
                          {c.phones?.map((p: any, j: number) => (
                            <div key={j} className="text-muted-foreground text-xs">📞 {p.phone}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.raw?.description && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Beschreibung</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.raw.description}</p>
                  </div>
                )}

                <Button onClick={handleAlsKunde} className="w-full">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Als Kunde anlegen
                </Button>

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
