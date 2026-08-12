import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { formatValue } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, RefreshCw, Trash2, Users, Plus } from 'lucide-react';

interface Rep {
  id: string;
  name: string;
  rate: number;
  is_active: boolean;
}

interface Provision {
  id: string;
  rep_id: string | null;
  rep_name: string | null;
  client_name: string | null;
  invoice_number: string | null;
  amount_net: number;
  created_date: string | null;
  invoice_sent_date: string | null;
  payment_date: string | null;
  status: string;
  rate: number;
  commission_amount: number;
  is_payable: boolean;
  is_paid: boolean;
}

const STATUS_OPTIONS = [
  { value: 'ausstehend', label: 'Ausstehend' },
  { value: 'rechnung_gesendet', label: 'Rechnung gesendet' },
  { value: 'eingegangen', label: 'Eingegangen' },
  { value: 'storniert', label: 'Storniert' },
];

const statusLabel = (v: string) => STATUS_OPTIONS.find(s => s.value === v)?.label ?? v;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

export default function SalesProvisions() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('sales.provisions.manage');
  const { toast } = useToast();

  const [reps, setReps] = useState<Rep[]>([]);
  const [rows, setRows] = useState<Provision[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [newRep, setNewRep] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from('sales_provision_reps' as any).select('*').order('name'),
      supabase.from('sales_provisions' as any).select('*').order('created_date', { ascending: false }).limit(2000),
    ]);
    setReps((r as any as Rep[]) ?? []);
    setRows((p as any as Provision[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try {
      let offset = 0;
      let upserted = 0, matched = 0, unassigned = 0;
      // Batchweise syncen, damit die Edge Function nicht ins Idle-Timeout (150s) läuft
      for (let i = 0; i < 40; i++) {
        const { data, error } = await supabase.functions.invoke('sync-sales-provisions', {
          body: { days: 365, offset, limit: 60 },
        });
        if (error) throw error;
        upserted += data?.upserted ?? 0;
        matched += data?.matched_reps ?? 0;
        unassigned += data?.unassigned ?? 0;
        if (data?.done !== false || data?.next_offset == null) break;
        offset = data.next_offset;
      }
      toast({
        title: 'Sync abgeschlossen',
        description: `${upserted} Rechnungen verarbeitet, ${matched} zugeordnet, ${unassigned} ohne Vertriebler.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Sync fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };


  const patchRow = async (id: string, patch: Partial<Provision>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from('sales_provisions' as any).update(patch as any).eq('id', id);
    if (error) toast({ title: 'Speichern fehlgeschlagen', description: error.message, variant: 'destructive' });
  };

  const saveRep = async (id: string, patch: Partial<Rep>) => {
    setReps(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from('sales_provision_reps' as any).update(patch as any).eq('id', id);
    if (error) toast({ title: 'Speichern fehlgeschlagen', description: error.message, variant: 'destructive' });
  };

  const addRep = async () => {
    const name = newRep.trim();
    if (!name) return;
    const { error } = await supabase.from('sales_provision_reps' as any).insert({ name, rate: 0.15 } as any);
    if (error) {
      toast({ title: 'Anlegen fehlgeschlagen', description: error.message, variant: 'destructive' });
      return;
    }
    setNewRep('');
    load();
  };

  const deleteRep = async (id: string) => {
    const { error } = await supabase.from('sales_provision_reps' as any).delete().eq('id', id);
    if (error) toast({ title: 'Löschen fehlgeschlagen', description: error.message, variant: 'destructive' });
    else load();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => {
      if (tab === 'unassigned' && r.rep_id) return false;
      if (tab !== 'all' && tab !== 'unassigned' && r.rep_id !== tab) return false;
      if (!q) return true;
      return (
        (r.client_name ?? '').toLowerCase().includes(q) ||
        (r.invoice_number ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search]);

  const kpis = useMemo(() => {
    const sum = (f: (r: Provision) => boolean) =>
      filtered.filter(f).reduce((a, r) => a + Number(r.commission_amount || 0), 0);
    return {
      total: sum(() => true),
      payable: sum(r => r.is_payable && !r.is_paid),
      paid: sum(r => r.is_paid),
      open: sum(r => !r.is_payable),
      revenue: filtered.reduce((a, r) => a + Number(r.amount_net || 0), 0),
    };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provisionen"
        description="Qonto-Rechnungen, in Close zugeordnete Vertriebler und daraus berechnete Provisionen."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="mr-2 h-4 w-4" /> Vertriebler
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Vertriebler & Provisionssätze</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    {reps.map(rep => (
                      <div key={rep.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                        <Input
                          value={rep.name}
                          onChange={e => setReps(prev => prev.map(r => r.id === rep.id ? { ...r, name: e.target.value } : r))}
                          onBlur={e => saveRep(rep.id, { name: e.target.value })}
                          className="h-8 flex-1"
                        />
                        <Input
                          type="number" step="0.5" min="0" max="100"
                          value={(rep.rate * 100).toString()}
                          onChange={e => setReps(prev => prev.map(r => r.id === rep.id ? { ...r, rate: Number(e.target.value) / 100 } : r))}
                          onBlur={e => saveRep(rep.id, { rate: Number(e.target.value) / 100 })}
                          className="h-8 w-20 tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        <Switch checked={rep.is_active} onCheckedChange={v => saveRep(rep.id, { is_active: v })} />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteRep(rep.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2">
                      <Input
                        placeholder="Name wie in Close, z. B. Marcel Veit"
                        value={newRep}
                        onChange={e => setNewRep(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRep()}
                        className="h-8"
                      />
                      <Button size="sm" onClick={addRep}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button size="sm" onClick={runSync} disabled={syncing}>
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Synchronisieren
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Umsatz netto', value: kpis.revenue },
          { label: 'Provision gesamt', value: kpis.total },
          { label: 'Offen', value: kpis.open },
          { label: 'Auszahlbar', value: kpis.payable },
          { label: 'Ausgezahlt', value: kpis.paid },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatValue(k.value, 'currency')}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">Alle</TabsTrigger>
            {reps.filter(r => r.is_active).map(r => (
              <TabsTrigger key={r.id} value={r.id}>{r.name}</TabsTrigger>
            ))}
            <TabsTrigger value="unassigned">Ohne Zuordnung</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          placeholder="Kunde oder Rechnungsnummer …"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full sm:w-64"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Keine Provisionen vorhanden. Starte den Sync, um Qonto-Rechnungen zu übernehmen.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Betrag netto</TableHead>
                    <TableHead>Vertriebler</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Geldeingang</TableHead>
                    <TableHead className="text-right">Satz</TableHead>
                    <TableHead className="text-right">Provision</TableHead>
                    <TableHead>Auszahlbar</TableHead>
                    <TableHead>Ausgezahlt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(r.created_date)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.client_name ?? '–'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.invoice_number ?? '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(Number(r.amount_net), 'currency')}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={r.rep_id ?? 'none'}
                            onValueChange={v => {
                              const rep = reps.find(x => x.id === v);
                              patchRow(r.id, {
                                rep_id: v === 'none' ? null : v,
                                rep_name: rep?.name ?? null,
                                rate: rep?.rate ?? r.rate,
                                commission_amount: Math.round(Number(r.amount_net) * Number(rep?.rate ?? r.rate) * 100) / 100,
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">– keiner –</SelectItem>
                              {reps.map(rep => <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span>{r.rep_name ?? '–'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select value={r.status} onValueChange={v => patchRow(r.id, { status: v, is_payable: v === 'eingegangen' })}>
                            <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{statusLabel(r.status)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(r.payment_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(Number(r.rate) * 100).toFixed(1)} %</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatValue(Number(r.commission_amount), 'currency')}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_payable ? 'default' : 'outline'}>{r.is_payable ? 'Ja' : 'Nein'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_paid}
                          disabled={!canManage}
                          onCheckedChange={v => patchRow(r.id, { is_paid: v, paid_at: v ? new Date().toISOString().slice(0, 10) : null } as any)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
