import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight, Loader2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { namensTreffer } from '@/lib/kundenVerknuepfungen';

type Kunde = { id: string; name: string };
type Zuordnung = { id: string; client_id: string; meta_account_id: string; typ: 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string; objekt_name: string | null };
type Kampagne = { id: string; name: string; effective_status: string; daily_budget?: string; insights?: { data?: { spend?: string }[] } };
type Adset = { id: string; name: string; effective_status: string; daily_budget?: string };

const eur = (cents?: string | number | null) => cents == null || cents === '' ? '—' : `€${(Number(cents) / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
const eurRaw = (v?: string | null) => v == null ? '—' : `€${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
const STATUS: Record<string, string> = { ACTIVE: 'Aktiv', PAUSED: 'Pausiert', CAMPAIGN_PAUSED: 'Kampagne pausiert', ARCHIVED: 'Archiviert', DELETED: 'Gelöscht', WITH_ISSUES: 'Mit Problemen', IN_PROCESS: 'In Bearbeitung' };
const LS = 'werbebudget-untermarke';

/** Pflege-Bereich: Kunde ↔ Kampagne bzw. Anzeigengruppen je Untermarke (eigene Meta-Konten). Nie automatisch zuordnen. */
export function WerbebudgetZuordnung() {
  const { callMeta } = useMetaAds();
  const [konten, setKonten] = useState<{ meta_account_id: string; name: string | null }[]>([]);
  const [konto, setKonto] = useState<string>(() => localStorage.getItem(LS) || '');
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [zuo, setZuo] = useState<Zuordnung[]>([]);
  const [verworfen, setVerworfen] = useState<Set<string>>(new Set());
  const [kampagnen, setKampagnen] = useState<Kampagne[] | null>(null);
  const [stand, setStand] = useState<Date | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const ladeDb = useCallback(async () => {
    const [k, c, z, v] = await Promise.all([
      (supabase.from as any)('meta_accounts_cache').select('meta_account_id, name, status, last_synced_at').eq('status', 'active')
        .gte('last_synced_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('name'),
      supabase.from('clients').select('id, name').is('deleted_at', null).in('kundenstatus', ['In Betreuung', 'Pausiert'] as any).order('name'),
      (supabase.from as any)('werbebudget_zuordnung').select('*'),
      (supabase.from as any)('werbebudget_vorschlag_verworfen').select('kampagne_id, client_id'),
    ]);
    const belegt = new Set(((z.data || []) as any[]).map(r => r.meta_account_id));
    setKonten((((k.data || []) as any[])).sort((a, b) => Number(belegt.has(b.meta_account_id)) - Number(belegt.has(a.meta_account_id)) || (a.name || '').localeCompare(b.name || '')));
    setKunden(((c.data || []) as any[]).filter(x => x.name));
    setZuo((z.data || []) as Zuordnung[]);
    setVerworfen(new Set(((v.data || []) as any[]).map(r => `${r.kampagne_id}:${r.client_id}`)));
  }, []);
  useEffect(() => { ladeDb(); }, [ladeDb]);

  useEffect(() => {
    if (!konto) return;
    localStorage.setItem(LS, konto);
    setLaedt(true); setFehler(null); setKampagnen(null);
    const act = konto.startsWith('act_') ? konto : `act_${konto}`;
    callMeta<any>(`/${act}/campaigns`, { fields: 'id,name,effective_status,daily_budget,insights.date_preset(last_7d){spend}', limit: 200 })
      .then(r => { setKampagnen(r?.data || []); setStand(new Date()); })
      .catch(e => setFehler(e.message))
      .finally(() => setLaedt(false));
  }, [konto, callMeta]);

  const name = (id: string) => kunden.find(k => k.id === id)?.name || 'Unbekannter Kunde';
  const kampagneZuo = (kid: string) => zuo.find(z => z.typ === 'kampagne' && z.objekt_id === kid);
  const adsetZuo = (kid: string) => zuo.filter(z => z.typ === 'adset' && z.kampagne_id === kid);
  const ohneKunde = (kampagnen || []).filter(k => !kampagneZuo(k.id) && !adsetZuo(k.id).length).length;
  const kundenOhne = kunden.filter(k => !zuo.some(z => z.client_id === k.id)).length;

  const uid = async () => (await supabase.auth.getUser()).data.user?.id ?? null;
  const zuordnen = async (client_id: string, typ: 'kampagne' | 'adset', objekt_id: string, kampagne_id: string, objekt_name: string) => {
    const { error } = await (supabase.from as any)('werbebudget_zuordnung').insert({
      client_id, typ, objekt_id, kampagne_id, objekt_name, meta_account_id: konto,
      untermarke: konten.find(k => k.meta_account_id === konto)?.name ?? null, angelegt_von: await uid(),
    });
    if (error) { toast.error(error.message.includes('duplicate') ? `Bereits zugeordnet an ${name(zuo.find(z => z.objekt_id === objekt_id)?.client_id || '')}` : error.message); return; }
    toast.success(`${objekt_name} → ${name(client_id)}`); ladeDb();
  };
  const loesen = async (z: Zuordnung) => {
    const { error } = await (supabase.from as any)('werbebudget_zuordnung').delete().eq('id', z.id);
    if (error) toast.error(error.message); else ladeDb();
  };
  const verwerfen = async (kampagne_id: string, client_id: string) => {
    const { error } = await (supabase.from as any)('werbebudget_vorschlag_verworfen').insert({ kampagne_id, client_id, verworfen_von: await uid() });
    if (error) toast.error(error.message); else ladeDb();
  };
  const vorschlag = (k: Kampagne): { kunde: Kunde; grund: string } | null => {
    let best: { kunde: Kunde; s: number } | null = null;
    for (const c of kunden) {
      if (verworfen.has(`${k.id}:${c.id}`)) continue;
      const s = namensTreffer(c.name, k.name);
      if (s >= 0.6 && (!best || s > best.s)) best = { kunde: c, s };
    }
    return best ? { kunde: best.kunde, grund: `Kundenname „${best.kunde.name}“ steht im Kampagnennamen` } : null;
  };

  return (
    <section className="rounded-2xl bg-card shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Zuordnung Kampagnen ↔ Kunden</h3>
          <p className="text-sm text-muted-foreground tabular-nums">
            {kampagnen ? `${ohneKunde} Kampagnen ohne Kunde · ` : ''}{kundenOhne} Kunden ohne Kampagne
            {stand && <span className="text-muted-foreground/70"> · Meta-Stand {stand.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} (Ausgaben kommen zeitversetzt)</span>}
          </p>
        </div>
        <Select value={konto} onValueChange={setKonto}>
          <SelectTrigger className="w-72 bg-muted/50 border-0"><SelectValue placeholder="Untermarke wählen" /></SelectTrigger>
          <SelectContent>{konten.map(k => <SelectItem key={k.meta_account_id} value={k.meta_account_id}>{k.name || k.meta_account_id}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!konto && <p className="text-sm text-muted-foreground">Untermarke wählen, um ihre Kampagnen zu sehen.</p>}
      {laedt && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Kampagnen werden aus Meta geladen …</p>}
      {fehler && <p className="text-sm text-destructive">{fehler}</p>}
      {kampagnen && kampagnen.length === 0 && <p className="text-sm text-muted-foreground">Keine Kampagnen in dieser Untermarke.</p>}

      {kampagnen && kampagnen.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60">
              <th className="text-left font-medium py-2 pr-2">Kampagne</th><th className="text-left font-medium px-2">Status</th>
              <th className="text-right font-medium px-2">Tagesbudget</th><th className="text-right font-medium px-2">Ausgaben 7 T.</th>
              <th className="text-left font-medium pl-4">Kunde</th>
            </tr></thead>
            <tbody>{kampagnen.map(k => (
              <KampagnenZeile key={k.id} k={k} kunden={kunden} ganz={kampagneZuo(k.id)} adsets={adsetZuo(k.id)} vorschlag={kampagneZuo(k.id) || adsetZuo(k.id).length ? null : vorschlag(k)}
                name={name} callMeta={callMeta} zuordnen={zuordnen} loesen={loesen} verwerfen={verwerfen} />
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function KampagnenZeile({ k, kunden, ganz, adsets, vorschlag, name, callMeta, zuordnen, loesen, verwerfen }: {
  k: Kampagne; kunden: Kunde[]; ganz?: Zuordnung; adsets: Zuordnung[]; vorschlag: { kunde: Kunde; grund: string } | null; name: (id: string) => string;
  callMeta: any; zuordnen: (c: string, t: 'kampagne' | 'adset', o: string, kid: string, n: string) => Promise<void>; loesen: (z: Zuordnung) => void; verwerfen: (kid: string, cid: string) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [sets, setSets] = useState<Adset[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!offen || sets) return;
    callMeta(`/${k.id}/adsets`, { fields: 'id,name,effective_status,daily_budget', limit: 200 }).then((r: any) => setSets(r?.data || [])).catch((e: Error) => setErr(e.message));
  }, [offen, sets, k.id, callMeta]);
  const spend = k.insights?.data?.[0]?.spend;
  return (<>
    <tr className="border-b border-border/40 align-top">
      <td className="py-2.5 pr-2">
        <button onClick={() => setOffen(v => !v)} className="flex items-start gap-1 text-left hover:text-primary">
          <ChevronRight className={cn('h-4 w-4 mt-0.5 shrink-0 transition-transform', offen && 'rotate-90')} />
          <span className="break-words">{k.name}</span>
        </button>
      </td>
      <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{STATUS[k.effective_status] || k.effective_status}</td>
      <td className="px-2 py-2.5 text-right tabular-nums">{k.daily_budget ? eur(k.daily_budget) : <span className="text-muted-foreground text-xs">auf Anzeigengruppen</span>}</td>
      <td className="px-2 py-2.5 text-right tabular-nums">{eurRaw(spend)}</td>
      <td className="pl-4 py-2.5 min-w-[240px]">
        {ganz ? <Belegt text={name(ganz.client_id)} onLoesen={() => loesen(ganz)} />
          : adsets.length ? <span className="text-xs text-muted-foreground">Über Anzeigengruppen: {[...new Set(adsets.map(a => name(a.client_id)))].join(', ')}</span>
          : <div className="space-y-1.5">
              {vorschlag && <div className="text-xs">
                <span className="font-medium">{vorschlag.kunde.name}</span> <span className="text-muted-foreground">· {vorschlag.grund}</span>
                <div className="flex gap-1.5 mt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => zuordnen(vorschlag.kunde.id, 'kampagne', k.id, k.id, k.name)}><Check className="h-3 w-3 mr-1" />Übernehmen</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => verwerfen(k.id, vorschlag.kunde.id)}>Verwerfen</Button>
                </div>
              </div>}
              <KundeWaehler kunden={kunden} onPick={c => zuordnen(c.id, 'kampagne', k.id, k.id, k.name)} />
            </div>}
      </td>
    </tr>
    {offen && <tr className="border-b border-border/40 bg-muted/20"><td colSpan={5} className="py-2 pl-7 pr-2">
      {err && <p className="text-xs text-destructive">{err}</p>}
      {!sets && !err && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Anzeigengruppen werden geladen …</p>}
      {sets?.length === 0 && <p className="text-xs text-muted-foreground">Keine Anzeigengruppen.</p>}
      {sets?.map(a => {
        const z = adsets.find(x => x.objekt_id === a.id);
        return <div key={a.id} className="grid grid-cols-[1fr_120px_100px_260px] gap-2 items-center py-1.5 text-xs">
          <span className="break-words">{a.name}</span>
          <span className="text-muted-foreground">{STATUS[a.effective_status] || a.effective_status}</span>
          <span className="text-right tabular-nums">{eur(a.daily_budget)}</span>
          <span>{z ? <Belegt text={name(z.client_id)} onLoesen={() => loesen(z)} />
            : ganz ? <span className="text-muted-foreground">gehört mit der Kampagne zu {name(ganz.client_id)}</span>
            : <KundeWaehler kunden={kunden} onPick={c => zuordnen(c.id, 'adset', a.id, k.id, a.name)} />}</span>
        </div>;
      })}
      {sets && sets.length > 0 && !ganz && <p className="text-[11px] text-muted-foreground mt-1">Teilen sich zwei Kunden eine Anzeigengruppe, wird nichts aufgeteilt — sie bleibt nicht zuordenbar.</p>}
    </td></tr>}
  </>);
}

function Belegt({ text, onLoesen }: { text: string; onLoesen: () => void }) {
  return <span className="inline-flex items-center gap-1.5 text-sm font-medium">{text}
    <button onClick={onLoesen} title="Zuordnung lösen" className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>;
}

function KundeWaehler({ kunden, onPick }: { kunden: Kunde[]; onPick: (k: Kunde) => void }) {
  const [q, setQ] = useState('');
  const treffer = useMemo(() => q.length < 2 ? [] : kunden.filter(k => k.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [q, kunden]);
  return <div className="relative">
    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Kunde suchen…" className="h-8 text-xs bg-muted/50 border-0" />
    {treffer.length > 0 && <div className="absolute z-20 mt-1 w-full rounded-lg bg-popover shadow-md py-1">
      {treffer.map(k => <button key={k.id} onClick={() => { setQ(''); onPick(k); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted">{k.name}</button>)}
    </div>}
  </div>;
}
