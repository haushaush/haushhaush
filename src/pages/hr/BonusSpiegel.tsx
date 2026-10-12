import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Row = { id: string; vc_lead_id: string; vc_lead_name: string | null; hh_lead_id: string | null; status: string; treffer_via: string | null; vc_status_label: string | null; uebernommen_am: string | null; letzter_abgleich: string | null; created_at: string };
type Log = { gestartet_am: string; ok: boolean; fehler: string | null; details: any };
const VIA: Record<string, string> = { email: 'E-Mail', name: 'Name', telefon: 'Telefon' };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const closeUrl = (id: string) => `https://app.close.com/lead/${id}/`;

export default function BonusSpiegel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAlt, setShowAlt] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: l }] = await Promise.all([
      supabase.from('close_spiegel').select('*').order('uebernommen_am', { ascending: false, nullsFirst: false }),
      supabase.from('bonus_sync_log').select('gestartet_am, ok, fehler, details').eq('sync_typ', 'close_spiegel').order('gestartet_am', { ascending: false }).limit(10),
    ]);
    setRows((r as Row[]) || []); setLogs((l as Log[]) || []);
  };
  useEffect(() => { load(); }, []);

  const sync = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('close-spiegel-sync', { body: {} });
    setBusy(false);
    if (error || data?.error) { toast.error(`Abgleich fehlgeschlagen: ${data?.error || error?.message}`); return; }
    toast.success(`Abgleich fertig · ${data.neu_angelegt} angelegt · ${data.dubletten_verknuepft} als Dublette verknüpft${data.altbestand ? ` · ${data.altbestand} Altbestand` : ''}`);
    if (data.fehler?.length) toast.error(`${data.fehler.length} Fehler – siehe Protokoll`);
    load();
  };

  const uebernommen = useMemo(() => rows.filter(r => r.status === 'gespiegelt' || r.status === 'dublette_verknuepft'), [rows]);
  const alt = useMemo(() => rows.filter(r => r.status === 'altbestand'), [rows]);
  const last = logs[0];

  return (
    <PageShell>
      <PageHeader title="Klienten-Spiegel Viral Connect → Haush Haush" description="Neue Klienten in Viral Connect werden stündlich automatisch ins Haush-Haush-Close übernommen oder mit einem bestehenden Lead verknüpft." />
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button variant="outline" onClick={sync} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Jetzt abgleichen</Button>
        <span className="text-sm text-muted-foreground">Letzter Lauf: {last ? `${dt(last.gestartet_am)}${last.ok ? '' : ` · Fehler: ${last.fehler}`}` : '–'}</span>
      </div>

      <section className="mb-8">
        <h2 className="font-heading font-semibold mb-2">Übernommen ({uebernommen.length})</h2>
        {uebernommen.length === 0 ? <p className="text-sm text-muted-foreground">Seit dem Ausgangsbestand ist noch kein neuer Klient in Viral Connect dazugekommen.</p> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Name</th><th>Ergebnis</th><th>Viral-Connect-Status</th><th>Zeitpunkt</th><th /></tr></thead>
            <tbody>{uebernommen.map(r => (
              <tr key={r.id} className="border-t border-border/50">
                <td className="py-2 pr-3 font-medium">{r.vc_lead_name}</td>
                <td className="py-2 pr-3 text-xs">{r.status === 'gespiegelt' ? 'Neu angelegt' : `Dublette verknüpft (${VIA[r.treffer_via || ''] || 'manuell'})`}</td>
                <td className="py-2 pr-3 text-xs">{r.vc_status_label || '–'}</td>
                <td className="py-2 pr-3 text-xs tabular-nums">{dt(r.uebernommen_am)}</td>
                <td className="py-2 text-right">{r.hh_lead_id && <a className="text-xs underline-offset-2 hover:underline" href={closeUrl(r.hh_lead_id)} target="_blank" rel="noreferrer">In Close öffnen</a>}</td>
              </tr>))}</tbody></table>)}
      </section>

      <section className="mb-8">
        <h2 className="font-heading font-semibold mb-2">Protokoll</h2>
        <ul className="text-sm divide-y divide-border/50">{logs.map((l, i) => (
          <li key={i} className="py-2 flex flex-wrap gap-x-4 text-xs">
            <span className="tabular-nums">{dt(l.gestartet_am)}</span>
            <span>{l.details?.altbestand ? `${l.details.altbestand} Altbestand eingetragen · ` : ''}{l.details?.neu_angelegt ?? 0} angelegt · {l.details?.dubletten_verknuepft ?? 0} Dubletten · {l.details?.aenderungen?.length ?? 0} Änderungen</span>
            {l.details?.abgebrochen && <span>Limit erreicht – Rest im nächsten Lauf</span>}
            {!l.ok && <span className="text-destructive">{l.fehler}</span>}
          </li>))}</ul>
      </section>

      <section>
        <button className="text-sm text-muted-foreground underline" onClick={() => setShowAlt(v => !v)}>Altbestand ({alt.length}) – nur Vergleichslinie, wird nicht übernommen</button>
        {showAlt && <ul className="mt-2 text-xs text-muted-foreground columns-2 md:columns-3">{alt.map(r => <li key={r.id}>{r.vc_lead_name}</li>)}</ul>}
      </section>
    </PageShell>
  );
}
