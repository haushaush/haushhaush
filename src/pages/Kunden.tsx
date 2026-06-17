import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Users, RefreshCw, Loader2, Sparkles, Cloud, ChevronDown, Settings as SettingsIcon, Link2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Lead': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Done': 'bg-muted text-muted-foreground',
};
const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive' };

interface ClientRow {
  id: string;
  name: string;
  vor_nachname?: string | null;
  email: string | null;
  phone: string | null;
  website_url?: string | null;
  branche_id: string | null;
  branche: string | null;
  unternehmen_id: string | null;
  unternehmen?: { display_name: string } | null;
  meta_account_id?: string | null;
  kundenstatus: string;
  ampelstatus: string;
  zahlstatus?: string | null;
  projekttyp?: string[] | string | null;
  laufzeit?: string | null;
  startdatum?: string | null;
  enddatum?: string | null;
  deadline?: string | null;
  laufzeit_in_14t?: boolean | null;
  clv?: number | null;
  gesamt_saldo?: number | null;
  ads_budget?: number | null;
  cash_collect_offen?: number | null;
  meta_kosten?: number | null;
  crm_kosten?: number | null;
  superchat_kosten?: number | null;
  website_kosten?: number | null;
  notes?: string | null;
  notion_id?: string | null;
  notion_url?: string | null;
  deal_count?: number;
  deal_total?: number;
}

export default function Kunden() {
  const navigate = useNavigate();
  const { isAdminOrManager } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBranche, setFilterBranche] = useState<string>('all');
  const [filterUnternehmen, setFilterUnternehmen] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [syncing, setSyncing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [closeSyncing, setCloseSyncing] = useState(false);
  const [confirmResync, setConfirmResync] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ds }] = await Promise.all([
      supabase.from('clients').select(`
        id, name, vor_nachname, email, phone, website_url,
        branche_id, branche, unternehmen_id, meta_account_id,
        kundenstatus, ampelstatus, zahlstatus,
        projekttyp, laufzeit, startdatum, enddatum, deadline, laufzeit_in_14t,
        clv, gesamt_saldo, ads_budget, cash_collect_offen,
        meta_kosten, crm_kosten, superchat_kosten, website_kosten,
        notes, notion_id, notion_url,
        unternehmen:unternehmen_id(display_name)
      `).is('deleted_at', null).order('name'),
      supabase.from('close_deals').select('client_id, wert_eur'),
    ]);
    const aggMap = new Map<string, { count: number; total: number }>();
    (ds || []).forEach((d: any) => {
      if (!d.client_id) return;
      const cur = aggMap.get(d.client_id) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(d.wert_eur || 0);
      aggMap.set(d.client_id, cur);
    });
    const rows: ClientRow[] = ((cs || []) as any[]).map(c => ({
      ...c,
      deal_count: aggMap.get(c.id)?.count || 0,
      deal_total: aggMap.get(c.id)?.total || 0,
    }));
    setClients(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data, error } = await supabase.from('clients').insert({
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      kundenstatus: 'Lead' as any,
    }).select('id').single();
    if (error) { toast.error('Fehler', { description: error.message }); return; }
    toast.success('Kunde angelegt');
    setDialogOpen(false);
    setForm({ name: '', email: '', phone: '' });
    if (data?.id) navigate(`/kunden/${data.id}`);
  };

  const handleNotionSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Notion-Import läuft…');
    try {
      const { data, error } = await supabase.functions.invoke('sync-notion', { body: { target: 'kunden' } });
      if (error) throw error;
      toast.success(`${data?.synced?.kunden ?? '?'} Kunden synchronisiert`, { id: toastId });
      await load();
    } catch (e: any) {
      toast.error(`Sync fehlgeschlagen: ${e.message}`, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const handleAutoLink = async () => {
    setLinking(true);
    const toastId = toast.loading('Auto-Zuordnen läuft…');
    try {
      const { data, error } = await supabase.functions.invoke('auto-link-all', {
        body: { target: 'all', only_unmatched: true }
      });
      if (error) throw error;
      const s = data?.stats || {};
      const onepage = s.onepage?.matched_by_name || 0;
      const showcase = (s.showcase?.matched_by_account || 0) + (s.showcase?.matched_by_name || 0);
      const metaAds = (s.meta_ads?.matched_by_account || 0) + (s.meta_ads?.matched_by_name || 0);
      const projects = s.projects?.matched_by_name || 0;
      const total = onepage + showcase + metaAds + projects;
      toast.success(`${total} Datensätze automatisch zugeordnet`, {
        id: toastId,
        description: [
          s.onepage && `Onepage: ${onepage}`,
          s.showcase && `Showcase: ${showcase}`,
          s.meta_ads && `Meta Ads: ${metaAds}`,
          s.projects && `Projects: ${projects}`,
        ].filter(Boolean).join(' · '),
      });
      await load();
    } catch (e: any) {
      toast.error(`Fehler: ${e.message}`, { id: toastId });
    } finally {
      setLinking(false);
    }
  };

  const MAX_BATCH = 30;

  const handleCloseMatchAll = async () => {
    setCloseSyncing(true);
    const toastId = toast.loading('Matche unverlinkte Kunden mit Close…');
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('sync-close-link');
      if (error) throw error;
      const dur = ((Date.now() - start) / 1000).toFixed(1);
      toast.success(`Matching fertig in ${dur}s · ${data?.matched ?? 0} neu, ${data?.unmatched ?? 0} ohne Treffer`, { id: toastId });
    } catch (e: any) {
      toast.error(`Matching fehlgeschlagen: ${e.message}`, {
        id: toastId,
        action: { label: 'Details', onClick: () => navigate('/einstellungen?tab=verknuepfungen#close') },
      });
    } finally {
      setCloseSyncing(false);
    }
  };

  const handleCloseResyncAll = async () => {
    setConfirmResync(false);
    const { data: links } = await supabase.from('close_link' as any).select('client_id');
    const ids = ((links || []) as any[]).map((l) => l.client_id);
    if (ids.length === 0) { toast.info('Keine verlinkten Kunden vorhanden.'); return; }
    if (ids.length > MAX_BATCH) {
      toast.error(`Max ${MAX_BATCH} pro Run, bitte in Batches aufteilen.`, {
        action: { label: 'Einstellungen', onClick: () => navigate('/einstellungen?tab=verknuepfungen#close') },
      });
      return;
    }
    setCloseSyncing(true);
    const toastId = toast.loading(`Syncing 0 von ${ids.length}…`);
    const start = Date.now();
    let tick = 0;
    const ticker = setInterval(() => {
      tick = Math.min(tick + 1, ids.length - 1);
      toast.loading(`Syncing ${tick} von ${ids.length}…`, { id: toastId });
    }, 1200);
    try {
      const { data, error } = await supabase.functions.invoke('sync-close-batch', { body: { client_ids: ids } });
      clearInterval(ticker);
      if (error) throw error;
      const ok = data?.success?.length ?? 0;
      const failed = data?.failed?.length ?? 0;
      const dur = ((Date.now() - start) / 1000).toFixed(1);
      if (failed === 0) {
        toast.success(`${ok} Kunden synct in ${dur}s`, { id: toastId });
      } else {
        toast.error(`${ok} OK, ${failed} Fehler in ${dur}s`, {
          id: toastId,
          action: { label: 'Details', onClick: () => navigate('/einstellungen?tab=verknuepfungen#close') },
        });
      }
    } catch (e: any) {
      clearInterval(ticker);
      toast.error(`Bulk-Sync fehlgeschlagen: ${e.message}`, { id: toastId });
    } finally {
      setCloseSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || c.kundenstatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [clients, search, filterStatus]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: clients.length };
    clients.forEach(c => { m[c.kundenstatus] = (m[c.kundenstatus] || 0) + 1; });
    return m;
  }, [clients]);

  const TAB_STATUSES = ['all', 'Lead', 'Onboarding', 'In Betreuung', 'Done'];

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold leading-tight">Kunden</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{clients.length} Personen</p>
          </div>
        </div>
        {isAdminOrManager && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAutoLink} disabled={linking}>
              {linking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Auto-Zuordnen
            </Button>
            <Button variant="outline" size="sm" onClick={handleNotionSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Notion-Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={closeSyncing}>
                  {closeSyncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5 mr-1.5" />}
                  Close-Sync
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={handleCloseMatchAll} disabled={closeSyncing}>
                  <Link2 className="h-3.5 w-3.5 mr-2" />
                  Alle nicht-verlinkten matchen
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setConfirmResync(true)} disabled={closeSyncing}>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Alle verlinkten neu syncen
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/einstellungen?tab=verknuepfungen#close-sync-card')}
                  disabled={closeSyncing}
                  className="text-destructive focus:text-destructive"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                  Daten zurücksetzen &amp; neu holen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/einstellungen?tab=verknuepfungen#close-sync-card')}>
                  <SettingsIcon className="h-3.5 w-3.5 mr-2" />
                  Sync-Einstellungen öffnen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confirmResync} onOpenChange={setConfirmResync}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Alle verlinkten Kunden neu syncen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Das kann mehrere Minuten dauern. Bei mehr als {MAX_BATCH} verlinkten Kunden bitte den Bereich „Einstellungen → Verknüpfungen" nutzen und in Batches arbeiten.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCloseResyncAll}>Sync starten</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Neuer Kunde</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Kunde anlegen</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <Button type="submit" className="w-full">Anlegen</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {TAB_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? 'Alle' : s}
            <span className={`ml-1.5 text-xs ${filterStatus === s ? 'text-primary-foreground/70' : 'text-muted-foreground/60'}`}>
              {statusCounts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-9" placeholder="Name oder Email…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-full text-center py-8">Keine Kunden gefunden.</p>
        ) : filtered.map(c => (
          <div
            key={c.id}
            onClick={() => navigate(`/kunden/${c.id}`)}
            className="group relative text-left rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.unternehmen?.display_name || c.branche || '—'}
                </p>
              </div>
              <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${AMPEL_DOT[c.ampelstatus] || 'bg-muted'}`} aria-hidden />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <Badge variant="secondary" className={STATUS_STYLES[c.kundenstatus] || 'bg-muted'}>{c.kundenstatus}</Badge>
              <span className="text-muted-foreground tabular-nums">
                {c.deal_count} Deals · €{(c.deal_total || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
