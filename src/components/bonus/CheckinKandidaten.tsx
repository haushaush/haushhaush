import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GlassButton } from "./GlassButton";
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const errMsg = async (error: any, data: any) => {
  let m = data?.error || error?.message;
  try { const b = await error?.context?.json?.(); if (b?.error) m = b.error; } catch { /* ignore */ }
  return m;
};

/** Checkins on Close leads without client status. They never count until a human promotes the lead. */
export function CheckinKandidaten({ monat, maId, canManage, onChanged }: { monat: string; maId: string; canManage: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [log, setLog] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!maId) return;
    supabase.from('bonus_checkin_kandidaten').select('*').eq('monat', monat).eq('mitarbeiter_id', maId).eq('status', 'offen').order('datum')
      .then(({ data }) => setRows(data || []));
    supabase.from('bonus_sync_log').select('gestartet_am, ok, fehler').eq('sync_typ', 'checkins').eq('mitarbeiter_id', maId).not('ok', 'is', null).order('gestartet_am', { ascending: false }).limit(1)
      .then(({ data }) => setLog(data?.[0] ?? null));
  }, [monat, maId, tick]);

  const sync = async () => {
    setBusy('sync');
    const { data, error } = await supabase.functions.invoke('bonus-checkins-sync', { body: { monat, mitarbeiter_id: maId } });
    setBusy(null);
    if (error || !data?.ok) toast.error('Sync fehlgeschlagen', { description: await errMsg(error, data) });
    else toast.success(`${data.gefunden} Checkins gezählt · ${data.ohne_klientenstatus} ohne Klienten-Status`);
    setTick(t => t + 1); onChanged();
  };
  const uebernehmen = async (r: any) => {
    setBusy(r.id);
    const { data, error } = await supabase.functions.invoke('bonus-kunden-sync', { body: { aktion: 'uebernehmen', kandidat_id: r.id } });
    if (error || !data?.ok) { setBusy(null); return toast.error('Übernahme fehlgeschlagen', { description: await errMsg(error, data) }); }
    await supabase.functions.invoke('bonus-checkins-sync', { body: { monat, mitarbeiter_id: maId } });
    setBusy(null);
    toast.success(`${r.lead_name} ist jetzt Aktueller Klient`);
    setTick(t => t + 1); onChanged();
  };
  const ignorieren = async (r: any) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('bonus_checkin_kandidaten').update({ status: 'ignoriert', bearbeitet_von: u.user?.id, bearbeitet_am: new Date().toISOString() }).eq('close_lead_id', r.close_lead_id).eq('status', 'offen');
    if (error) return toast.error(error.message);
    setTick(t => t + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {canManage && (
          <GlassButton size="sm" variant="secondary" onClick={sync} disabled={!!busy}>
            {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Checkins jetzt synchronisieren
          </GlassButton>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          Letzter Checkin-Abgleich: {log ? <>{new Date(log.gestartet_am).toLocaleString('de-DE')}{log.ok ? '' : <span className="text-destructive"> · fehlgeschlagen: {log.fehler}</span>}</> : 'noch nie'}
        </span>
      </div>
      {rows.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-lg font-semibold font-heading text-foreground">Checkins ohne Klienten-Status ({rows.length})</h2>
            <p className="text-xs text-muted-foreground">Zählen nicht für die Punkte, bis der Lead in Close als Klient geführt wird.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr>
              <th className="text-left px-4 py-2 font-medium">Lead</th><th className="text-left px-4 py-2 font-medium">Datum</th><th className="text-left px-4 py-2 font-medium">Close-Status</th><th />
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2"><a className="text-primary hover:underline" href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer">{r.lead_name || r.close_lead_id}</a></td>
                  <td className="px-4 py-2 tabular-nums">{new Date(r.datum).toLocaleDateString('de-DE')}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.close_status_label || '–'}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {canManage && <>
                      <GlassButton size="sm" variant="primary" onClick={() => uebernehmen(r)} disabled={!!busy}>{busy === r.id && <Loader2 className="h-4 w-4 animate-spin" />}Als Klient übernehmen</GlassButton>
                      <GlassButton size="sm" variant="ghost" className="ml-2" onClick={() => ignorieren(r)} disabled={!!busy}>Ignorieren</GlassButton>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
