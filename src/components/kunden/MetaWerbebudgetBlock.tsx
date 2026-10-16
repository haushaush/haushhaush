import { useEffect, useState } from 'react';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';
import { ladeUntermarken, type Untermarke } from '@/lib/werbebudgetKonten';
import { KampagneZeile, useWerbebudgetZuordnung, type Zuo, type ZuoKampagne } from './werbebudgetZuordnung';

/** Meta-Werbebudget-Zuordnung eines Kunden. Schreibt nur in werbebudget_zuordnung, nie nach Meta. */
export function MetaWerbebudgetBlock({ clientId }: { clientId: string }) {
  const { callMeta } = useMetaAds();
  const { alle, busy, zuordnen: zuordnenRoh, loesen } = useWerbebudgetZuordnung(clientId);
  const [konten, setKonten] = useState<Untermarke[]>([]);
  const [konto, setKonto] = useState('');
  const [kampagnen, setKampagnen] = useState<ZuoKampagne[] | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => { ladeUntermarken().then(setKonten); }, []);

  useEffect(() => {
    if (!konto) return;
    setLaedt(true); setFehler(null); setKampagnen(null);
    const act = konto.startsWith('act_') ? konto : `act_${konto}`;
    callMeta<any>(`/${act}/campaigns`, { fields: 'id,name,effective_status,daily_budget,insights.date_preset(last_7d){spend}', limit: 200 })
      .then(r => setKampagnen(r?.data || [])).catch(e => setFehler(e.message)).finally(() => setLaedt(false));
  }, [konto, callMeta]);

  const zuordnen = (typ: 'kampagne' | 'adset', objekt_id: string, kampagne_id: string, objekt_name: string) =>
    zuordnenRoh(konto, konten.find(k => k.meta_account_id === konto)?.name ?? null, typ, objekt_id, kampagne_id, objekt_name);

  const eigene = alle.filter(z => z.client_id === clientId);
  const gruppen = eigene.reduce<Record<string, Zuo[]>>((acc, z) => { (acc[z.untermarke || z.meta_account_id] ||= []).push(z); return acc; }, {});

  return (
    <div className="rounded-2xl bg-card shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Meta-Werbebudget</p>
          <p className="text-[11px] text-muted-foreground">Kampagnen oder einzelne Anzeigengruppen auf unseren Werbekonten, deren Ausgaben diesem Kunden gehören</p>
        </div>
        <Select value={konto} onValueChange={setKonto}>
          <SelectTrigger className="w-72 bg-muted/50 border-0"><SelectValue placeholder="Werbekonto wählen" /></SelectTrigger>
          <SelectContent>{konten.map(k => <SelectItem key={k.meta_account_id} value={k.meta_account_id}>{k.name || k.meta_account_id}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {laedt && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Kampagnen werden aus Meta geladen …</p>}
      {fehler && <p className="text-xs text-destructive">{fehler}</p>}
      {kampagnen?.length === 0 && <p className="text-xs text-muted-foreground">Keine Kampagnen in diesem Konto.</p>}
      {kampagnen && kampagnen.length > 0 && (
        <div className="divide-y divide-border/40 rounded-xl bg-muted/20">
          {kampagnen.map(k => <KampagneZeile key={k.id} k={k} alle={alle} clientId={clientId} busy={busy}
            callMeta={callMeta} zuordnen={zuordnen} loesen={loesen} />)}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Zuordnungen dieses Kunden</p>
        {eigene.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Kampagne oder Anzeigengruppe zugeordnet.</p>}
        {Object.entries(gruppen).map(([um, zs]) => (
          <div key={um}>
            <p className="text-xs font-medium mb-1">{um}</p>
            {zs.map(z => (
              <div key={z.id} className="flex items-center gap-2 text-sm py-1">
                <span className="text-[11px] text-muted-foreground w-24 shrink-0">{z.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'}</span>
                <span className="truncate">{z.objekt_name || z.objekt_id}</span>
                <button disabled={busy === z.id} onClick={() => loesen(z)} title="Zuordnung lösen" className="ml-auto text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
