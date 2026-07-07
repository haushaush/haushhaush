import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Link2, Link2Off, RefreshCw, Search, CheckCircle2, ExternalLink, Users, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

type LinkRow = {
  id: string;
  qonto_client_name: string;
  qonto_client_id: string | null;
  client_id: string | null;
  client_name: string | null;
  match_type: string;
  confidence: number | null;
  is_confirmed: boolean;
  invoice_count: number;
  total_amount: number;
  updated_at: string;
};

type Stats = {
  total: number; auto_linked: number; manual_linked: number;
  confirmed: number; suggested: number; ambiguous: number; unlinked: number;
};

type Filter = 'all' | 'linked' | 'unlinked' | 'suggested' | 'ambiguous';

const eur = (n: number | null | undefined) =>
  '€' + (Number(n || 0)).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function MatchBadge({ row }: { row: LinkRow }) {
  if (row.client_id && row.is_confirmed && row.match_type === 'auto_exact')
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">Automatisch</Badge>;
  if (row.client_id && row.is_confirmed)
    return <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Manuell</Badge>;
  if (row.match_type === 'suggested')
    return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">Vorschlag</Badge>;
  if (row.match_type === 'ambiguous')
    return <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">Mehrdeutig</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Nicht verknüpft</Badge>;
}

function Kpi({ label, value, icon: Icon }: { label: string; value: string | number; icon?: any }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>{Icon && <Icon className="h-3.5 w-3.5" />}
      </div>
      <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
    </CardContent></Card>
  );
}

export function QontoVerknuepfungen() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [dialogRow, setDialogRow] = useState<LinkRow | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    if (isAdmin) { setCanManage(true); return; }
    (async () => {
      const { data } = await (supabase.rpc as any)('user_has_permission', {
        target_user_id: (await supabase.auth.getUser()).data.user?.id,
        requested_permission_key: 'finanzen.manage',
      });
      setCanManage(!!data);
    })();
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      (supabase.rpc as any)('qonto_client_link_rows'),
      (supabase.rpc as any)('qonto_client_link_stats'),
    ]);
    setRows((r.data as LinkRow[]) || []);
    setStats((s.data as Stats) || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAutoLink = async () => {
    setRunning(true);
    try {
      const { data, error } = await (supabase.rpc as any)('qonto_auto_link_clients');
      if (error) throw error;
      toast({ title: 'Automatischer Abgleich abgeschlossen',
        description: `${data?.auto_exact ?? 0} auto · ${data?.suggested ?? 0} Vorschläge · ${data?.ambiguous ?? 0} mehrdeutig · ${data?.unlinked ?? 0} offen` });
      await load();
    } catch (e: any) {
      toast({ title: 'Abgleich fehlgeschlagen', description: e?.message || String(e), variant: 'destructive' });
    } finally { setRunning(false); }
  };

  const unlink = async (row: LinkRow) => {
    const { error } = await supabase.from('qonto_client_links' as any)
      .update({ client_id: null, match_type: 'unlinked', is_confirmed: false, confidence: null })
      .eq('id', row.id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Verknüpfung gelöst' });
    load();
  };

  const confirmSuggestion = async (row: LinkRow) => {
    const { error } = await supabase.from('qonto_client_links' as any)
      .update({ is_confirmed: true, match_type: 'manual' })
      .eq('id', row.id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Vorschlag bestätigt' });
    load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'linked' && !r.client_id) return false;
      if (filter === 'unlinked' && r.client_id) return false;
      if (filter === 'suggested' && r.match_type !== 'suggested') return false;
      if (filter === 'ambiguous' && r.match_type !== 'ambiguous') return false;
      if (q && !`${r.qonto_client_name} ${r.client_name || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Qonto-Kunden" value={stats?.total ?? 0} icon={Users} />
        <Kpi label="Automatisch" value={stats?.auto_linked ?? 0} icon={CheckCircle2} />
        <Kpi label="Manuell" value={stats?.manual_linked ?? 0} icon={Link2} />
        <Kpi label="Vorschläge" value={stats?.suggested ?? 0} icon={HelpCircle} />
        <Kpi label="Mehrdeutig" value={stats?.ambiguous ?? 0} icon={HelpCircle} />
        <Kpi label="Nicht verknüpft" value={stats?.unlinked ?? 0} icon={Link2Off} />
      </div>

      <Card><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Qonto- oder Hub-Kunde suchen…" className="pl-8" />
          </div>
          <Select value={filter} onValueChange={v => setFilter(v as Filter)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="linked">Verknüpft</SelectItem>
              <SelectItem value="unlinked">Nicht verknüpft</SelectItem>
              <SelectItem value="suggested">Vorschläge</SelectItem>
              <SelectItem value="ambiguous">Mehrdeutig</SelectItem>
            </SelectContent>
          </Select>
          {canManage && (
            <Button variant="outline" size="sm" onClick={runAutoLink} disabled={running}>
              <RefreshCw className={`h-4 w-4 mr-1 ${running ? 'animate-spin' : ''}`} />
              Automatisch abgleichen
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qonto-Kunde</TableHead>
                  <TableHead>Hub-Kunde</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rechnungen</TableHead>
                  <TableHead className="text-right">Summe</TableHead>
                  <TableHead className="text-right w-[280px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Keine Einträge{rows.length === 0 && canManage ? ' – klicke „Automatisch abgleichen".' : '.'}
                  </TableCell></TableRow>
                )}
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.qonto_client_name}</TableCell>
                    <TableCell>
                      {r.client_id ? (
                        <Link to={`/kunden/${r.client_id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                          {r.client_name || 'Kunde öffnen'}<ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : <span className="text-muted-foreground">–</span>}
                    </TableCell>
                    <TableCell><MatchBadge row={r} /></TableCell>
                    <TableCell className="text-right tabular-nums">{r.invoice_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(r.total_amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {canManage && r.match_type === 'suggested' && !r.is_confirmed && (
                          <Button size="sm" variant="secondary" onClick={() => confirmSuggestion(r)}>Bestätigen</Button>
                        )}
                        {canManage && (
                          <Button size="sm" variant="outline" onClick={() => setDialogRow(r)}>
                            {r.client_id ? 'Ändern' : 'Verknüpfen'}
                          </Button>
                        )}
                        {canManage && r.client_id && (
                          <Button size="sm" variant="ghost" onClick={() => unlink(r)} title="Verknüpfung lösen">
                            <Link2Off className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <LinkDialog row={dialogRow} onClose={() => setDialogRow(null)} onSaved={() => { setDialogRow(null); load(); }} />
    </div>
  );
}

function LinkDialog({ row, onClose, onSaved }:
  { row: LinkRow | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<{ client_id: string; client_name: string; similarity: number }[]>([]);
  const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setQ('');
    setSearchResults([]);
    (async () => {
      const { data } = await (supabase.rpc as any)('qonto_client_link_suggestions', { p_link_id: row.id, p_limit: 8 });
      setSuggestions((data as any[]) || []);
    })();
  }, [row]);

  useEffect(() => {
    if (!row) return;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setSearchResults([]); return; }
      const { data } = await supabase.from('clients').select('id,name').ilike('name', `%${q.trim()}%`).order('name').limit(20);
      setSearchResults((data as any[]) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, row]);

  const link = async (client_id: string) => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase.from('qonto_client_links' as any)
      .update({ client_id, match_type: 'manual', is_confirmed: true, confidence: 1 })
      .eq('id', row.id);
    setSaving(false);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Verknüpft' });
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Qonto-Kunde verknüpfen</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="text-sm">
              <div className="text-muted-foreground">Qonto-Kunde</div>
              <div className="font-medium">{row.qonto_client_name}</div>
            </div>

            {suggestions.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Vorschläge</div>
                <div className="space-y-1">
                  {suggestions.map(s => (
                    <button key={s.client_id} onClick={() => link(s.client_id)} disabled={saving}
                      className="w-full text-left px-3 py-2 rounded border hover:bg-accent flex items-center justify-between">
                      <span>{s.client_name}</span>
                      <Badge variant="outline">{Math.round(s.similarity * 100)} %</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs text-muted-foreground mb-1">Hub-Kunden suchen</div>
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Name eingeben…" />
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                  {searchResults.map(c => (
                    <button key={c.id} onClick={() => link(c.id)} disabled={saving}
                      className="w-full text-left px-3 py-2 rounded border hover:bg-accent">
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
