import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { HealthKarte, HEALTH_KARTE, FARBE } from './HealthKarte';
import { ladeZahlungsstatus, OHNE_POSTEN_TOOLTIP, type WerbebudgetZahlungsstatus } from '@/lib/werbebudgetZahlungsstatus';
import { ladeKontenJeKunde, type KontoInfo } from '@/lib/budgetTraeger';

type Modus = 'ueber_uns' | 'kunde_zahlt' | 'leadkauf';
type Zuordnung = { id: string; modus: Modus; client_id: string; meta_account_id: string; untermarke: string | null; typ: 'konto' | 'kampagne' | 'adset'; objekt_id: string; kampagne_id: string | null; objekt_name: string | null };
type LeadLief = { id: string; zuordnung_id: string; von: string; bis: string; anzahl: number; preis: number; notiz: string | null };
type LeadErloes = { client_id: string; erloes_bezahlt_netto: number | null; erloes_offen_netto: number | null; rechnungen_bezahlt: number | null; rechnungen_offen: number | null; letzte_zahlung: string | null; aelteste_ueberfaellig: string | null };
type Eingezahlt = { client_id: string; quelle: string | null; eingezahlt_netto: number | null; uebertrag_frueher_netto: number | null; eingezahlt_gesamt_netto: number | null; zahlungen: number | null; offen_netto: number | null; rechnungen_offen: number | null; letzte_zahlung: string | null; aelteste_ueberfaellig: string | null };
type Spend = { meta_account_id: string; campaign_id: string | null; campaign_name: string | null; adset_id: string; adset_name: string | null; datum: string; spend: number };
type KontoView = { meta_account_id: string; kontoname: string | null; art: string | null; eingezahlt: number | null; ausgegeben: number | null; letzte_aufladung: string | null; letzte_meta_zahlung: string | null; belege: number | null; kampagnen_aktiv: number | null; tagesbudget: number | null };
type Snap = { campaign_id: string; campaign_name: string | null; account_id: string; status: string | null; daily_budget: number | null };
type Kunde = { id: string; name: string; kundenstatus: string | null; ads_budget: number | null; auto_stopp: boolean };
type Manuell = { id: string; client_id: string; meta_account_id?: string | null; datum: string; betrag_netto: number; quelle: string | null; beleg: string | null; notiz: string | null };
type Zahlung = { datum: string; betrag: number; nummer: string | null };

type Filter = 'alle' | 'uns' | 'kunde' | 'ueber';

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datum = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const norm = (s: string | null | undefined) => String(s ?? '').replace(/^act_/, '');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ART_TEXT: Record<string, string> = { untermarke: 'Untermarke', kunde_eigen: 'Kundeneigenes Konto', unbekannt: 'Art unbekannt' };
const LAGE_TEXT: Record<string, string> = { bezahlt: 'bezahlt', zahlt_meta_direkt: 'zahlt Meta direkt', fehlt_obwohl_pflicht: 'fehlt obwohl Pflicht', unbekannt: 'keine Zuordnung' };
const WB_REGEX = /(werbebudget|anzeigenbudget|mediabudget|media[ -]budget|ad[ -]?spend|werbekampagnen[ -]budget)/i;
const MODUS_TEXT: Record<Modus, string> = { ueber_uns: 'Über uns', kunde_zahlt: 'Kunde zahlt', leadkauf: 'Leadkauf' };
const GRID = 'md:grid-cols-[minmax(0,1fr)_9rem_8rem_8rem_8rem_8.5rem_8rem_5.5rem]';
const monatsErster = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };

async function ladeSpend(): Promise<Spend[]> {
  const out: Spend[] = [];
  for (let von = 0; von < 500000; von += 1000) {
    const { data, error } = await (supabase.from as any)('meta_spend_taeglich')
      .select('meta_account_id, campaign_id, campaign_name, adset_id, adset_name, datum, spend').range(von, von + 999);
    if (error) { console.error('meta_spend_taeglich', error.message); throw new Error(error.message); }
    out.push(...((data || []) as Spend[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Einzelne bezahlte Werbebudget-Posten eines Kunden aus Qonto (gleiche Erkennung wie werbebudget_eingezahlt). Nur lesend. */
async function ladeZahlungen(clientId: string): Promise<Zahlung[]> {
  const { data: links, error: lErr } = await supabase.from('qonto_client_links').select('qonto_client_name').eq('client_id', clientId);
  if (lErr) { console.error('qonto_client_links', lErr.message); return []; }
  const namen = [...new Set((links || []).map((l: any) => l.qonto_client_name).filter(Boolean))];
  if (!namen.length) return [];
  const { data, error } = await (supabase.from as any)('qonto_client_invoices').select('number, status, paid_at, raw').in('client_name', namen).not('paid_at', 'is', null);
  if (error) { console.error('qonto_client_invoices', error.message); return []; }
  const out: Zahlung[] = [];
  for (const q of (data || []) as any[]) {
    if (q.status === 'canceled') continue;
    const items = Array.isArray(q.raw?.items) ? q.raw.items : [];
    const summe = items.filter((i: any) => WB_REGEX.test(String(i?.title ?? ''))).reduce((s: number, i: any) => s + (Number(i?.subtotal?.value) || 0), 0);
    if (summe) out.push({ datum: q.paid_at, betrag: summe, nummer: q.number ?? null });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Werbebudget je Kunde: alle aktiven Kunden, Monatsbudget-Auslastung, direkte Pflege von Zahler, Cap und Auto-Stopp. */
export function Werbebudgets() {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [konten, setKonten] = useState<Map<string, KontoInfo[]>>(new Map());
  const [zuo, setZuo] = useState<Zuordnung[]>([]);
  const [ein, setEin] = useState<Map<string, Eingezahlt>>(new Map());
  const [view, setView] = useState<KontoView[]>([]);
  const [spend, setSpend] = useState<Spend[]>([]);
  const [snap, setSnap] = useState<Snap[]>([]);
  const [zst, setZst] = useState<Map<string, WerbebudgetZahlungsstatus>>(new Map());
  const [details, setDetails] = useState<Map<string, { quelle?: string | null; lage?: string; zahlungen?: Zahlung[] }>>(new Map());
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [manuell, setManuell] = useState<Manuell[]>([]);
  const [leads, setLeads] = useState<LeadLief[]>([]);
  const [lErl, setLErl] = useState<Map<string, LeadErloes>>(new Map());
  const [leadsAuf, setLeadsAuf] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('alle');
  const [nurAktiv, setNurAktiv] = useState(true);
  const [darfPflegen, setDarfPflegen] = useState(false);
  const [spendAb, setSpendAb] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('meta_spend_taeglich').select('datum').order('datum', { ascending: true }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (error) console.error('meta_spend_taeglich min(datum)', error.message); else setSpendAb((data as any)?.datum ?? null); });
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [a, f] = await Promise.all([
        supabase.rpc('has_role', { _user_id: u.user.id, _role: 'admin' }),
        (supabase.rpc as any)('user_has_permission', { target_user_id: u.user.id, requested_permission_key: 'finanzen.manage' }),
      ]);
      setDarfPflegen(!!a.data || !!f.data);
    })();
  }, []);

  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const [c, z, e, v, s, km, sp, mz, wl, le] = await Promise.all([
        supabase.from('clients').select('id, name, kundenstatus, ads_budget, auto_stopp').is('deleted_at', null),
        (supabase.from as any)('werbebudget_zuordnung').select('id, modus, client_id, meta_account_id, untermarke, typ, objekt_id, kampagne_id, objekt_name'),
        (supabase.from as any)('werbebudget_eingezahlt').select('*'),
        (supabase.from as any)('untermarke_werbebudget').select('meta_account_id, kontoname, art, eingezahlt, ausgegeben, letzte_aufladung, letzte_meta_zahlung, belege, kampagnen_aktiv, tagesbudget'),
        supabase.from('meta_campaign_snapshot').select('campaign_id, campaign_name, account_id, status, daily_budget'),
        ladeKontenJeKunde(),
        ladeSpend(),
        supabase.from('werbebudget_zahlung').select('id, client_id, meta_account_id, datum, betrag_netto, quelle, beleg, notiz').order('datum', { ascending: false }),
        (supabase.from as any)('werbebudget_leads').select('id, zuordnung_id, von, bis, anzahl, preis, notiz').order('von', { ascending: false }),
        (supabase.from as any)('leadkauf_erloes').select('*'),
      ]);
      for (const [n, r] of [['werbebudget_zahlung', mz], ['clients', c], ['werbebudget_zuordnung', z], ['werbebudget_eingezahlt', e], ['untermarke_werbebudget', v], ['meta_campaign_snapshot', s], ['werbebudget_leads', wl], ['leadkauf_erloes', le]] as const)
        if ((r as any).error) console.error(n, (r as any).error.message);
      const ks = ((c.data || []) as any[]).filter(k => k.name) as Kunde[];
      const zs0 = await ladeZahlungsstatus(ks.map(k => k.id));
      setKunden(ks); setKonten(km); setZuo((z.data || []) as Zuordnung[]);
      setEin(new Map(((e.data || []) as Eingezahlt[]).map(r => [r.client_id, r])));
      setManuell((mz.data || []) as Manuell[]); setView((v.data || []) as KontoView[]); setSnap((s.data || []) as Snap[]); setSpend(sp);
      setLeads((wl.data || []) as LeadLief[]);
      setLErl(new Map(((le.data || []) as LeadErloes[]).map(r => [r.client_id, r])));
      setZst(zs0 as Map<string, WerbebudgetZahlungsstatus>);
    } catch (err) { setFehler((err as Error).message); }
    setLaedt(false);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const ladeDetails = useCallback(async (id: string) => {
    if (details.has(id)) return;
    const [q, l, zahlungen] = await Promise.all([
      (supabase.rpc as any)('kunde_buchhaltungsquelle', { p_client_id: id }),
      (supabase.rpc as any)('werbebudget_lage', { p_client_id: id }),
      ladeZahlungen(id),
    ]);
    if (q.error) console.error('kunde_buchhaltungsquelle', id, q.error.message);
    if (l.error) console.error('werbebudget_lage', id, l.error.message);
    setDetails(p => new Map(p).set(id, { quelle: q.error ? undefined : (q.data ?? null), lage: l.data || undefined, zahlungen }));
  }, [details]);

  /** Felder eines Kunden sofort speichern; optimistisch, bei Fehler zurück. */
  const speichern = useCallback(async (id: string, patch: Partial<Pick<Kunde, 'ads_budget' | 'auto_stopp'>>) => {
    const vorher = kunden.find(k => k.id === id);
    if (!vorher) return;
    setKunden(p => p.map(k => k.id === id ? { ...k, ...patch } : k));
    const { error } = await supabase.from('clients').update(patch as any).eq('id', id);
    if (error) {
      setKunden(p => p.map(k => k.id === id ? vorher : k));
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
    }
  }, [kunden]);

  /** Modus einer Zuordnung sofort speichern; optimistisch, bei Fehler zurück. */
  const modusSetzen = useCallback(async (id: string, modus: Modus) => {
    const vorher = zuo.find(z => z.id === id);
    if (!vorher || vorher.modus === modus) return;
    setZuo(p => p.map(z => z.id === id ? { ...z, modus } : z));
    const { error } = await (supabase.from as any)('werbebudget_zuordnung').update({ modus }).eq('id', id);
    if (error) { setZuo(p => p.map(z => z.id === id ? vorher : z)); toast.error(`Speichern fehlgeschlagen: ${error.message}`); }
  }, [zuo]);

  /** Konto-Art sofort speichern (quelle='manuell'); optimistisch, bei Fehler zurück. Modi der Zuordnungen bleiben unberührt. */
  const artSetzen = useCallback(async (kontoId: string, art: 'untermarke' | 'kunde_eigen', kontoName: string | null) => {
    const id = norm(kontoId);
    const vorKonten = konten, vorView = view;
    const setArt = (a: string | null) => {
      setKonten(p => { const m = new Map<string, KontoInfo[]>(); p.forEach((l, k) => m.set(k, l.map(x => norm(x.meta_account_id) === id ? { ...x, art: a } : x))); return m; });
      setView(p => p.map(v => norm(v.meta_account_id) === id ? { ...v, art: a } : v));
    };
    setArt(art);
    const { error } = await (supabase.from as any)('meta_konto_art').upsert(
      { meta_account_id: id, konto_name: kontoName, art, quelle: 'manuell', aktualisiert_am: new Date().toISOString() },
      { onConflict: 'meta_account_id' });
    if (error) { setKonten(vorKonten); setView(vorView); toast.error(`Konto-Art nicht gespeichert: ${error.message}`); }
  }, [konten, view]);

  /** Mehrere Zuordnungen gezielt auf einen Modus setzen (nur per Knopf ausgelöst). */
  const modiSetzen = useCallback(async (ids: string[], modus: Modus) => {
    if (!ids.length) return;
    const vorher = zuo;
    setZuo(p => p.map(z => ids.includes(z.id) ? { ...z, modus } : z));
    const { error } = await (supabase.from as any)('werbebudget_zuordnung').update({ modus }).in('id', ids);
    if (error) { setZuo(vorher); toast.error(`Umstellen fehlgeschlagen: ${error.message}`); }
  }, [zuo]);

  const leadAnlegen = useCallback(async (row: Omit<LeadLief, 'id'>) => {
    const { data, error } = await (supabase.from as any)('werbebudget_leads').insert(row).select('id, zuordnung_id, von, bis, anzahl, preis, notiz').single();
    if (error) { toast.error(`Speichern fehlgeschlagen: ${error.message}`); return false; }
    setLeads(p => [data as LeadLief, ...p]);
    return true;
  }, []);

  const leadLoeschen = useCallback(async (id: string) => {
    const vorher = leads;
    setLeads(p => p.filter(l => l.id !== id));
    const { error } = await (supabase.from as any)('werbebudget_leads').delete().eq('id', id);
    if (error) { setLeads(vorher); toast.error(`Löschen fehlgeschlagen: ${error.message}`); }
  }, [leads]);

  const zahlungAnlegen = useCallback(async (row: Omit<Manuell, 'id'>) => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('werbebudget_zahlung').insert({ ...row, erfasst_von: u.user?.id ?? null }).select('id, client_id, meta_account_id, datum, betrag_netto, quelle, beleg, notiz').single();
    if (error) { toast.error(`Speichern fehlgeschlagen: ${error.message}`); return false; }
    setManuell(p => [data as Manuell, ...p].sort((x, y) => y.datum.localeCompare(x.datum)));
    return true;
  }, []);

  const zahlungLoeschen = useCallback(async (id: string) => {
    const vorher = manuell;
    setManuell(p => p.filter(m => m.id !== id));
    const { error } = await supabase.from('werbebudget_zahlung').delete().eq('id', id);
    if (error) { setManuell(vorher); toast.error(`Löschen fehlgeschlagen: ${error.message}`); }
  }, [manuell]);

  const monatStart = monatsErster();

  /** Kontokorrent je Kunde: Verbrauch nur über Zuordnungen mit Modus „Über uns“ (Kampagne: alle Adsets; Adset: nur dieses; Konto: alles). */
  const zeilen = useMemo(() => kunden.map(k => {
    const objs = zuo.filter(z => z.client_id === k.id);
    const gezaehlt = new Set<string>();
    let verbraucht = 0, monat = 0;
    const jeModus: Record<Modus, number> = { ueber_uns: 0, kunde_zahlt: 0, leadkauf: 0 };
    const objekte = objs.map(o => {
      const treffer = spend.filter(r => o.typ === 'adset' ? r.adset_id === o.objekt_id : o.typ === 'kampagne' ? r.campaign_id === o.objekt_id : norm(r.meta_account_id) === norm(o.objekt_id || o.meta_account_id));
      let gesamt = 0, imMonat = 0;
      for (const r of treffer) {
        const b = Number(r.spend || 0);
        gesamt += b; if (r.datum >= monatStart) imMonat += b;
        if (o.modus !== 'ueber_uns') continue;
        const key = `${r.adset_id}|${r.datum}`;
        if (gezaehlt.has(key)) continue;
        gezaehlt.add(key);
        verbraucht += b;
        if (r.datum >= monatStart) monat += b;
      }
      jeModus[o.modus] = (jeModus[o.modus] || 0) + gesamt;
      let perioden: Periode[] = [], lead: LeadR | null = null;
      if (o.modus === 'leadkauf') {
        const eindeutig = new Map<string, number>();
        for (const r of treffer) { const key = `${r.adset_id}|${r.datum}`; if (!eindeutig.has(key)) eindeutig.set(key, Number(r.spend || 0)); }
        const tage = [...eindeutig.entries()].map(([key, b]) => ({ datum: key.split('|')[1], b }));
        perioden = leads.filter(l => l.zuordnung_id === o.id).sort((x, y) => y.von.localeCompare(x.von)).map(l => {
          const kosten = tage.filter(t => t.datum >= l.von && t.datum <= l.bis).reduce((s, t) => s + t.b, 0);
          const n = Number(l.anzahl) || 0, preis = Number(l.preis) || 0, erloes = n * preis;
          return { l, kosten, erloes, marge: erloes - kosten, istJeLead: n > 0 ? kosten / n : null, preis };
        });
        lead = leadRechnung(perioden);
      }
      return { o, gesamt, imMonat, perioden, lead };
    });
    const anzahl: Record<Modus, number> = { ueber_uns: 0, kunde_zahlt: 0, leadkauf: 0 };
    objs.forEach(o => { anzahl[o.modus] = (anzahl[o.modus] || 0) + 1; });
    const autoEin = Number(ein.get(k.id)?.eingezahlt_gesamt_netto) || 0;
    const manEin = manuell.filter(m => m.client_id === k.id).reduce((s, m) => s + Number(m.betrag_netto || 0), 0);
    const eingezahlt = autoEin + manEin;
    const saldo = eingezahlt - verbraucht;
    const budget = k.ads_budget != null && Number(k.ads_budget) > 0 ? Number(k.ads_budget) : null;
    const quote = budget ? monat / budget : null;
    const traeger: 'uns' | 'kunde' | null = anzahl.ueber_uns > 0 ? 'uns' : objs.length ? 'kunde' : null;
    return { k, objekte, verbraucht, monat, budget, quote, traeger, anzahl, jeModus, eingezahlt, saldo };
  }).sort((a, b) => (a.traeger === 'uns' ? 0 : 1) - (b.traeger === 'uns' ? 0 : 1) || a.saldo - b.saldo || a.k.name.localeCompare(b.k.name)), [kunden, zuo, spend, ein, manuell, monatStart, leads]);

  const sichtbar = useMemo(() => zeilen
    .filter(z => !nurAktiv || z.k.kundenstatus === 'In Betreuung')
    .filter(z => filter === 'alle' ? true : filter === 'uns' ? z.traeger === 'uns' : filter === 'kunde' ? z.traeger === 'kunde' : z.quote != null && z.quote >= 1), [zeilen, filter, nurAktiv]);

  const kontoIds = useMemo(() => new Set(sichtbar.flatMap(z => (konten.get(z.k.id) || []).map(x => norm(x.meta_account_id)))), [sichtbar, konten]);
  const summen = useMemo(() => {
    const vs = view.filter(v => kontoIds.has(norm(v.meta_account_id)));
    return { eingezahlt: vs.reduce((s, v) => s + Number(v.eingezahlt || 0), 0), ausgegeben: vs.reduce((s, v) => s + Number(v.ausgegeben || 0), 0), konten: vs.length };
  }, [view, kontoIds]);
  const ueberBudget = sichtbar.filter(z => z.quote != null && z.quote >= 1).length;

  /** Zeile 1: Aktive Kampagnen auf Untermarken-Konten der angezeigten Kunden ohne jede Kundenzuordnung (live berechnet). */
  const ohneZuordnung = useMemo(() => {
    const artVon = new Map(view.map(v => [norm(v.meta_account_id), v.art]));
    const unter = new Set<string>();
    for (const z of sichtbar) for (const ki of konten.get(z.k.id) || []) {
      const id = norm(ki.meta_account_id);
      if ((ki.art || artVon.get(id)) === 'untermarke') unter.add(id);
    }
    const ganzeKonten = new Set(zuo.filter(z => z.typ === 'konto').map(z => norm(z.objekt_id || z.meta_account_id)));
    const kampagnen = new Set(zuo.filter(z => z.typ === 'kampagne').map(z => z.objekt_id));
    zuo.filter(z => z.typ === 'adset' && z.kampagne_id).forEach(z => kampagnen.add(z.kampagne_id!));
    const offene = snap.filter(s => s.status === 'ACTIVE' && unter.has(norm(s.account_id)) && !ganzeKonten.has(norm(s.account_id)) && !kampagnen.has(s.campaign_id));
    return { kampagnen: offene.length, konten: new Set(offene.map(s => norm(s.account_id))).size };
  }, [sichtbar, konten, view, zuo, snap]);

  /** Zeile 2: Aktive Kampagnen auf Untermarken-Konten, die keinem einzigen Kunden zugeordnet oder verknüpft sind. */
  const herrenlos = useMemo(() => {
    const verknuepft = new Set<string>();
    for (const liste of konten.values()) for (const ki of liste) verknuepft.add(norm(ki.meta_account_id));
    zuo.forEach(z => verknuepft.add(norm(z.meta_account_id)));
    const ids = view.filter(v => v.art === 'untermarke').map(v => norm(v.meta_account_id)).filter(id => !verknuepft.has(id));
    const idSet = new Set(ids);
    const offene = snap.filter(s => s.status === 'ACTIVE' && idSet.has(norm(s.account_id)));
    return { kampagnen: offene.length, konten: new Set(offene.map(s => norm(s.account_id))).size };
  }, [konten, zuo, view, snap]);

  if (laedt) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  const viewJe = new Map(view.map(v => [norm(v.meta_account_id), v]));
  const snapJe = new Map(snap.map(s => [s.campaign_id, s]));
  /** Ampel nach Saldo: rot ≤ 0, gelb unter einem Monatsbudget, sonst grün; ohne Budget nur am Vorzeichen. */
  const ampel = (saldo: number, budget: number | null) => saldo <= 0 ? FARBE.rot : budget != null && saldo < budget ? 'hsl(var(--warning))' : FARBE.gruen;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Werbebudgets</h1>
          <p className="text-sm text-muted-foreground">Kontokorrent je Kunde: Eingezahlt gegen Verbrauch über uns, Monatsauslastung zur Orientierung</p>
        </div>
        <Button variant="outline" size="sm" onClick={laden} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Aktualisieren</Button>
      </div>

      {fehler && <p className="text-sm text-destructive">Fehler beim Laden: {fehler}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HealthKarte titel="Kunden über Budget" farbe={ueberBudget ? FARBE.rot : FARBE.gruen} wert={String(ueberBudget)} satz={`von ${sichtbar.length} Kunden haben ihr Monatsbudget im laufenden Monat erreicht oder überschritten.`} />
        <HealthKarte titel="Eingezahlt gesamt" farbe={FARBE.primaer} wert={eur(summen.eingezahlt)} satz={`Werbebudget-Zahlungen auf den ${summen.konten} Konten dieser Kunden.`} />
        <HealthKarte titel="Bei Meta ausgegeben gesamt" farbe={FARBE.grau} wert={eur(summen.ausgegeben)} satz="Tatsächlich an Meta gezahlt laut Zahlungsbelegen dieser Konten." />
      </div>
      {spendAb && <p className="text-xs text-muted-foreground -mt-2">Verbrauchsdaten ab {datum(spendAb)}</p>}

      {(ohneZuordnung.kampagnen > 0 || herrenlos.kampagnen > 0) && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            {ohneZuordnung.kampagnen > 0 && (
              <p>{ohneZuordnung.kampagnen} aktive Kampagnen auf {ohneZuordnung.konten} Konten sind keinem Kunden zugeordnet — deren Ausgaben fehlen in der Auswertung.{' '}
                <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 font-medium">Zur Zuordnung</Link></p>
            )}
            {herrenlos.kampagnen > 0 && (
              <p>{herrenlos.kampagnen} aktive Kampagnen auf {herrenlos.konten} Konten gehören zu keinem Kunden im CRM.{' '}
                <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 font-medium">Zur Zuordnung</Link></p>
            )}
          </div>
        </div>
      )}

      {spend.length === 0 && <p className="text-xs text-muted-foreground">Es liegen noch keine Meta-Ausgaben vor — der Spend-Sync hat noch nicht geliefert. „Verbraucht" bleibt bis dahin 0 €.</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="alle">Alle</TabsTrigger>
              <TabsTrigger value="uns">Läuft über uns</TabsTrigger>
              <TabsTrigger value="kunde">Zahlt selbst</TabsTrigger>
              <TabsTrigger value="ueber">Über Budget</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Switch checked={nurAktiv} onCheckedChange={setNurAktiv} aria-label="Nur aktive Kunden" />
            Nur aktive Kunden
          </label>
        </div>

        <div className={`${HEALTH_KARTE} p-0 sm:p-0 overflow-hidden`}>
          <div className={`hidden md:grid ${GRID} gap-4 px-6 py-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground items-end`}>
            <span>Kunde</span><span>Modus</span><Tooltip><TooltipTrigger asChild><span className="text-right cursor-help">Eingezahlt gesamt</span></TooltipTrigger><TooltipContent>Bezahlte Werbebudget-Posten aus den Rechnungen plus manuell erfasste Zahlungen.</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><span className="text-right cursor-help">Verbraucht gesamt</span></TooltipTrigger><TooltipContent>Meta-Ausgaben aller Zeiten, nur über Zuordnungen „Über uns“.</TooltipContent></Tooltip><span className="text-right">Saldo</span><span className="text-right">Monatsbudget</span><span className="text-right">Auslastung Monat</span><span className="text-right">Stoppen</span>
          </div>
          {sichtbar.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">Keine Kunden für diesen Filter.</p>}
          {sichtbar.map(z => {
            const auf = offen.has(z.k.id);
            const umschalten = () => { setOffen(p => { const n = new Set(p); auf ? n.delete(z.k.id) : n.add(z.k.id); return n; }); if (!auf) ladeDetails(z.k.id); };
            const stoppGrund = z.anzahl.ueber_uns === 0 ? 'Nur möglich mit mindestens einer Zuordnung „Über uns“' : null;
            return (
              <div key={z.k.id} className="border-t border-border/60">
                <div className={`grid grid-cols-2 ${GRID} gap-x-4 gap-y-2 px-6 py-3 items-center hover:bg-muted/30 transition-colors`}>
                  <button type="button" aria-expanded={auf} onClick={umschalten} className="col-span-2 md:col-span-1 flex items-start gap-1.5 font-medium text-left min-w-0">
                    {auf ? <ChevronDown className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />}
                    <span className="break-words">{z.k.name}</span>
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {z.objekte.length === 0
                      ? <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 hover:text-foreground">keine Kampagne zugeordnet</Link>
                      : (Object.keys(MODUS_TEXT) as Modus[]).filter(m => z.anzahl[m]).map(m => `${z.anzahl[m]} ${MODUS_TEXT[m].toLowerCase().replace('über uns', 'über uns')}`).join(' · ')}
                  </span>
                  <span className="md:text-right text-sm tabular-nums"><span className="md:hidden text-xs text-muted-foreground mr-1">Eingezahlt</span>{(() => {
                    const lb = Number(lErl.get(z.k.id)?.erloes_bezahlt_netto) || 0;
                    if (z.eingezahlt === 0 && z.anzahl.leadkauf > 0 && lb > 0) return <span className="inline-flex flex-col md:items-end">{eur(lb)}<span className="text-xs text-muted-foreground">Leadkauf</span></span>;
                    if (z.eingezahlt > 0 && lb > 0) return <span className="inline-flex flex-col md:items-end">{eur(z.eingezahlt)}<span className="text-xs text-muted-foreground">+ Leadkauf {eur(lb)}</span></span>;
                    return z.eingezahlt ? eur(z.eingezahlt) : '—';
                  })()}</span>
                  <span className="md:text-right text-sm tabular-nums"><span className="md:hidden text-xs text-muted-foreground mr-1">Verbraucht</span>{eur(z.verbraucht)}</span>
                  <span className={`flex items-center md:justify-end gap-2 text-sm tabular-nums ${z.saldo < 0 ? 'text-destructive' : ''}`}>
                    <span className="md:hidden text-xs text-muted-foreground">Saldo</span>
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: ampel(z.saldo, z.budget) }} />
                    {eur(z.saldo)}
                  </span>
                  <BudgetFeld wert={z.k.ads_budget} onSave={n => speichern(z.k.id, { ads_budget: n })} />
                  <span className="md:text-right text-sm tabular-nums">
                    <span className="md:hidden text-xs text-muted-foreground mr-1">Auslastung</span>
                    {z.quote != null ? `${Math.round(z.quote * 100)} %` : <span className="text-xs text-muted-foreground">kein Budget hinterlegt</span>}
                  </span>
                  <span className="flex md:justify-end items-center gap-2">
                    <span className="md:hidden text-xs text-muted-foreground">Bei Überschreitung stoppen</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span><Switch aria-label="Bei Überschreitung stoppen" checked={!stoppGrund && z.k.auto_stopp} disabled={!!stoppGrund} onCheckedChange={v => speichern(z.k.id, { auto_stopp: v })} /></span>
                      </TooltipTrigger>
                      <TooltipContent>{stoppGrund || 'Bei Überschreitung stoppen'}</TooltipContent>
                    </Tooltip>
                  </span>
                </div>
                {auf && (
                  <div className="bg-muted/20 px-4 sm:px-6 py-4 space-y-4">
                    <KontoBlock clientId={z.k.id} ks={konten.get(z.k.id) || []} viewJe={viewJe} zuo={zuo.filter(x => x.client_id === z.k.id)} darf={darfPflegen} onArt={artSetzen} onModi={modiSetzen} manuell={manuell.filter(m => m.client_id === z.k.id)} onAdd={zahlungAnlegen} onDelete={zahlungLoeschen} />
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Zugeordnete Kampagnen und Anzeigengruppen</CardTitle></CardHeader>
                      <CardContent>
                        {z.objekte.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Diesem Kunden ist keine Kampagne und keine Anzeigengruppe zugeordnet — sein Verbrauch wird nicht erfasst.{' '}
                            <Link to="/kunden/verknuepfungen" className="underline underline-offset-2 text-foreground">Zur Zuordnung</Link>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead>Name</TableHead><TableHead>Ebene</TableHead><TableHead>Status</TableHead><TableHead>Modus</TableHead>
                              <TableHead className="text-right">Dieser Monat</TableHead><TableHead className="text-right">Gesamt</TableHead><TableHead className="text-right">Tagesbudget</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {z.objekte.map(({ o, gesamt, imMonat, perioden, lead }) => {
                                const camp = o.typ === 'kampagne' ? snapJe.get(o.objekt_id) : o.typ === 'adset' && o.kampagne_id ? snapJe.get(o.kampagne_id) : undefined;
                                const kontoCamps = o.typ === 'konto' ? snap.filter(s => norm(s.account_id) === norm(o.objekt_id || o.meta_account_id)) : [];
                                const status = o.typ === 'konto' ? (kontoCamps.some(s => s.status === 'ACTIVE') ? 'ACTIVE' : kontoCamps.length ? 'PAUSED' : null) : camp?.status ?? null;
                                const tb = o.typ === 'kampagne' ? (camp?.daily_budget != null ? camp.daily_budget / 100 : null)
                                  : o.typ === 'konto' ? (kontoCamps.some(s => s.status === 'ACTIVE' && s.daily_budget != null) ? kontoCamps.filter(s => s.status === 'ACTIVE').reduce((s, c) => s + Number(c.daily_budget || 0), 0) / 100 : null) : null;
                                return (
                                  <Fragment key={`${o.typ}-${o.objekt_id}`}><TableRow>
                                    <TableCell className="break-words">{o.objekt_name || camp?.campaign_name || o.objekt_id}</TableCell>
                                    <TableCell><Badge variant="outline">{o.typ === 'konto' ? 'Ganzes Konto' : o.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'}</Badge></TableCell>
                                    <TableCell>
                                      {status == null ? <span className="text-xs text-muted-foreground">unbekannt</span>
                                        : status === 'ACTIVE' ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15" variant="outline" title={o.typ === 'adset' ? 'Status der Kampagne' : undefined}>aktiv</Badge>
                                        : <Badge variant="secondary" title={o.typ === 'adset' ? 'Status der Kampagne' : undefined}>pausiert</Badge>}
                                    </TableCell>
                                    <TableCell><ModusSchalter wert={o.modus} onChange={m => modusSetzen(o.id, m)} /></TableCell>
                                    <TableCell className="text-right tabular-nums">{eur(imMonat)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{eur(gesamt)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{tb != null ? eur(tb) : '—'}</TableCell>
                                  </TableRow>
                                  {o.modus === 'leadkauf' && (() => { const la = leadsAuf.has(o.id); return (
                                    <TableRow className="hover:bg-transparent">
                                      <TableCell colSpan={7} className="pt-0">
                                        <button type="button" aria-expanded={la} onClick={() => setLeadsAuf(p => { const n = new Set(p); la ? n.delete(o.id) : n.add(o.id); return n; })} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                                          {la ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Leadlieferungen
                                          {lead && <span className="font-normal tabular-nums"> · Erlös {eur(lead.erloes)} · Kosten {eur(lead.kosten)} · <span className={lead.marge < 0 ? 'text-destructive' : 'text-success'}>Marge {eur(lead.marge)}</span></span>}
                                        </button>
                                        {la && <LeadLieferungen zuordnungId={o.id} perioden={perioden} darf={darfPflegen} onAdd={leadAnlegen} onDelete={leadLoeschen} />}
                                      </TableCell>
                                    </TableRow>
                                  ); })()}</Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                        {z.objekte.length > 0 && (
                          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                            Über uns {eur(z.jeModus.ueber_uns)} · Kunde zahlt {eur(z.jeModus.kunde_zahlt)} · Leadkauf {eur(z.jeModus.leadkauf)}
                            {(() => { const rs = z.objekte.map(x => x.lead).filter(Boolean) as LeadR[]; if (!rs.length) return null; const m = rs.reduce((s, r) => s + r.marge, 0); return <> · <span className={`font-medium ${m < 0 ? 'text-destructive' : 'text-success'}`}>Leadkauf-Marge {eur(m)}</span></>; })()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <ZahlungenBlock clientId={z.k.id} manuell={manuell.filter(m => m.client_id === z.k.id)} onAdd={zahlungAnlegen} onDelete={zahlungLoeschen} e={ein.get(z.k.id)} d={details.get(z.k.id)} zst={zst.get(z.k.id)} ks={konten.get(z.k.id) || []} viewJe={viewJe} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

function ModusSchalter({ wert, onChange }: { wert: Modus; onChange: (m: Modus) => void }) {
  return (
    <span className="inline-flex rounded-lg bg-muted p-0.5 w-fit">
      {(Object.keys(MODUS_TEXT) as Modus[]).map(m => (
        <button key={m} type="button" aria-pressed={wert === m} onClick={() => wert !== m && onChange(m)}
          className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${wert === m ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{MODUS_TEXT[m]}</button>
      ))}
    </span>
  );
}

function BudgetFeld({ wert, onSave }: { wert: number | null; onSave: (n: number | null) => void }) {
  const zuText = (n: number | null) => n != null && Number(n) > 0 ? Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '';
  const [text, setText] = useState(zuText(wert));
  useEffect(() => { setText(zuText(wert)); }, [wert]);
  const sichern = () => {
    const t = text.trim();
    const n = t === '' ? null : Number(t.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.'));
    if (n != null && (!Number.isFinite(n) || n < 0)) { toast.error('Bitte einen gültigen Betrag eingeben'); setText(zuText(wert)); return; }
    if ((n ?? null) === (wert != null && Number(wert) > 0 ? Number(wert) : null)) { setText(zuText(wert)); return; }
    onSave(n);
  };
  return (
    <div className="relative md:ml-auto w-full md:w-[8.5rem]">
      <Input aria-label="Monatsbudget" inputMode="decimal" value={text} placeholder="kein Budget" onChange={e => setText(e.target.value)} onBlur={sichern}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(zuText(wert)); } }}
        className="h-8 pr-6 text-right tabular-nums text-sm" />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">{label}</p><div className="text-sm break-words">{children}</div></div>;
}


function KontoBlock({ clientId, ks, viewJe, zuo, darf, onArt, onModi, manuell, onAdd, onDelete }: { clientId: string; ks: KontoInfo[]; viewJe: Map<string, KontoView>; zuo: Zuordnung[]; darf: boolean; onArt: (id: string, art: 'untermarke' | 'kunde_eigen', name: string | null) => void; onModi: (ids: string[], m: Modus) => void; manuell: Manuell[]; onAdd: (r: Omit<Manuell, 'id'>) => Promise<boolean>; onDelete: (id: string) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Konto</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {ks.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Kein Meta-Konto verknüpft.</div> : ks.map((k, i) => {
          const v = viewJe.get(norm(k.meta_account_id));
          const art = k.art || v?.art || 'unbekannt';
          const id = norm(k.meta_account_id);
          // Leadkauf-Zuordnungen bleiben beim Umschalten immer unangetastet.
          const eigene = zuo.filter(x => norm(x.meta_account_id) === id && x.modus !== 'leadkauf');
          const klick = () => {
            const neu: 'untermarke' | 'kunde_eigen' = art === 'kunde_eigen' ? 'untermarke' : art === 'untermarke' ? 'kunde_eigen' : 'kunde_eigen';
            onArt(k.meta_account_id, neu, k.konto_name || v?.kontoname || null);
            const ziel: Modus = neu === 'untermarke' ? 'ueber_uns' : 'kunde_zahlt';
            onModi(eigene.filter(x => x.modus !== ziel).map(x => x.id), ziel);
          };
          return (
            <div key={k.meta_account_id} className="space-y-4">
              {i > 0 && <Separator />}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Feld label="Kontoname">{k.konto_name || v?.kontoname || '—'}</Feld>
                <Feld label="Konto-Art">
                  {darf ? (
                    <KontoArtMitAusnahme art={art} onKlick={klick} eigene={eigene} onModi={onModi} clientId={clientId} kontoId={id}
                      rows={manuell.filter(m => m.quelle === AUSNAHME_QUELLE && norm(m.meta_account_id) === id)} onAdd={onAdd} onDelete={onDelete} />
                  ) : <Badge variant={art === 'untermarke' ? 'default' : 'outline'}>{ART_TEXT[art] || art}</Badge>}
                </Feld>
                <Feld label="Kontonummer"><span className="tabular-nums">{id}</span></Feld>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function KontoArtMitAusnahme({ art, onKlick, eigene, onModi, clientId, kontoId, rows, onAdd, onDelete }: { art: string; onKlick: () => void; eigene: Zuordnung[]; onModi: (ids: string[], m: Modus) => void; clientId: string; kontoId: string; rows: Manuell[]; onAdd: (r: Omit<Manuell, 'id'>) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [auf, setAuf] = useState(false);
  const [betrag, setBetrag] = useState('');
  const [sendet, setSendet] = useState(false);
  const mitzaehlen = eigene.length > 0 && eigene.every(x => x.modus === 'ueber_uns');
  const schalten = (an: boolean) => { const ziel: Modus = an ? 'ueber_uns' : 'kunde_zahlt'; onModi(eigene.filter(x => x.modus !== ziel).map(x => x.id), ziel); };
  const erfassen = async () => {
    const n = parseBetrag(betrag);
    if (n == null || n <= 0) { toast.error('Bitte einen gültigen Betrag eingeben'); return; }
    setSendet(true);
    const ok = await onAdd({ client_id: clientId, meta_account_id: kontoId, datum: iso(new Date()), betrag_netto: n, quelle: AUSNAHME_QUELLE, beleg: null, notiz: null });
    setSendet(false);
    if (ok) setBetrag('');
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onKlick} title="Klicken zum Umschalten" className="rounded-full transition-opacity hover:opacity-80 cursor-pointer">
          <Badge variant={art === 'untermarke' ? 'default' : 'outline'} className="cursor-pointer hover:bg-muted/60">{ART_TEXT[art] || art}</Badge>
        </button>
        <button type="button" aria-expanded={auf} onClick={() => setAuf(a => !a)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Ausnahme</button>
      </div>
      {auf && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3 text-xs">
          <label className="flex items-center gap-2">
            <Switch checked={mitzaehlen} disabled={eigene.length === 0} onCheckedChange={schalten} aria-label="Verbrauch dieses Kontos trotzdem mitzählen" />
            <span>Verbrauch dieses Kontos trotzdem mitzählen</span>
          </label>
          <div className="space-y-1.5">
            <p className="text-muted-foreground">Zahlt uns dafür (netto)</p>
            <div className="flex gap-2">
              <Input aria-label="Zahlt uns dafür (netto)" inputMode="decimal" placeholder="Betrag" value={betrag} onChange={e => setBetrag(e.target.value)} className="h-7 w-28 text-sm text-right tabular-nums" />
              <Button size="sm" variant="outline" className="h-7" disabled={sendet} onClick={erfassen}>Erfassen</Button>
            </div>
            {rows.map(m => (
              <div key={m.id} className="flex items-center gap-2 tabular-nums">
                <span className="text-muted-foreground">{datum(m.datum)}</span><span>{eur(Number(m.betrag_netto))}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Betrag löschen" onClick={() => { if (confirm('Diesen Betrag löschen?')) onDelete(m.id); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ZahlungenBlock({ clientId, manuell, onAdd, onDelete, e, d, zst, ks, viewJe }: { clientId: string; manuell: Manuell[]; onAdd: (r: Omit<Manuell, 'id'>) => Promise<boolean>; onDelete: (id: string) => void; e?: Eingezahlt; d?: { quelle?: string | null; lage?: string; zahlungen?: Zahlung[] }; zst?: WerbebudgetZahlungsstatus; ks: KontoInfo[]; viewJe: Map<string, KontoView> }) {
  const zahlungen = d?.zahlungen;
  const summe = (zahlungen || []).reduce((s, z) => s + z.betrag, 0);
  const vs = ks.map(k => viewJe.get(norm(k.meta_account_id))).filter(Boolean) as KontoView[];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Zahlungen</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!d ? <Skeleton className="h-16" /> : zahlungen && zahlungen.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Rechnung</TableHead><TableHead className="text-right">Betrag (netto)</TableHead></TableRow></TableHeader>
            <TableBody>
              {zahlungen.map((z, i) => (
                <TableRow key={`${z.nummer}-${i}`}>
                  <TableCell className="tabular-nums">{datum(z.datum)}</TableCell>
                  <TableCell className="text-muted-foreground">{z.nummer || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(z.betrag)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter><TableRow><TableCell colSpan={2}>Summe</TableCell><TableCell className="text-right tabular-nums">{eur(summe)}</TableCell></TableRow></TableFooter>
          </Table>
        ) : <div className="rounded-lg border border-dashed p-4"><OhneBetrag zst={zst} quelle={d.quelle} /></div>}

        <ManuellAbschnitt clientId={clientId} rows={manuell.filter(m => m.quelle !== AUSNAHME_QUELLE)} onAdd={onAdd} onDelete={onDelete} />

        {(() => {
          const auto = Number(e?.eingezahlt_gesamt_netto) || 0;
          const man = manuell.reduce((s, m) => s + Number(m.betrag_netto || 0), 0);
          return (
            <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/40 p-3">
              <Feld label="Automatisch erkannt"><span className="tabular-nums">{eur(auto)}</span></Feld>
              <Feld label="Manuell erfasst"><span className="tabular-nums">{eur(man)}</span></Feld>
              <Feld label="Eingezahlt gesamt"><span className="tabular-nums font-medium">{eur(auto + man)}</span></Feld>
            </div>
          );
        })()}

        {(e?.aelteste_ueberfaellig || !!e?.rechnungen_offen) && (
          <div className="flex flex-wrap gap-2">
            {!!e?.rechnungen_offen && <Badge variant="outline" className="tabular-nums">{e.rechnungen_offen} Rechnungen offen · {eur(Number(e.offen_netto || 0))}</Badge>}
            {e?.aelteste_ueberfaellig && <Badge variant="destructive" className="tabular-nums">überfällig seit {datum(e.aelteste_ueberfaellig)}</Badge>}
          </div>
        )}

        {vs.length > 0 && <>
          <Separator />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Feld label="Belege"><span className="tabular-nums">{vs.reduce((s, v) => s + Number(v.belege || 0), 0)}</span></Feld>
            <Feld label="Aktive Kampagnen"><span className="tabular-nums">{vs.reduce((s, v) => s + Number(v.kampagnen_aktiv || 0), 0)}</span></Feld>
            <Feld label="Zuletzt aufgeladen"><span className="tabular-nums">{maxDatum(vs.map(v => v.letzte_aufladung))}</span></Feld>
            <Feld label="Zuletzt an Meta gezahlt"><span className="tabular-nums">{maxDatum(vs.map(v => v.letzte_meta_zahlung))}</span></Feld>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}

const maxDatum = (xs: (string | null)[]) => { const m = xs.filter(Boolean).sort().pop(); return m ? datum(m) : '—'; };

/** Begründung, warum kein eingezahlter Betrag vorliegt — nie geschätzt. */
function OhneBetrag({ zst, quelle }: { zst?: WerbebudgetZahlungsstatus; quelle?: string | null }) {
  if (quelle === 'lexoffice') return <span className="text-sm text-muted-foreground">lexoffice liefert keine Rechnungspositionen — Werbebudget hier nicht ermittelbar</span>;
  if (zst === 'keine_zahlungsverknuepfung' || quelle === null) return <Link to="/kunden/verknuepfungen" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">keine Buchhaltungsverknüpfung</Link>;
  if (zst === 'verknuepft_ohne_werbebudgetposten') return <span className="text-sm text-muted-foreground" title={OHNE_POSTEN_TOOLTIP}>kein Werbebudget-Posten auf den Rechnungen</span>;
  return <span className="text-sm text-muted-foreground">Keine bezahlten Werbebudget-Zahlungen gefunden.</span>;
}


function ManuellAbschnitt({ clientId, rows, onAdd, onDelete }: { clientId: string; rows: Manuell[]; onAdd: (r: Omit<Manuell, 'id'>) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [betrag, setBetrag] = useState('');
  const [notiz, setNotiz] = useState('');
  const [sendet, setSendet] = useState(false);
  const absenden = async () => {
    const n = parseBetrag(betrag);
    if (n == null || n <= 0) { toast.error('Bitte einen gültigen Betrag eingeben'); return; }
    setSendet(true);
    const ok = await onAdd({ client_id: clientId, datum: iso(new Date()), betrag_netto: n, quelle: null, beleg: null, notiz: notiz.trim() || null });
    setSendet(false);
    if (ok) { setBetrag(''); setNotiz(''); }
  };
  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Manuell erfasst</p>
        <p className="text-xs text-muted-foreground mt-1">Für Zahlungen, die nicht über Qonto-Rechnungspositionen erkannt werden — etwa lexoffice oder Zahlungen an Viral Connect.</p>
      </div>
      {rows.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Notiz</TableHead><TableHead className="text-right">Betrag (netto)</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>
            {rows.map(m => (
              <TableRow key={m.id}>
                <TableCell className="tabular-nums">{datum(m.datum)}</TableCell>
                <TableCell className="text-muted-foreground break-words">{m.notiz || m.quelle || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{eur(Number(m.betrag_netto))}</TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Zahlung löschen" onClick={() => { if (confirm('Diese Zahlung löschen?')) onDelete(m.id); }}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-2 items-end">
        <Input aria-label="Betrag netto" inputMode="decimal" placeholder="Betrag netto" value={betrag} onChange={e => setBetrag(e.target.value)} className="h-8 text-sm text-right tabular-nums" />
        <Input aria-label="Notiz" placeholder="Notiz (optional)" maxLength={200} value={notiz} onChange={e => setNotiz(e.target.value)} className="h-8 text-sm" />
        <Button size="sm" className="h-8" disabled={sendet} onClick={absenden}>Erfassen</Button>
      </div>
    </div>
  );
}

const AUSNAHME_QUELLE = 'Konto-Ausnahme';
const parseBetrag = (t: string): number | null => {
  const x = t.trim(); if (!x) return null;
  const n = Number(x.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

type LeadR = { erloes: number; kosten: number; marge: number };
type Periode = { l: LeadLief; kosten: number; erloes: number; marge: number; istJeLead: number | null; preis: number };
/** Leadkauf-Rechnung je Zuordnung als Summe ihrer Lieferperioden. Fließt nicht in Saldo/Ampel. */
function leadRechnung(perioden: Periode[]): LeadR | null {
  if (!perioden.length) return null;
  const erloes = perioden.reduce((s, p) => s + p.erloes, 0), kosten = perioden.reduce((s, p) => s + p.kosten, 0);
  return { erloes, kosten, marge: erloes - kosten };
}

function LeadLieferungen({ zuordnungId, perioden, darf, onAdd, onDelete }: { zuordnungId: string; perioden: Periode[]; darf: boolean; onAdd: (r: Omit<LeadLief, 'id'>) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [monat, setMonat] = useState('');
  const [von, setVon] = useState(''); const [bis, setBis] = useState('');
  const [anzahl, setAnzahl] = useState(''); const [preis, setPreis] = useState('');
  const [busy, setBusy] = useState(false);
  const monatWaehlen = (m: string) => {
    setMonat(m); if (!m) return;
    const [y, mo] = m.split('-').map(Number);
    const letzter = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    setVon(`${m}-01`); setBis(`${m}-${String(letzter).padStart(2, '0')}`);
  };
  const erfassen = async () => {
    const n = Number(anzahl), p = parseBetrag(preis);
    if (!von || !bis || von > bis) { toast.error('Bitte einen gültigen Zeitraum wählen'); return; }
    if (!Number.isInteger(n) || n <= 0) { toast.error('Bitte eine ganze Anzahl eingeben'); return; }
    if (p == null || p < 0) { toast.error('Bitte einen gültigen Preis je Lead eingeben'); return; }
    setBusy(true);
    const ok = await onAdd({ zuordnung_id: zuordnungId, von, bis, anzahl: n, preis: p, notiz: null });
    setBusy(false);
    if (ok) { setMonat(''); setVon(''); setBis(''); setAnzahl(''); setPreis(''); }
  };
  return (
    <div className="mt-2 space-y-2">
      {perioden.length === 0 ? <p className="text-xs text-muted-foreground">Noch keine Leadlieferungen erfasst.</p> : (
        <div className="space-y-1">
          {perioden.map(p => (
            <div key={p.l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
              <span className="font-medium">{datum(p.l.von)}–{datum(p.l.bis)}</span>
              <span>{Number(p.l.anzahl).toLocaleString('de-DE')} Leads</span>
              <span>{eur2(p.preis)} je Lead</span>
              <span>Erlös {eur(p.erloes)}</span>
              <span>Kosten {eur(p.kosten)}</span>
              <span className={p.marge < 0 ? 'text-destructive' : 'text-success'}>Marge {eur(p.marge)}</span>
              <span className={p.istJeLead != null && p.istJeLead <= p.preis ? 'text-success' : 'text-destructive'}>Ist {p.istJeLead != null ? eur2(p.istJeLead) : '—'} je Lead</span>
              {darf && <button type="button" aria-label="Leadlieferung löschen" onClick={() => onDelete(p.l.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
      {darf && (
        <div className="flex flex-wrap items-end gap-2">
          <Input type="month" aria-label="Monat" value={monat} onChange={e => monatWaehlen(e.target.value)} className="h-8 w-36 text-sm" />
          <Input type="date" aria-label="Von" value={von} onChange={e => { setVon(e.target.value); setMonat(''); }} className="h-8 w-36 text-sm" />
          <Input type="date" aria-label="Bis" value={bis} onChange={e => { setBis(e.target.value); setMonat(''); }} className="h-8 w-36 text-sm" />
          <Input aria-label="Anzahl" placeholder="Anzahl" inputMode="numeric" value={anzahl} onChange={e => setAnzahl(e.target.value)} className="h-8 w-24 text-sm text-right tabular-nums" />
          <Input aria-label="€ je Lead" placeholder="€ je Lead" inputMode="decimal" value={preis} onChange={e => setPreis(e.target.value)} className="h-8 w-24 text-sm text-right tabular-nums" />
          <Button size="sm" className="h-8" disabled={busy} onClick={erfassen}>Erfassen</Button>
        </div>
      )}
    </div>
  );
}
