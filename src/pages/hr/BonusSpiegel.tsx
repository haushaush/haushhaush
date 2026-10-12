import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  vc_lead_id: string; name: string; firma: string; kontakt: string | null; email: string | null; status: string; vertragsstart: string | null;
  einschaetzung: 'neu' | 'existiert';
  treffer: { hh_lead_id: string; name: string; via: string; prozent: number; hh_status: string } | null;
  aehnlich: { hh_lead_id: string; name: string; prozent: number } | null;
  spiegel: { status: string; hh_lead_id: string | null } | null;
};
const VIA: Record<string, string> = { email: 'E-Mail', name: 'Name', telefon: 'Telefon' };

export default function BonusSpiegel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('close-spiegel-sync', { body: { mode: 'preview' } });
    setLoading(false);
    if (error || data?.error) { toast.error(`Abgleich fehlgeschlagen: ${data?.error || error?.message}`); return; }
    const r: Row[] = data.rows || [];
    setRows(r);
    setSel(new Set(r.filter(x => !x.spiegel && x.einschaetzung === 'neu').map(x => x.vc_lead_id)));
  };
  useEffect(() => { load(); }, []);

  const offen = useMemo(() => rows.filter(r => !r.spiegel), [rows]);
  const erledigt = useMemo(() => rows.filter(r => r.spiegel && r.spiegel.status !== 'ignoriert'), [rows]);
  const hidden = useMemo(() => rows.filter(r => r.spiegel?.status === 'ignoriert'), [rows]);

  const run = async (items: any[], msg: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('close-spiegel-sync', { body: { mode: 'apply', items } });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    if (data.fehler?.length) toast.error(`${data.fehler.length} Fehler – siehe Protokoll`);
    if (data.abgebrochen) toast.warning('Limit von 50 Schreibvorgängen erreicht – bitte erneut ausführen.');
    toast.success(msg);
    load();
  };
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const uebernehmen = () => {
    const items = offen.filter(r => sel.has(r.vc_lead_id)).map(r => ({ vc_lead_id: r.vc_lead_id, name: r.name, action: 'uebernehmen' }));
    if (!items.length) return;
    if (!confirm(`${items.length} Leads im Haush-Haush-Close als „Aktueller Klient" anlegen?`)) return;
    run(items, `${items.length} übernommen`);
  };

  const RowView = ({ r, actions }: { r: Row; actions: boolean }) => (
    <tr className="border-t border-border/50 align-top">
      <td className="py-2 pr-2">{actions && <Checkbox checked={sel.has(r.vc_lead_id)} onCheckedChange={() => toggle(r.vc_lead_id)} aria-label="übernehmen" />}</td>
      <td className="py-2 pr-3"><p className="font-medium">{r.name}</p>{r.firma !== r.name && <p className="text-xs text-muted-foreground">{r.firma}</p>}</td>
      <td className="py-2 pr-3 text-xs"><p>{r.kontakt || '–'}</p><p className="text-muted-foreground">{r.email || '–'}</p></td>
      <td className="py-2 pr-3 text-xs">{r.status}{r.vertragsstart && <p className="text-muted-foreground">seit {new Date(r.vertragsstart).toLocaleDateString('de-DE')}</p>}</td>
      <td className="py-2 pr-3 text-xs">
        {r.spiegel ? <span className="text-muted-foreground">{r.spiegel.status === 'gespiegelt' ? 'Übernommen' : r.spiegel.status === 'dublette_verknuepft' ? 'Mit bestehendem Lead verknüpft' : 'Ignoriert'}</span>
          : r.treffer ? <><p>Existiert schon in Haush Haush</p><p className="text-muted-foreground">{r.treffer.name} · {VIA[r.treffer.via]} · <span className="tabular-nums">{r.treffer.prozent} %</span> Namensähnlichkeit</p></>
          : <><p className="font-medium">Neu</p>{r.aehnlich && <p className="text-muted-foreground">ähnlich: {r.aehnlich.name} (<span className="tabular-nums">{r.aehnlich.prozent} %</span>)</p>}</>}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {actions && <div className="flex gap-1 justify-end">
          {(r.treffer || r.aehnlich) && <Button size="sm" variant="outline" disabled={busy} onClick={() => run([{ vc_lead_id: r.vc_lead_id, name: r.name, action: 'verknuepfen', hh_lead_id: (r.treffer || r.aehnlich)!.hh_lead_id }], 'Verknüpft')}>Verknüpfen</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run([{ vc_lead_id: r.vc_lead_id, name: r.name, action: 'ignorieren' }], 'Ausgeblendet')}>Nicht übernehmen</Button>
        </div>}
        {!actions && r.spiegel?.status === 'ignoriert' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run([{ vc_lead_id: r.vc_lead_id, action: 'uebernehmen' }], 'Übernommen')}>Doch übernehmen</Button>}
      </td>
    </tr>
  );
  const Table = ({ list, actions }: { list: Row[]; actions: boolean }) => (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted-foreground"><th className="w-8" /><th>Name</th><th>Hauptkontakt</th><th>Close-Status</th><th>Einschätzung</th><th /></tr></thead>
      <tbody>{list.map(r => <RowView key={r.vc_lead_id} r={r} actions={actions} />)}</tbody>
    </table></div>
  );

  return (
    <PageShell>
      <PageHeader title="Klienten-Spiegel Viral Connect → Haush Haush" description="Klienten aus Viral Connect prüfen und ins Haush-Haush-Close übernehmen. Nichts wird ohne Bestätigung angelegt." />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button variant="outline" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Abgleich prüfen</Button>
        <Button variant="outline" disabled={busy} onClick={() => setSel(new Set(offen.filter(r => r.einschaetzung === 'neu').map(r => r.vc_lead_id)))}>Alle neuen auswählen</Button>
        <Button disabled={busy || !sel.size} onClick={uebernehmen}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{sel.size} übernehmen</Button>
        {rows.length > 0 && <span className="text-sm text-muted-foreground tabular-nums">{rows.length} Klienten · {offen.filter(r => r.einschaetzung === 'neu').length} neu · {offen.filter(r => r.einschaetzung !== 'neu').length} mit Treffer · {erledigt.length} erledigt</span>}
      </div>
      {loading && !rows.length ? <p className="text-sm text-muted-foreground py-8 text-center">Beide Close-Zugänge werden gelesen …</p> : <>
        <section className="mb-8"><h2 className="font-heading font-semibold mb-2">Offen ({offen.length})</h2><Table list={offen} actions /></section>
        {erledigt.length > 0 && <section className="mb-8"><h2 className="font-heading font-semibold mb-2">Übernommen / verknüpft ({erledigt.length})</h2><Table list={erledigt} actions={false} /></section>}
        {hidden.length > 0 && <section><button className="text-sm text-muted-foreground underline" onClick={() => setShowHidden(v => !v)}>Ausgeblendet ({hidden.length})</button>{showHidden && <Table list={hidden} actions={false} />}</section>}
      </>}
    </PageShell>
  );
}
