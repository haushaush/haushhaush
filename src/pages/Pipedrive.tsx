import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { TrendingUp, Plug, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TAB_LABELS: Record<string, string> = {
  uebersicht: 'Übersicht',
  deals: 'Deals',
  personen: 'Personen',
  pipelines: 'Pipelines',
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tagen`;
}

export default function Pipedrive() {
  const { tab = 'uebersicht' } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  // ─── Load all accounts ───
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['pipedrive-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipedrive_accounts' as any)
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      return (data ?? []) as any[];
    },
  });

  // ─── Resolve active account from URL or localStorage ───
  const urlAccountId = searchParams.get('account');
  const storedAccountId = typeof window !== 'undefined' ? localStorage.getItem('pipedrive-active-account') : null;
  const accountId = urlAccountId || storedAccountId || accounts?.[0]?.id || null;
  const activeAccount = useMemo(
    () => accounts?.find(a => a.id === accountId) || null,
    [accounts, accountId]
  );

  // Persist + sync URL
  useEffect(() => {
    if (!accountId) return;
    localStorage.setItem('pipedrive-active-account', accountId);
    if (!urlAccountId) {
      const next = new URLSearchParams(searchParams);
      next.set('account', accountId);
      setSearchParams(next, { replace: true });
    }
  }, [accountId, urlAccountId, searchParams, setSearchParams]);

  // ─── Account-scoped data ───
  const { data: deals } = useQuery({
    queryKey: ['pipedrive-deals', accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipedrive_deals')
        .select('*')
        .eq('account_id', accountId!)
        .order('pipedrive_updated_at', { ascending: false });
      return data || [];
    },
    enabled: !!accountId,
  });

  const { data: persons } = useQuery({
    queryKey: ['pipedrive-persons', accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipedrive_persons')
        .select('*')
        .eq('account_id', accountId!)
        .order('synced_at', { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!accountId,
  });

  const { data: pipelines } = useQuery({
    queryKey: ['pipedrive-pipelines', accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipedrive_pipelines')
        .select('*')
        .eq('account_id', accountId!);
      return data || [];
    },
    enabled: !!accountId,
  });

  const handleSync = async () => {
    if (!activeAccount) return;
    setSyncing(true);
    const tid = toast.loading(`Synchronisiere ${activeAccount.name}…`);
    const { data, error } = await supabase.functions.invoke('pipedrive-sync-account', {
      body: { accountId: activeAccount.id },
    });
    toast.dismiss(tid);
    setSyncing(false);
    if (error || !(data as any)?.ok) {
      toast.error(`Sync fehlgeschlagen: ${(data as any)?.message || error?.message || 'Unbekannt'}`);
    } else {
      const s = (data as any).summary;
      toast.success(`✓ ${s.deals} Deals · ${s.persons} Personen · ${s.pipelines} Pipelines`);
      queryClient.invalidateQueries({ queryKey: ['pipedrive-deals', activeAccount.id] });
      queryClient.invalidateQueries({ queryKey: ['pipedrive-persons', activeAccount.id] });
      queryClient.invalidateQueries({ queryKey: ['pipedrive-pipelines', activeAccount.id] });
      queryClient.invalidateQueries({ queryKey: ['pipedrive-accounts'] });
    }
  };

  if (accountsLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Plug className="w-14 h-14 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Kein Pipedrive-Konto verbunden</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Verbinde mindestens einen Pipedrive-Workspace in den Einstellungen,
          um Deals, Kontakte und Pipelines hier anzuzeigen.
        </p>
        <Button onClick={() => navigate('/einstellungen?tab=integrationen')}>
          Zur Integration-Einstellung
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  if (!activeAccount) {
    return <div className="p-6 text-sm text-muted-foreground">Account nicht gefunden.</div>;
  }

  const totalValue = deals?.reduce((s, d: any) => s + Number(d.value || 0), 0) || 0;

  return (
    <div className="space-y-0">
      {/* Active account context bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: activeAccount.color_hex || '#0EA5E9' }}
        />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{activeAccount.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {activeAccount.domain}.pipedrive.com · {activeAccount.total_deals_synced ?? 0} Deals · Letzter Sync: {timeAgo(activeAccount.last_sync_at)}
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing}
          variant="outline"
          size="sm"
          className="ml-auto"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Sync jetzt
        </Button>
      </div>

      <div className="p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Pipedrive · {TAB_LABELS[tab] ?? tab}
          </h1>
        </header>

        {tab === 'uebersicht' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Deals gesamt" value={deals?.length ?? 0} />
            <KpiCard label="Pipeline-Wert" value={`€${(totalValue / 1000).toFixed(0)}k`} />
            <KpiCard label="Personen" value={persons?.length ?? 0} />
            <KpiCard label="Pipelines" value={pipelines?.length ?? 0} />
          </div>
        )}

        {tab === 'deals' && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Titel</th>
                  <th className="text-left px-3 py-2 font-medium">Stage</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Wert</th>
                  <th className="text-left px-3 py-2 font-medium">Person</th>
                </tr>
              </thead>
              <tbody>
                {(deals ?? []).map((d: any) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-2">{d.title || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.stage_name || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">€{Number(d.value || 0).toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.person_name || '—'}</td>
                  </tr>
                ))}
                {!deals?.length && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Keine Deals — klicke "Sync jetzt"</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'personen' && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">E-Mail</th>
                  <th className="text-left px-3 py-2 font-medium">Telefon</th>
                  <th className="text-left px-3 py-2 font-medium">Org</th>
                </tr>
              </thead>
              <tbody>
                {(persons ?? []).map((p: any) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{p.name || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.phone || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.org_name || '—'}</td>
                  </tr>
                ))}
                {!persons?.length && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Keine Personen</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'pipelines' && (
          <div className="grid gap-3">
            {(pipelines ?? []).map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">ID: {p.pipedrive_id}</p>
              </div>
            ))}
            {!pipelines?.length && (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Pipelines</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    won: 'bg-success/15 text-success',
    open: 'bg-primary/15 text-primary',
    lost: 'bg-destructive/15 text-destructive',
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded ${map[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}
