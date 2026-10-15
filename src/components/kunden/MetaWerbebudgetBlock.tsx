import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ladeUntermarken, STATUS_LABEL, type Untermarke } from '@/lib/werbebudgetKonten';

type Zuo = { id: string; client_id: string; meta_account_id: string; untermarke: string | null; typ: 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string; objekt_name: string | null; clients?: { name: string | null } | null };
type Kampagne = { id: string; name: string; effective_status: string; daily_budget?: string; insights?: { data?: { spend?: string }[] } };
type Adset = { id: string; name: string; effective_status: string; daily_budget?: string };

const eurC = (c?: string) => c ? `€${(Number(c) / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })}` : '—';
const eurR = (v?: string) => v == null ? '—' : `€${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;

/** Meta-Werbebudget-Zuordnung eines Kunden. Schreibt nur in werbebudget_zuordnung, nie nach Meta. */
export function MetaWerbebudgetBlock({ clientId }: { clientId: string }) {
  const { callMeta } = useMetaAds();
  const [konten, setKonten] = useState<Untermarke[]>([]);
  const [konto, setKonto] = useState('');
  const [alle, setAlle] = useState<Zuo[]>([]);
  const [kampagnen, setKampagnen] = useState<Kampagne[] | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const ladeZuo = useCallback(async () => {
    const { data } = await (supabase.from as any)('werbebudget_zuordnung').select('*, clients(name)');
    setAlle((data || []) as Zuo[]);
  }, []);
  useEffect(() => { ladeZuo(); ladeUntermarken().then(setKonten); }, [ladeZuo]);

  useEffect(() => {
    if (!konto) return;
    setLaedt(true); setFehler(null); setKampagnen(null);
    const act = konto.startsWith('act_') ? konto : `act_${konto}`;
    callMeta<any>(`/${act}/campaigns`, { fields: 'id,name,effective_status,daily_budget,insights.date_preset(last_7d){spend}', limit: 200 })
      .then(r => setKampagnen(r?.data || [])).catch(e => setFehler(e.message)).finally(() => setLaedt(false));
  }, [konto, callMeta]);

  const kname = (z?: Zuo) => z?.clients?.name || 'anderem Kunden';
  const zuordnen = async (typ: 'kampagne' | 'adset', objekt_id: string, kampagne_id: string, objekt_name: string) => {
    setBusy(objekt_id);
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await (supabase.from as any)('werbebudget_zuordnung').insert({
      client_id: clientId, typ, objekt_id, kampagne_id, objekt_name, meta_account_id: konto,
      untermarke: konten.find(k => k.meta_account_id === konto)?.name ?? null, angelegt_von: uid,
    });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success(`${objekt_name} zugeordnet`); ladeZuo(); }
  };
  const loesen = async (z: Zuo) => {
    setBusy(z.id);
    const { error } = await (supabase.from as any)('werbebudget_zuordnung').delete().eq('id', z.id);
    setBusy(null);
    if (error) toast.error(error.message); else ladeZuo();
  };

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
          {kampagnen.map(k => <KampagneZeile key={k.id} k={k} alle={alle} clientId={clientId} busy={busy} kname={kname}
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

function KampagneZeile({ k, alle, clientId, busy, kname, callMeta, zuordnen, loesen }: {
  k: Kampagne; alle: Zuo[]; clientId: string; busy: string | null; kname: (z?: Zuo) => string; callMeta: any;
  zuordnen: (t: 'kampagne' | 'adset', o: string, kid: string, n: string) => Promise<void>; loesen: (z: Zuo) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [sets, setSets] = useState<Adset[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!offen || sets) return;
    callMeta(`/${k.id}/adsets`, { fields: 'id,name,effective_status,daily_budget', limit: 200 }).then((r: any) => setSets(r?.data || [])).catch((e: Error) => setErr(e.message));
  }, [offen, sets, k.id, callMeta]);

  const ganz = alle.find(z => z.typ === 'kampagne' && z.objekt_id === k.id);
  const adsetZuo = alle.filter(z => z.typ === 'adset' && z.kampagne_id === k.id);
  const aktion = ganz
    ? ganz.client_id === clientId
      ? <span className="text-xs text-success flex items-center gap-1.5">Zugeordnet<button onClick={() => loesen(ganz)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>
      : <span className="text-xs text-muted-foreground">gehört zu {kname(ganz)}</span>
    : adsetZuo.length
      ? <span className="text-xs text-muted-foreground">Anzeigengruppen vergeben – nur einzeln zuordenbar</span>
      : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === k.id} onClick={() => zuordnen('kampagne', k.id, k.id, k.name)}>Ganze Kampagne zuordnen</Button>;

  return (
    <div className="px-3 py-2.5">
      <div className="grid grid-cols-[1fr_110px_80px_80px_auto] gap-3 items-center text-sm">
        <button onClick={() => !ganz && setOffen(v => !v)} disabled={!!ganz} className={cn('flex items-start gap-1 text-left min-w-0', !ganz && 'hover:text-primary')}>
          <ChevronRight className={cn('h-4 w-4 mt-0.5 shrink-0 transition-transform', offen && 'rotate-90', ganz && 'opacity-0')} />
          <span className="break-words">{k.name}</span>
        </button>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[k.effective_status] || k.effective_status}</span>
        <span className="text-right tabular-nums text-xs">{k.daily_budget ? eurC(k.daily_budget) : '—'}</span>
        <span className="text-right tabular-nums text-xs" title="Ausgaben 7 Tage">{eurR(k.insights?.data?.[0]?.spend)}</span>
        <div className="justify-self-end">{aktion}</div>
      </div>
      {offen && !ganz && (
        <div className="pl-6 pt-2 space-y-1">
          {err && <p className="text-xs text-destructive">{err}</p>}
          {!sets && !err && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Anzeigengruppen werden geladen …</p>}
          {sets?.length === 0 && <p className="text-xs text-muted-foreground">Keine Anzeigengruppen.</p>}
          {sets?.map(a => {
            const z = adsetZuo.find(x => x.objekt_id === a.id);
            return <div key={a.id} className="grid grid-cols-[1fr_110px_80px_auto] gap-3 items-center text-xs">
              <span className="break-words">{a.name}</span>
              <span className="text-muted-foreground">{STATUS_LABEL[a.effective_status] || a.effective_status}</span>
              <span className="text-right tabular-nums">{eurC(a.daily_budget)}</span>
              <span className="justify-self-end">{z
                ? z.client_id === clientId
                  ? <span className="text-success flex items-center gap-1.5">Zugeordnet<button onClick={() => loesen(z)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>
                  : <span className="text-muted-foreground">gehört zu {kname(z)}</span>
                : <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={busy === a.id} onClick={() => zuordnen('adset', a.id, k.id, a.name)}>Zuordnen</Button>}</span>
            </div>;
          })}
          {sets && sets.length > 0 && <p className="text-[11px] text-muted-foreground">Teilen sich zwei Kunden eine Anzeigengruppe, wird nichts aufgeteilt.</p>}
        </div>
      )}
    </div>
  );
}
