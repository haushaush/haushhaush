import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Link2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

type Client = { id: string; name: string; email: string | null };
type CloseLead = { id: string; display_name?: string; name?: string; description?: string };

export default function CloseSync() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pickClient, setPickClient] = useState<Client | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: links } = await supabase.from('close_link' as any).select('client_id');
    const linkedIds = new Set((links || []).map((l: any) => l.client_id));
    const { data: cs } = await supabase
      .from('clients')
      .select('id, name, email')
      .order('name', { ascending: true });
    setClients((cs || []).filter((c) => !linkedIds.has(c.id)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerFullSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-close');
      if (error) throw error;
      toast.success(`Sync OK · ${data?.newly_matched ?? 0} neu, ${data?.opps_upserted ?? 0} Opps, ${data?.activities_upserted ?? 0} Akt.`);
      await load();
    } catch (e: any) {
      toast.error(`Sync fehlgeschlagen: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Close-Sync · Unmatched Kunden</h1>
          <p className="text-sm text-muted-foreground">Kunden ohne Verknüpfung zu einem Close-Lead.</p>
        </div>
        <Button onClick={triggerFullSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Vollständigen Sync starten
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{loading ? '…' : clients.length} unverlinkte Kunden</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 mx-auto animate-spin" /></div>
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Alle Kunden sind verlinkt.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {clients.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || 'keine E-Mail'}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPickClient(c)}>
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Manuell verlinken
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ManualLinkModal client={pickClient} onClose={(linked) => { setPickClient(null); if (linked) load(); }} />
    </div>
  );
}

function ManualLinkModal({ client, onClose }: { client: Client | null; onClose: (linked: boolean) => void }) {
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
