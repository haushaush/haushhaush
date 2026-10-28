// Gemeinsame Werbebudget-Zuordnung (werbebudget_zuordnung): Laden, Zuordnen, Lösen und die Kampagnenzeile.
// Schreibt nur in werbebudget_zuordnung, nie nach Meta.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { STATUS_LABEL } from '@/lib/werbebudgetKonten';

export type Zuo = { id: string; client_id: string; meta_account_id: string; untermarke: string | null; typ: ZuoTyp; objekt_id: string; kampagne_id: string | null; objekt_name: string | null; clients?: { name: string | null } | null };
export type ZuoTyp = 'konto' | 'kampagne' | 'adset';
/** Zuordnung des ganzen Kontos: alle Kampagnen und Anzeigengruppen darauf gehören diesem Kunden. */
export const kontoZuo = (alle: Zuo[], konto?: string | null) => konto ? alle.find(z => z.typ === 'konto' && z.meta_account_id === konto) : undefined;
export type ZuoKampagne = { id: string; name: string; effective_status: string; daily_budget?: string; insights?: { data?: { spend?: string }[] } };
type Adset = { id: string; name: string; effective_status: string; daily_budget?: string };

const eurC = (c?: string) => c ? `€${(Number(c) / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })}` : '—';
const eurR = (v?: string) => v == null ? '—' : `€${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
export const zuoKundenName = (z?: Zuo) => z?.clients?.name || 'anderem Kunden';

/** Legt die Zuordnung an und leitet die Kontoverknüpfung (kunde_meta_accounts) daraus ab, falls noch nicht vorhanden. */
export async function zuordnungAnlegen(clientId: string, konto: string, untermarke: string | null, typ: ZuoTyp, objekt_id: string, kampagne_id: string | null, objekt_name: string) {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await (supabase.from as any)('werbebudget_zuordnung').insert({ client_id: clientId, typ, objekt_id, kampagne_id, objekt_name, meta_account_id: konto, untermarke, angelegt_von: uid });
  if (error) throw new Error(error.message);
  const { data: da, error: e1 } = await supabase.from('kunde_meta_accounts').select('id').eq('client_id', clientId).eq('meta_account_id', konto).limit(1);
  if (e1) { toast.warning(`Zugeordnet, aber Kontoverknüpfung nicht geprüft: ${e1.message}`); return; }
  if (!da?.length) {
    const { error: e2 } = await supabase.from('kunde_meta_accounts').insert({ client_id: clientId, meta_account_id: konto, meta_account_name: untermarke, match_type: 'kampagne', match_confidence: 1, matched_by: uid } as any);
    if (e2) toast.warning(`Zugeordnet, aber Kontoverknüpfung fehlgeschlagen: ${e2.message}`);
  }
}

/** Lädt alle Zuordnungen einmal (für Fremdbelegungen) und bietet zuordnen/loesen für einen Kunden. */
export function useWerbebudgetZuordnung(clientId: string) {
  const [alle, setAlle] = useState<Zuo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  const ladeZuo = useCallback(async () => {
    const { data, error } = await (supabase.from as any)('werbebudget_zuordnung').select('*, clients!inner(name, deleted_at)').is('clients.deleted_at', null);
    if (error) { setFehler(`Zuordnungen konnten nicht geladen werden: ${error.message}`); setGeladen(true); return; }
    setFehler(null); setAlle((data || []) as Zuo[]); setGeladen(true);
  }, []);
  useEffect(() => { ladeZuo(); }, [ladeZuo]);

  const zuordnen = useCallback(async (konto: string, untermarke: string | null, typ: ZuoTyp, objekt_id: string, kampagne_id: string | null, objekt_name: string) => {
    setBusy(objekt_id);
    try { await zuordnungAnlegen(clientId, konto, untermarke, typ, objekt_id, kampagne_id, objekt_name); toast.success(`${objekt_name} zugeordnet`); return true; }
    catch (e: any) { toast.error(e.message); return false; }
    finally { setBusy(null); ladeZuo(); }
  }, [clientId, ladeZuo]);

  /** Löst die Zuordnung; war es die letzte dieses Kunden auf dem Konto, fällt auch die abgeleitete Kontoverknüpfung weg. */
  const loesen = useCallback(async (z: Zuo) => {
    setBusy(z.id);
    try {
      const { error } = await (supabase.from as any)('werbebudget_zuordnung').delete().eq('id', z.id);
      if (error) { toast.error(error.message); return false; }
      const { data: rest, error: e1 } = await (supabase.from as any)('werbebudget_zuordnung').select('id').eq('client_id', z.client_id).eq('meta_account_id', z.meta_account_id).limit(1);
      if (e1) toast.warning(`Gelöst, aber Kontoverknüpfung nicht geprüft: ${e1.message}`);
      else if (!rest?.length) {
        const { error: e2 } = await supabase.from('kunde_meta_accounts').delete().eq('client_id', z.client_id).eq('meta_account_id', z.meta_account_id);
        if (e2) toast.warning(`Gelöst, aber Kontoverknüpfung nicht entfernt: ${e2.message}`);
      }
      return true;
    } finally { setBusy(null); ladeZuo(); }
  }, [ladeZuo]);

  return { alle, busy, fehler, geladen, ladeZuo, zuordnen, loesen };
}

export type MonatSpend = { kamp: Map<string, number>; adset: Map<string, number> };

/** Verbrauch laufender Monat je Kampagne/Anzeigengruppe eines Kontos aus meta_spend_taeglich (eine gesammelte Abfrage). */
export async function ladeMonatSpend(kontoId: string): Promise<MonatSpend> {
  const d = new Date();
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const acc = String(kontoId).replace(/^act_/, '');
  const kamp = new Map<string, number>(); const adset = new Map<string, number>();
  for (let von = 0; ; von += 1000) {
    const { data, error } = await (supabase.from as any)('meta_spend_taeglich').select('campaign_id,adset_id,spend')
      .eq('meta_account_id', acc).gte('datum', start).order('adset_id').order('datum').range(von, von + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) {
      const v = Number(r.spend) || 0;
      if (r.campaign_id) kamp.set(r.campaign_id, (kamp.get(r.campaign_id) || 0) + v);
      if (r.adset_id) adset.set(r.adset_id, (adset.get(r.adset_id) || 0) + v);
    }
    if (!data || data.length < 1000) break;
  }
  return { kamp, adset };
}

const GRID_MONAT = 'grid-cols-[1fr_110px_80px_80px_80px_auto]';
export function KampagnenKopf({ monat = true }: { monat?: boolean }) {
  return <div className={cn('grid gap-3 px-3 pt-2 pb-1 text-[11px] text-muted-foreground', monat ? GRID_MONAT : 'grid-cols-[1fr_110px_80px_80px_auto]')}>
    <span className="pl-5">Kampagne</span><span>Status</span><span className="text-right">Tagesbudget</span><span className="text-right">7 Tage</span>{monat && <span className="text-right">Dieser Monat</span>}<span />
  </div>;
}
const monatWert = (m: Map<string, number> | undefined, id: string) => m && m.has(id) ? eurR(m.get(id)) : '—';

export function KampagneZeile({ k, kontoId, alle, clientId, busy, kname = zuoKundenName, callMeta, zuordnen, loesen, ohneAusgaben = false, monat }: {
  monat?: MonatSpend; ohneAusgaben?: boolean; k: ZuoKampagne; kontoId?: string; alle: Zuo[]; clientId: string; busy: string | null; kname?: (z?: Zuo) => string; callMeta: any;
  zuordnen: (t: 'kampagne' | 'adset', o: string, kid: string, n: string) => Promise<unknown>; loesen: (z: Zuo) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [sets, setSets] = useState<Adset[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!offen || sets) return;
    callMeta(`/${k.id}/adsets`, { fields: 'id,name,effective_status,daily_budget', limit: 200 }).then((r: any) => setSets(r?.data || [])).catch((e: Error) => setErr(e.message));
  }, [offen, sets, k.id, callMeta]);

  const konto = kontoZuo(alle, kontoId);
  const ganz = konto || alle.find(z => z.typ === 'kampagne' && z.objekt_id === k.id);
  const adsetZuo = alle.filter(z => z.typ === 'adset' && z.kampagne_id === k.id);
  const aktion = konto
    ? <span className="text-xs text-muted-foreground">{konto.client_id === clientId ? 'über ganzes Konto zugeordnet' : `ganzes Konto gehört zu ${kname(konto)}`}</span>
    : ganz
    ? ganz.client_id === clientId
      ? <span className="text-xs text-success flex items-center gap-1.5">Zugeordnet<button onClick={() => loesen(ganz)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>
      : <span className="text-xs text-muted-foreground">gehört zu {kname(ganz)}</span>
    : adsetZuo.length
      ? <span className="text-xs text-muted-foreground">Anzeigengruppen vergeben – nur einzeln zuordenbar</span>
      : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === k.id} onClick={() => zuordnen('kampagne', k.id, k.id, k.name)}>Ganze Kampagne zuordnen</Button>;

  return (
    <div className="px-3 py-2.5">
      <div className={cn('grid gap-3 items-center text-sm', ohneAusgaben ? 'grid-cols-[1fr_110px_80px_auto]' : monat ? GRID_MONAT : 'grid-cols-[1fr_110px_80px_80px_auto]')}>
        <button onClick={() => !ganz && setOffen(v => !v)} disabled={!!ganz} className={cn('flex items-start gap-1 text-left min-w-0', !ganz && 'hover:text-primary')}>
          <ChevronRight className={cn('h-4 w-4 mt-0.5 shrink-0 transition-transform', offen && 'rotate-90', ganz && 'opacity-0')} />
          <span className="break-words">{k.name}</span>
        </button>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[k.effective_status] || k.effective_status}</span>
        <span className="text-right tabular-nums text-xs">{k.daily_budget ? eurC(k.daily_budget) : '—'}</span>
        {!ohneAusgaben && <span className="text-right tabular-nums text-xs" title="Ausgaben 7 Tage">{eurR(k.insights?.data?.[0]?.spend)}</span>}
        {!ohneAusgaben && monat && <span className="text-right tabular-nums text-xs" title="Verbrauch laufender Monat">{monatWert(monat.kamp, k.id)}</span>}
        <div className="justify-self-end">{aktion}</div>
      </div>
      {offen && !ganz && (
        <div className="pl-6 pt-2 space-y-1">
          {err && <p className="text-xs text-destructive">{err}</p>}
          {!sets && !err && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Anzeigengruppen werden geladen …</p>}
          {sets?.length === 0 && <p className="text-xs text-muted-foreground">Keine Anzeigengruppen.</p>}
          {sets?.map(a => {
            const z = adsetZuo.find(x => x.objekt_id === a.id);
            return <div key={a.id} className={cn('grid gap-3 items-center text-xs', !ohneAusgaben && monat ? 'grid-cols-[1fr_110px_80px_80px_80px_auto]' : 'grid-cols-[1fr_110px_80px_auto]')}>
              <span className="break-words">{a.name}</span>
              <span className="text-muted-foreground">{STATUS_LABEL[a.effective_status] || a.effective_status}</span>
              <span className="text-right tabular-nums">{eurC(a.daily_budget)}</span>
              {!ohneAusgaben && monat && <><span className="text-right text-muted-foreground">—</span><span className="text-right tabular-nums">{monatWert(monat.adset, a.id)}</span></>}
              <span className="justify-self-end">{z
                ? z.client_id === clientId
                  ? <span className="text-success flex items-center gap-1.5">Zugeordnet<button onClick={() => loesen(z)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>
                  : <span className="text-muted-foreground">gehört zu {kname(z)}</span>
                : <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={busy === a.id} onClick={() => zuordnen('adset', a.id, k.id, a.name)}>Zuordnen</Button>}</span>
            </div>;
          })}
          {sets && sets.length > 0 && <p className="text-xs text-muted-foreground">Teilen sich zwei Kunden eine Anzeigengruppe, wird nichts aufgeteilt.</p>}
        </div>
      )}
    </div>
  );
}
