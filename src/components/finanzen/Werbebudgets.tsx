import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HealthKarte, HEALTH_KARTE, FARBE } from './HealthKarte';
import { ladeZahlungsstatus, OHNE_POSTEN_TOOLTIP, type WerbebudgetZahlungsstatus } from '@/lib/werbebudgetZahlungsstatus';
import { ladeKontenJeKunde, wirksamerBudgetTraeger, type KontoInfo } from '@/lib/budgetTraeger';

type Zuordnung = { client_id: string; meta_account_id: string; untermarke: string | null; typ: 'konto' | 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string | null; objekt_name: string | null };
type Eingezahlt = { client_id: string; quelle: string | null; eingezahlt_netto: number | null; uebertrag_frueher_netto: number | null; eingezahlt_gesamt_netto: number | null; zahlungen: number | null; offen_netto: number | null; rechnungen_offen: number | null; letzte_zahlung: string | null; aelteste_ueberfaellig: string | null };
type Spend = { meta_account_id: string; campaign_id: string | null; campaign_name: string | null; adset_id: string; adset_name: string | null; datum: string; spend: number };
type KontoView = { meta_account_id: string; kontoname: string | null; art: string | null; eingezahlt: number | null; ausgegeben: number | null; letzte_aufladung: string | null; letzte_meta_zahlung: string | null; belege: number | null; kampagnen_aktiv: number | null; tagesbudget: number | null };
type Snap = { campaign_id: string; campaign_name: string | null; account_id: string; status: string | null };

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const datum = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const norm = (s: string | null | undefined) => String(s ?? '').replace(/^act_/, '');
const ART_TEXT: Record<string, string> = { untermarke: 'Untermarke', kunde_eigen: 'Kundeneigenes Konto', unbekannt: 'Art unbekannt' };
const LAGE_TEXT: Record<string, string> = { bezahlt: 'bezahlt', zahlt_meta_direkt: 'zahlt Meta direkt', fehlt_obwohl_pflicht: 'fehlt obwohl Pflicht', unbekannt: 'keine Zuordnung' };
const monatsErster = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

async function ladeSpend(seit: string): Promise<Spend[]> {
  const out: Spend[] = [];
  for (let von = 0; von < 100000; von += 1000) {
    const { data, error } = await (supabase.from as any)('meta_spend_taeglich')
      .select('meta_account_id, campaign_id, campaign_name, adset_id, adset_name, datum, spend').gte('datum', seit).range(von, von + 999);
    if (error) { console.error('meta_spend_taeglich', error.message); throw new Error(error.message); }
    out.push(...((data || []) as Spend[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Werbebudget je Kunde, nur Kunden mit wirksamem Budgetträger „uns". Nur lesend. */
export function Werbebudgets() {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kunden, setKunden] = useState<{ id: string; name: string; ads_budget: number | null; werbebudget_pflicht: boolean | null }[]>([]);
  const [konten, setKonten] = useState<Map<string, KontoInfo[]>>(new Map());
  const [zuo, setZuo] = useState<Zuordnung[]>([]);
  const [ein, setEin] = useState<Map<string, Eingezahlt>>(new Map());
  const [view, setView] = useState<KontoView[]>([]);
  const [spend, setSpend] = useState<Spend[]>([]);
  const [snap, setSnap] = useState<Snap[]>([]);
  const [zst, setZst] = useState<Map<string, WerbebudgetZahlungsstatus>>(new Map());
  const [bq, setBq] = useState<Map<string, string | null>>(new Map());
  const [lage, setLage] = useState<Map<string, string>>(new Map());
  const [offen, setOffen] = useState<Set<string>>(new Set());

  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const [c, z, e, v, s, km, sp] = await Promise.all([
        supabase.from('clients').select('id, name, ads_budget, werbebudget_pflicht').is('deleted_at', null).in('kundenstatus', ['In Betreuung', 'Pausiert'] as any),
        (supabase.from as any)('werbebudget_zuordnung').select('client_id, meta_account_id, untermarke, typ, objekt_id, kampagne_id, objekt_name'),
        (supabase.from as any)('werbebudget_eingezahlt').select('*'),
        (supabase.from as any)('untermarke_werbebudget').select('meta_account_id, kontoname, art, eingezahlt, ausgegeben, letzte_aufladung, letzte_meta_zahlung, belege, kampagnen_aktiv, tagesbudget'),
        supabase.from('meta_campaign_snapshot').select('campaign_id, campaign_name, account_id, status'),
        ladeKontenJeKunde(),
        ladeSpend(monatsErster()),
      ]);
      for (const [n, r] of [['clients', c], ['werbebudget_zuordnung', z], ['werbebudget_eingezahlt', e], ['untermarke_werbebudget', v], ['meta_campaign_snapshot', s]] as const)
        if ((r as any).error) console.error(n, (r as any).error.message);
      const alle = ((c.data || []) as any[]).filter(k => k.name);
      const ks = alle.filter(k => wirksamerBudgetTraeger((km.get(k.id) || []).map(x => x.art || ''), k.werbebudget_pflicht) === 'uns');
      const ids = ks.map(k => k.id);
      const bqm = new Map<string, string | null>(); const lm = new Map<string, string>();
      const [zs0] = await Promise.all([
        ladeZahlungsstatus(ids),
        ...ids.map(async id => {
          const [q, l] = await Promise.all([
            (supabase.rpc as any)('kunde_buchhaltungsquelle', { p_client_id: id }),
            (supabase.rpc as any)('werbebudget_lage', { p_client_id: id }),
          ]);
          if (q.error) console.error('kunde_buchhaltungsquelle', id, q.error.message); else bqm.set(id, q.data ?? null);
          if (l.error) console.error('werbebudget_lage', id, l.error.message); else if (l.data) lm.set(id, l.data);
        }),
      ]);
      setKunden(ks); setKonten(km); setZuo((z.data || []) as Zuordnung[]);
      setEin(new Map(((e.data || []) as Eingezahlt[]).map(r => [r.client_id, r])));
      setView((v.data || []) as KontoView[]); setSnap((s.data || []) as Snap[]); setSpend(sp);
      setZst(zs0 as Map<string, WerbebudgetZahlungsstatus>); setBq(bqm); setLage(lm);
    } catch (err) { setFehler((err as Error).message); }
    setLaedt(false);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  /** Spend je zugeordnetem Objekt im laufenden Monat (Kampagne: alle ihre Adsets; Adset: nur dieses; ganzes Konto: alles). */
  const zeilen = useMemo(() => kunden.map(k => {
    const objs = zuo.filter(z => z.client_id === k.id);
    const gezaehlt = new Set<string>();
    let verbraucht = 0;
    const objekte = objs.map(o => {
      const treffer = spend.filter(r => o.typ === 'adset' ? r.adset_id === o.objekt_id : o.typ === 'kampagne' ? r.campaign_id === o.objekt_id : norm(r.meta_account_id) === norm(o.objekt_id || o.meta_account_id));
      const summe = treffer.reduce((s, r) => s + Number(r.spend || 0), 0);
      for (const r of treffer) { const key = `${r.adset_id}|${r.datum}`; if (!gezaehlt.has(key)) { gezaehlt.add(key); verbraucht += Number(r.spend || 0); } }
      return { o, summe, adsets: o.typ === 'kampagne' ? [...treffer.reduce((m, r) => m.set(r.adset_id, { name: r.adset_name || r.adset_id, spend: (m.get(r.adset_id)?.spend || 0) + Number(r.spend || 0) }), new Map<string, { name: string; spend: number }>()).values()] : [] };
    });
    const budget = k.ads_budget != null && Number(k.ads_budget) > 0 ? Number(k.ads_budget) : null;
    const quote = budget ? verbraucht / budget : null;
    return { k, objekte, verbraucht, budget, quote, rest: budget != null ? budget - verbraucht : null };
  }).sort((a, b) => (a.quote == null ? 1 : 0) - (b.quote == null ? 1 : 0) || (b.quote ?? 0) - (a.quote ?? 0) || a.k.name.localeCompare(b.k.name)), [kunden, zuo, spend]);

  const kontoIds = useMemo(() => new Set(kunden.flatMap(k => (konten.get(k.id) || []).map(x => norm(x.meta_account_id)))), [kunden, konten]);
  const summen = useMemo(() => {
    const vs = view.filter(v => kontoIds.has(norm(v.meta_account_id)));
    return { eingezahlt: vs.reduce((s, v) => s + Number(v.eingezahlt || 0), 0), ausgegeben: vs.reduce((s, v) => s + Number(v.ausgegeben || 0), 0), konten: vs.length };
  }, [view, kontoIds]);
  const ueberBudget = zeilen.filter(z => z.quote != null && z.quote >= 1).length;

  /** Aktive Kampagnen auf Untermarken-Konten ohne jede Kundenzuordnung (live berechnet). */
  const ohneZuordnung = useMemo(() => {
    const unter = new Set(view.filter(v => v.art === 'untermarke').map(v => norm(v.meta_account_id)));
    const ganzeKonten = new Set(zuo.filter(z => z.typ === 'konto').map(z => norm(z.objekt_id || z.meta_account_id)));
    const kampagnen = new Set(zuo.filter(z => z.typ === 'kampagne').map(z => z.objekt_id));
    zuo.filter(z => z.typ === 'adset' && z.kampagne_id).forEach(z => kampagnen.add(z.kampagne_id!));
    const offene = snap.filter(s => s.status === 'ACTIVE' && unter.has(norm(s.account_id)) && !ganzeKonten.has(norm(s.account_id)) && !kampagnen.has(s.campaign_id));
    return { kampagnen: offene.length, konten: new Set(offene.map(s => norm(s.account_id))).size };
  }, [view, zuo, snap]);

  if (laedt) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  const viewJe = new Map(view.map(v => [norm(v.meta_account_id), v]));
  const ampel = (q: number | null) => q == null ? FARBE.grau : q >= 1 ? FARBE.rot : q >= 0.8 ? 'hsl(var(--warning))' : FARBE.gruen;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Werbebudgets</h1>
          <p className="text-sm text-muted-foreground">Kunden, deren Werbebudget über uns läuft — Monatsbudget gegen Meta-Ausgaben seit dem Monatsersten</p>
        </div>
        <Button variant="outline" size="sm" onClick={laden} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Aktualisieren</Button>
      </div>

      {fehler && <p className="text-sm text-destructive">Fehler beim Laden: {fehler}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HealthKarte titel="Kunden über Budget" farbe={ueberBudget ? FARBE.rot : FARBE.gruen} wert={String(ueberBudget)} satz={`von ${zeilen.length} Kunden haben ihr Monatsbudget erreicht oder überschritten.`} />
        <HealthKarte titel="Eingezahlt gesamt" farbe={FARBE.primaer} wert={eur(summen.eingezahlt)} satz={`Werbebudget-Zahlungen auf den ${summen.konten} Konten dieser Kunden.`} />
        <HealthKarte titel="Bei Meta ausgegeben gesamt" farbe={FARBE.grau} wert={eur(summen.ausgegeben)} satz="Tatsächlich an Meta gezahlt laut Zahlungsbelegen dieser Konten." />
      </div>

      {ohneZuordnung.kampagnen > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p>{ohneZuordnung.kampagnen} aktive Kampagnen auf {ohneZuordnung.konten} Konten sind keinem Kunden zugeordnet — deren Ausgaben fehlen in der Auswertung.{' '}
            <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 font-medium">Zur Zuordnung</Link></p>
        </div>
      )}

      {spend.length === 0 && <p className="text-xs text-muted-foreground">Für diesen Monat liegen noch keine Meta-Ausgaben vor — der Spend-Sync hat noch nicht geliefert. „Verbraucht" bleibt bis dahin 0 €.</p>}

      <div className={`${HEALTH_KARTE} p-0 sm:p-0 overflow-hidden`}>
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_9rem] gap-4 px-6 py-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>Kunde</span><span className="text-right">Monatsbudget</span><span className="text-right">Verbraucht</span><span className="text-right">Rest</span><span className="text-right">Auslastung</span>
        </div>
        {zeilen.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">Keine Kunden, deren Werbebudget über uns läuft.</p>}
        {zeilen.map(z => {
          const auf = offen.has(z.k.id);
          const e = ein.get(z.k.id);
          const ks = konten.get(z.k.id) || [];
          return (
            <div key={z.k.id} className="border-t border-border/60">
              <button type="button" aria-expanded={auf} onClick={() => setOffen(p => { const n = new Set(p); auf ? n.delete(z.k.id) : n.add(z.k.id); return n; })}
                className="w-full grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_9rem] gap-x-4 gap-y-1 px-6 py-3 text-left hover:bg-muted/30 transition-colors">
                <span className="col-span-2 md:col-span-1 flex items-center gap-1.5 font-medium min-w-0">
                  {auf ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className="truncate" title={z.k.name}>{z.k.name}</span>
                </span>
                <span className="md:text-right tabular-nums text-sm">{z.budget != null ? eur(z.budget) : <span className="text-muted-foreground">—</span>}</span>
                <span className="text-right tabular-nums text-sm">{eur(z.verbraucht)}</span>
                <span className={`md:text-right tabular-nums text-sm ${z.rest != null && z.rest < 0 ? 'text-destructive' : ''}`}>{z.rest != null ? eur(z.rest) : '—'}</span>
                <span className="flex items-center justify-end gap-2 text-sm tabular-nums">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: ampel(z.quote) }} />
                  {z.quote != null ? `${Math.round(z.quote * 100)} %` : <span className="text-xs text-muted-foreground">kein Budget hinterlegt</span>}
                </span>
              </button>
              {auf && (
                <div className="bg-muted/20 px-6 py-4 space-y-4 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Meta-Konten</p>
                    {ks.length === 0 ? <p className="text-muted-foreground">kein Meta-Konto verknüpft</p> : ks.map(k => {
                      const v = viewJe.get(norm(k.meta_account_id));
                      return (
                        <div key={k.meta_account_id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-1">
                          <span>{k.konto_name || v?.kontoname || k.meta_account_id} <span className="text-xs text-muted-foreground">· {ART_TEXT[k.art || 'unbekannt'] || k.art}</span></span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {v ? <>Tagesbudget {v.tagesbudget != null ? eur(Number(v.tagesbudget)) : '—'} · {v.kampagnen_aktiv ?? 0} aktive Kampagnen · {v.belege ?? 0} Belege · zuletzt aufgeladen {v.letzte_aufladung ? datum(v.letzte_aufladung) : '—'} · zuletzt an Meta {v.letzte_meta_zahlung ? datum(v.letzte_meta_zahlung) : '—'}</> : 'keine Kontodaten'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Zugeordnete Kampagnen und Anzeigengruppen · Spend seit Monatsbeginn</p>
                    {z.objekte.length === 0 ? <Link to="/kunden/verknuepfungen" className="text-muted-foreground underline underline-offset-2">keine Kampagne zugeordnet</Link> : z.objekte.map(({ o, summe, adsets }) => (
                      <div key={o.objekt_id} className="py-1">
                        <div className="flex justify-between gap-4">
                          <span>{o.objekt_name || o.objekt_id} <span className="text-xs text-muted-foreground">· {o.typ === 'konto' ? 'Ganzes Konto' : o.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'}</span></span>
                          <span className="tabular-nums">{eur(summe)}</span>
                        </div>
                        {adsets.map(a => <div key={a.name} className="flex justify-between gap-4 pl-4 text-xs text-muted-foreground"><span>{a.name}</span><span className="tabular-nums">{eur(a.spend)}</span></div>)}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Eingezahlt</p>
                    {e?.eingezahlt_netto != null ? (
                      <div className="space-y-0.5 tabular-nums">
                        <p>Letzte Aufladung {eur(Number(e.eingezahlt_netto))}{e.letzte_zahlung ? ` am ${datum(e.letzte_zahlung)}` : ''}</p>
                        {Number(e.zahlungen || 0) > 1 && e.uebertrag_frueher_netto != null && <p className="text-xs text-muted-foreground">+ {eur(Number(e.uebertrag_frueher_netto))} aus früheren Aufladungen · {e.zahlungen} Zahlungen</p>}
                        {e.aelteste_ueberfaellig && <p className="text-xs text-destructive">überfällig seit {datum(e.aelteste_ueberfaellig)}</p>}
                        {!!e.rechnungen_offen && <p className="text-xs text-muted-foreground">{e.rechnungen_offen} Rechnungen offen · {eur(Number(e.offen_netto || 0))}</p>}
                      </div>
                    ) : <OhneBetrag zst={zst.get(z.k.id)} quelle={bq.has(z.k.id) ? bq.get(z.k.id)! : undefined} />}
                    {lage.get(z.k.id) && <p className={`text-xs mt-1 ${lage.get(z.k.id) === 'fehlt_obwohl_pflicht' ? 'text-destructive' : 'text-muted-foreground'}`}>Einordnung: {LAGE_TEXT[lage.get(z.k.id)!] || lage.get(z.k.id)}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Begründung, warum kein eingezahlter Betrag vorliegt — nie geschätzt. */
function OhneBetrag({ zst, quelle }: { zst?: WerbebudgetZahlungsstatus; quelle?: string | null }) {
  if (quelle === 'lexoffice') return <span className="text-xs text-muted-foreground">lexoffice liefert keine Rechnungspositionen — Werbebudget hier nicht ermittelbar</span>;
  if (zst === 'keine_zahlungsverknuepfung' || quelle === null) return <Link to="/kunden/verknuepfungen" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">keine Buchhaltungsverknüpfung</Link>;
  if (zst === 'verknuepft_ohne_werbebudgetposten') return <span className="text-xs text-muted-foreground" title={OHNE_POSTEN_TOOLTIP}>kein Werbebudget-Posten auf den Rechnungen</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}
