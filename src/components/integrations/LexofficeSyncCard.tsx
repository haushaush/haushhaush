import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Status = { resource: string; last_success_at: string | null; last_error: string | null; completed: boolean | null; fetched_count: number | null; pages_loaded: number | null; total_pages: number | null };
type Run = { status: string; started_at: string; finished_at: string | null; error_message: string | null };

const fmt = (s?: string | null) => s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** lexoffice (Haush Haush Buchhaltung), nur lesend. Gleiches Muster wie Qonto. */
export function LexofficeSyncCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [counts, setCounts] = useState<{ inv: number | null; con: number | null }>({ inv: null, con: null });
  const [starting, setStarting] = useState(false);

  const load = async () => {
    const [cfg, st, runs, inv, con] = await Promise.all([
      supabase.functions.invoke('lexoffice-sync', { body: { aktion: 'status' } }),
      supabase.from('lexoffice_sync_status' as any).select('*'),
      supabase.from('lexoffice_sync_runs' as any).select('status, started_at, finished_at, error_message').order('started_at', { ascending: false }).limit(1),
      supabase.from('lexoffice_invoices' as any).select('voucher_id', { count: 'exact', head: true }),
      supabase.from('lexoffice_contacts' as any).select('contact_id', { count: 'exact', head: true }),
    ]);
    setConfigured(cfg.error ? null : !!(cfg.data as any)?.configured);
    setStatus(Object.fromEntries(((st.data as any[]) || []).map(r => [r.resource, r])));
    setLastRun(((runs.data as any[]) || [])[0] || null);
    setCounts({ inv: inv.count ?? null, con: con.count ?? null });
  };
  useEffect(() => { load(); }, []);

  const laeuft = lastRun?.status === 'running';
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [laeuft]);

  const start = async () => {
    setStarting(true);
    const { error } = await supabase.functions.invoke('lexoffice-sync', { body: {} });
    setStarting(false);
    if (error) toast.error('lexoffice-Sync konnte nicht starten', { description: error.message });
    else toast.success('lexoffice-Sync gestartet', { description: 'Läuft im Hintergrund.' });
    load();
  };

  const lastSuccess = [status.invoices?.last_success_at, status.contacts?.last_success_at].filter(Boolean).sort()[0] || null;
  const fehler = [status.invoices?.last_error && `Rechnungen: ${status.invoices.last_error}`, status.contacts?.last_error && `Kontakte: ${status.contacts.last_error}`].filter(Boolean).join(' · ');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">lexoffice</CardTitle>
          <p className="text-xs text-muted-foreground">Buchhaltung Haush Haush · nur lesend · Auto-Sync täglich 06:00 & alle 3 h (09–21 Uhr)</p>
        </div>
        <Button size="sm" onClick={start} disabled={starting || laeuft || configured === false}>
          {(starting || laeuft) ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
          {laeuft ? 'Läuft…' : 'Jetzt synchronisieren'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className={cn('flex items-center gap-1.5 text-xs font-medium', configured ? 'text-success' : 'text-muted-foreground')}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {configured === null ? 'Verbindung wird geprüft…' : configured ? 'Verbunden' : 'Nicht verbunden — Secret LEXOFFICE_API_KEY fehlt'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 tabular-nums">
          <div><p className="text-[11px] text-muted-foreground">Letzter erfolgreicher Lauf</p><p className="font-medium">{fmt(lastSuccess)}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Rechnungen</p><p className="font-medium">{counts.inv ? counts.inv.toLocaleString('de-DE') : 'noch keine'}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Kontakte</p><p className="font-medium">{counts.con ? counts.con.toLocaleString('de-DE') : 'noch keine'}</p></div>
        </div>
        {laeuft && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Läuft seit {fmt(lastRun?.started_at)} · Rechnungen Seite {status.invoices?.pages_loaded ?? 0}{status.invoices?.total_pages ? ` von ${status.invoices.total_pages}` : ''} · Kontakte Seite {status.contacts?.pages_loaded ?? 0}{status.contacts?.total_pages ? ` von ${status.contacts.total_pages}` : ''}
          </p>
        )}
        {(fehler || (lastRun?.status === 'failed' && lastRun.error_message)) && (
          <p className="text-xs text-destructive">Letzter Fehler: {fehler || lastRun?.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}
