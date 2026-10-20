// Arbeitsliste offener Verknüpfungen: Zahler, Qonto-Dubletten, Kampagnen ohne Kunde, Kunden ohne Zahler, Kunden ohne Kampagne.
// Vorschläge kommen aus namensTreffer; nie automatisch zuordnen – jede Zeile wird einzeln bestätigt.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Check, ChevronRight, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { alle, namensTreffer, qontoVerknuepfen } from '@/lib/kundenVerknuepfungen';
import { STATUS_LABEL, ladeUntermarken, type Untermarke } from '@/lib/werbebudgetKonten';
import { zuordnungAnlegen, useWerbebudgetZuordnung, KampagneZeile, type ZuoKampagne } from './werbebudgetZuordnung';

const key = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');
const AKTIV = ['In Betreuung', 'Pausiert'];
const SYS_KAMPAGNE = 'meta_kampagne';
const SYS_OHNE_KAMPAGNE = 'ohne_kampagne';

type Kunde = { id: string; name: string | null; vor_nachname: string | null; kundenstatus: string | null };
type Wahl = { id: string; name: string | null };
type Vorschlag = Wahl & { grund: string };
type QEintrag = { qid: string; name: string; anzahl: number; bezahlt: number; netto: number; letzte: string | null; client_id: string | null };
type Zahler = { key: string; name: string; eintraege: QEintrag[]; bezahlt: number; netto: number; letzte: string | null };
type Kampagne = { id: string; name: string; status: string; spend: number; konto: string; untermarke: string | null };

/** Bester Namenstreffer mit Begründung; verworfene Paare werden übersprungen. */
function besterTreffer<T>(name: string | null, kandidaten: T[], n: (t: T) => (string | null)[], id: (t: T) => string, verworfen: (id: string) => boolean, schwelle = 0.5): (T & { _score: number; _grund: string }) | null {
  let best: any = null;
  for (const c of kandidaten) {
    if (verworfen(id(c))) continue;
    const [a, b] = n(c);
    const s1 = namensTreffer(name, a), s2 = b ? namensTreffer(name, b) : 0;
    const s = Math.max(s1, s2);
    if (s >= schwelle && (!best || s > best._score)) best = { ...c, _score: s, _grund: `Namenstreffer ${Math.round(s * 100)} % (${s1 >= s2 ? 'Firmenname' : 'Personenname'})` };
  }
  return best;
}

function Abschnitt({ nr, titel, anzahl, hinweis, children, laedt }: { nr: number; titel: string; anzahl: number | null; hinweis?: string; children: React.ReactNode; laedt?: boolean }) {
  const [auf, setAuf] = useState(true);
  return (
    <section className="rounded-2xl bg-card shadow-sm">
      <button onClick={() => setAuf(v => !v)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left" aria-expanded={auf}>
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', auf && 'rotate-90')} />
        <span className="text-xs text-muted-foreground tabular-nums">{nr}</span>
        <span className="font-medium">{titel}</span>
        <span className={cn('ml-auto text-sm tabular-nums', anzahl ? 'text-foreground' : 'text-muted-foreground')}>{anzahl ?? '…'}</span>
      </button>
      {auf && (
        <div className="px-5 pb-4 space-y-2">
          {hinweis && <p className="text-xs text-muted-foreground">{hinweis}</p>}
          {laedt ? <Skeleton className="h-16 rounded-xl" /> : anzahl === 0 ? <p className="text-sm text-muted-foreground">nichts offen</p> : <div className="divide-y divide-border/50">{children}</div>}
        </div>
      )}
    </section>
  );
}

/** Auswahl mit Suchfeld über eine feste Kandidatenliste. */
function Wahlfeld({ kandidaten, onPick, platzhalter }: { kandidaten: Wahl[]; onPick: (w: Wahl) => void; platzhalter: string }) {
  const [q, setQ] = useState('');
  const treffer = useMemo(() => {
    const s = key(q);
    return s.length < 2 ? [] : kandidaten.filter(k => key(k.name).includes(s)).slice(0, 8);
  }, [q, kandidaten]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder={platzhalter} className="h-8 pl-7 text-xs bg-muted/50 border-0" />
      {treffer.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-popover shadow-md max-h-60 overflow-y-auto">
          {treffer.map(t => <button key={t.id} onClick={() => { onPick(t); setQ(''); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted">{t.name || t.id}</button>)}
        </div>
      )}
    </div>
  );
}

/** Eine erledigbare Zeile: Vorschlag + Übernehmen/Verwerfen, alternativ manuelle Wahl. */
function Zeile({ titel, info, vorschlag, kandidaten, platzhalter, onUebernehmen, onVerwerfen }: {
  titel: React.ReactNode; info: React.ReactNode; vorschlag: Vorschlag | null; kandidaten: Wahl[]; platzhalter: string;
  onUebernehmen: (w: Wahl) => Promise<void>; onVerwerfen?: (w: Wahl) => Promise<void>;
}) {
  const [manuell, setManuell] = useState<Wahl | null>(null);
  const [busy, setBusy] = useState(false);
  const ziel = manuell || vorschlag;
  const tu = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { toast.error(e?.message || 'Fehlgeschlagen'); } finally { setBusy(false); } };
  return (
    <div className="py-2.5 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center text-sm">
      <div className="min-w-0"><div className="font-medium break-words">{titel}</div><div className="text-xs text-muted-foreground tabular-nums">{info}</div></div>
      <div className="min-w-0 text-xs">
        {ziel ? <><span className="text-muted-foreground">→ </span><span className="font-medium">{ziel.name || ziel.id}</span>
          <div className="text-muted-foreground">{manuell ? 'manuell gewählt' : vorschlag?.grund}</div></>
          : <span className="text-muted-foreground">Kein Vorschlag</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Wahlfeld kandidaten={kandidaten} onPick={setManuell} platzhalter={platzhalter} />
        {ziel && <Button size="sm" className="h-8" disabled={busy} onClick={() => tu(() => onUebernehmen(ziel))}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Übernehmen'}</Button>}
        {manuell ? <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setManuell(null)}>Zurück</Button>
          : vorschlag && onVerwerfen && <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => tu(() => onVerwerfen(vorschlag))}>Verwerfen</Button>}
      </div>
    </div>
  );
}

export type ArbeitslisteZahlen = { zahler: number; kampagnen: number; ohneZahler: number; dubletten: number };

export function VerknuepfungsArbeitsliste({ onZahlen }: { onZahlen?: (z: ArbeitslisteZahlen | null) => void }) {
  const { callMeta } = useMetaAds();
  const [kunden, setKunden] = useState<Kunde[] | null>(null);
  const [inv, setInv] = useState<any[] | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [zuo, setZuo] = useState<any[]>([]);
  const [verworfen, setVerworfen] = useState<Set<string>>(new Set());
  const [kampagnen, setKampagnen] = useState<Kampagne[] | null>(null);
  const [metaFehler, setMetaFehler] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeDaten = useCallback(async () => {
    const [c, i, l, z, v] = await Promise.all([
      alle('clients', 'id, name, vor_nachname, kundenstatus', q => q.is('deleted_at', null)),
      alle('qonto_client_invoices', 'client_id, client_name, status, subtotal_amount, total_amount, vat_amount, paid_at'),
      alle('qonto_client_links', 'id, qonto_client_id, qonto_client_name, client_id, is_confirmed'),
      alle('werbebudget_zuordnung', 'client_id, meta_account_id, typ, objekt_id, kampagne_id'),
      alle('kunde_link_vorschlag_verworfen', 'client_id, system, externe_id'),
    ]);
    if (c.error || i.error || l.error || z.error || v.error) setFehler('Einige Daten konnten nicht geladen werden – Anzahlen können unvollständig sein.');
    setKunden(c.rows); setInv(i.rows); setLinks(l.rows); setZuo(z.rows);
    setVerworfen(new Set(v.rows.map((r: any) => `${r.system}|${r.externe_id}|${r.client_id}`)));
  }, []);
  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  // Aktive Kampagnen auf unseren Untermarken-Konten (Haush Haush / Viral Connect), live aus Meta.
  const ladeKampagnen = useCallback(async () => {
    setKampagnen(null); setMetaFehler([]);
    const { data: konten, error } = await (supabase.from as any)('meta_accounts_cache').select('meta_account_id, name, business_name').eq('status', 'active');
    if (error) { setMetaFehler([error.message]); setKampagnen([]); return; }
    const unsere = (konten || []).filter((k: any) => /haush\s*haush|viral\s*connect/.test(key(k.business_name)));
    const err: string[] = [];
    const res = await Promise.all(unsere.map((k: any) => callMeta<any>(`/${k.meta_account_id}/campaigns`, {
      fields: 'id,name,effective_status,insights.date_preset(last_7d){spend}', effective_status: '["ACTIVE"]', limit: 500,
    }).then(r => (r?.data || []).map((c: any) => ({ id: c.id, name: c.name, status: c.effective_status, spend: Number(c.insights?.data?.[0]?.spend || 0), konto: k.meta_account_id, untermarke: k.name })),
      (e: Error) => { err.push(`${k.name || k.meta_account_id}: ${e?.message || 'Fehler'}`); return []; })));
    setMetaFehler(err); setKampagnen(res.flat());
  }, [callMeta]);
  useEffect(() => { ladeKampagnen(); }, [ladeKampagnen]);

  const istVerworfen = (system: string, ext: string) => (cid: string) => verworfen.has(`${system}|${ext}|${cid}`);
  const verwerfen = async (system: string, ext: string, clientId: string) => {
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await (supabase.from as any)('kunde_link_vorschlag_verworfen').upsert({ client_id: clientId, system, externe_id: ext, verworfen_von: uid }, { onConflict: 'client_id,system,externe_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    setVerworfen(s => new Set(s).add(`${system}|${ext}|${clientId}`));
  };

  const kundenName = useMemo(() => new Map((kunden || []).map(k => [k.id, k.name])), [kunden]);
  const kundenWahl = useMemo(() => (kunden || []).map(k => ({ id: k.id, name: k.name })).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [kunden]);
  const aktive = useMemo(() => (kunden || []).filter(k => AKTIV.includes(k.kundenstatus || '')), [kunden]);

  // Qonto-Zahler je normalisiertem Namen, darunter die einzelnen Qonto-Datensätze.
  const { offeneZahler, dubletten } = useMemo(() => {
    const bestaetigt = links.filter(l => l.is_confirmed && l.client_id);
    const linkQid = new Map(bestaetigt.filter(l => l.qonto_client_id).map(l => [l.qonto_client_id, l.client_id]));
    const linkName = new Set(bestaetigt.map(l => key(l.qonto_client_name)));
    // Namensverknüpfungen (ohne Qonto-ID) gelten für Rechnungen ohne Qonto-ID desselben Namens.
    const linkNurName = new Map(bestaetigt.filter(l => !l.qonto_client_id).map(l => [key(l.qonto_client_name), l.client_id]));
    const m = new Map<string, Zahler>();
    for (const r of inv || []) {
      if (!r.client_name) continue;
      const k = key(r.client_name);
      const z = m.get(k) || { key: k, name: r.client_name.trim(), eintraege: [], bezahlt: 0, netto: 0, letzte: null };
      const qid = r.client_id || `name:${k}`;
      let e = z.eintraege.find(x => x.qid === qid);
      if (!e) { e = { qid, name: r.client_name.trim(), anzahl: 0, bezahlt: 0, netto: 0, letzte: null, client_id: r.client_id ? linkQid.get(r.client_id) ?? null : linkNurName.get(k) ?? null }; z.eintraege.push(e); }
      e.anzahl++;
      if (r.status === 'paid') {
        const n = Number(r.subtotal_amount ?? (Number(r.total_amount || 0) - Number(r.vat_amount || 0))) || 0;
        e.bezahlt++; e.netto += n; z.bezahlt++; z.netto += n;
        if (r.paid_at && (!e.letzte || r.paid_at > e.letzte)) e.letzte = r.paid_at;
        if (r.paid_at && (!z.letzte || r.paid_at > z.letzte)) z.letzte = r.paid_at;
      }
      m.set(k, z);
    }
    const alleZ = [...m.values()];
    for (const z of alleZ) z.eintraege.sort((a, b) => b.anzahl - a.anzahl);
    return {
      offeneZahler: alleZ.filter(z => !linkName.has(z.key) && z.eintraege.every(e => !e.client_id)).sort((a, b) => b.netto - a.netto),
      dubletten: alleZ.filter(z => z.eintraege.filter(e => !e.qid.startsWith('name:')).length > 1 && z.eintraege.some(e => !e.client_id)),
    };
  }, [inv, links]);

  const offeneKampagnen = useMemo(() => {
    if (!kampagnen) return null;
    const belegt = new Set(zuo.flatMap((z: any) => [z.objekt_id, z.kampagne_id]));
    const kontoGanz = new Set(zuo.filter((z: any) => z.typ === 'konto').map((z: any) => z.meta_account_id));
    return kampagnen.filter(c => !belegt.has(c.id) && !kontoGanz.has(c.konto)).sort((a, b) => b.spend - a.spend);
  }, [kampagnen, zuo]);

  const kundenMitQonto = useMemo(() => new Set(links.filter(l => l.is_confirmed && l.client_id).map(l => l.client_id)), [links]);
  const ohneZahler = useMemo(() => aktive.filter(k => !kundenMitQonto.has(k.id)), [aktive, kundenMitQonto]);
  const mitZuo = useMemo(() => new Set(zuo.map((z: any) => z.client_id)), [zuo]);
  // Zeilen in Abschnitt 5 bleiben bis zum nächsten Seitenaufruf stehen; die Anzahl sinkt sofort.
  const [ohneKampagneStart, setOhneKampagneStart] = useState<Kunde[] | null>(null);
  const [neuZugeordnet, setNeuZugeordnet] = useState<Map<string, number>>(new Map());
  const ohneKampagneJetzt = useMemo(() => aktive.filter(k => !mitZuo.has(k.id) && !verworfen.has(`${SYS_OHNE_KAMPAGNE}|eigenes_konto|${k.id}`)), [aktive, mitZuo, verworfen]);
  useEffect(() => { if (!ohneKampagneStart && kunden) setOhneKampagneStart(ohneKampagneJetzt); }, [ohneKampagneStart, kunden, ohneKampagneJetzt]);
  const ohneKampagne = useMemo(() => (ohneKampagneStart || []).filter(k => !verworfen.has(`${SYS_OHNE_KAMPAGNE}|eigenes_konto|${k.id}`)), [ohneKampagneStart, verworfen]);

  const geladen = !!kunden && !!inv;
  useEffect(() => {
    onZahlen?.(geladen && offeneKampagnen ? { zahler: offeneZahler.length, kampagnen: offeneKampagnen.length, ohneZahler: ohneZahler.length, dubletten: dubletten.length } : null);
  }, [geladen, offeneZahler.length, offeneKampagnen, ohneZahler.length, dubletten.length, onZahlen]);

  /** Verknüpft alle noch freien Qonto-Datensätze eines Zahlers (oder einen einzelnen) mit dem Kunden. */
  const zahlerVerknuepfen = async (eintraege: QEintrag[], kunde: Wahl) => {
    for (const e of eintraege) {
      if (e.client_id) continue;
      if (e.qid.startsWith('name:')) {
        // Rechnungen ohne Qonto-ID: Verknüpfung nur über den Namen.
        // Eindeutig je Name (ohne Groß/Klein): vorhandene Zeile aktualisieren statt doppelt anlegen.
        const patch = { client_id: kunde.id, is_confirmed: true, match_type: 'manual', confidence: 1 };
        const vorhanden = links.find(l => !l.qonto_client_id && key(l.qonto_client_name) === key(e.name));
        const { error } = vorhanden
          ? await supabase.from('qonto_client_links').update(patch as any).eq('id', vorhanden.id)
          : await supabase.from('qonto_client_links').insert({ ...patch, qonto_client_name: e.name, qonto_client_id: null } as any);
        if (error) throw new Error(error.message);
      } else await qontoVerknuepfen(e.qid, e.name, kunde.id, 1);
    }
    toast.success(`${eintraege[0]?.name} → ${kunde.name}`);
    const l = await alle('qonto_client_links', 'id, qonto_client_id, qonto_client_name, client_id, is_confirmed');
    setLinks(l.rows);
  };

  const kundeVorschlag = (name: string, sys: string, ext: string): Vorschlag | null => {
    const t = besterTreffer(name, kunden || [], k => [k.name, k.vor_nachname], k => k.id, istVerworfen(sys, ext));
    return t ? { id: t.id, name: t.name, grund: t._grund } : null;
  };

  const freieZahler = useMemo(() => offeneZahler.map(z => ({ id: z.key, name: z.name })), [offeneZahler]);

  if (fehler && !kunden) return <p className="text-sm text-destructive">{fehler}</p>;
  const laedt = !geladen;

  return (
    <div className="space-y-4">
      {fehler && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{fehler}</p>}

      <Abschnitt nr={1} titel="Zahler ohne Kundenzuordnung" anzahl={laedt ? null : offeneZahler.length} laedt={laedt}
        hinweis="Rechnungsempfänger aus Qonto ohne bestätigten Kunden. Sortiert nach Nettosumme – das teuerste Versäumnis oben.">
        {offeneZahler.map(z => {
          const ext = z.eintraege[0]?.qid || z.key;
          const echte = z.eintraege.filter(e => !e.qid.startsWith('name:')).length;
          return <Zeile key={z.key} titel={z.name}
            info={<>{z.bezahlt} bezahlt · {eur(z.netto)} netto · letzte {dt(z.letzte)}{echte > 1 ? ` · ${echte} Einträge in Qonto (werden alle zugeordnet)` : ''}</>}
            vorschlag={kundeVorschlag(z.name, 'qonto', ext)} kandidaten={kundenWahl} platzhalter="Kunde suchen…"
            onUebernehmen={w => zahlerVerknuepfen(z.eintraege, w)} onVerwerfen={w => verwerfen('qonto', ext, w.id)} />;
        })}
      </Abschnitt>

      <Abschnitt nr={2} titel="Qonto-Dubletten" anzahl={laedt ? null : dubletten.length} laedt={laedt}
        hinweis="Namen mit mehreren Qonto-Datensätzen. Jeder Datensatz einzeln; ist für den Namen schon ein Kunde gesetzt, ist er vorbelegt.">
        {dubletten.map(z => {
          const gesetzt = [...new Set(z.eintraege.map(e => e.client_id).filter(Boolean) as string[])];
          return (
            <div key={z.key} className="py-2.5">
              <div className="flex items-baseline gap-3 text-sm"><span className="font-medium">{z.name}</span><span className="ml-auto text-xs text-muted-foreground">{z.eintraege.length} Einträge in Qonto</span></div>
              {gesetzt.length > 1 && <p className="mt-1 text-xs flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-warning shrink-0" />Gleicher Name, verschiedene Kunden: {gesetzt.map(id => kundenName.get(id)).join(', ')}. Bitte prüfen, ob das gewollt ist.</p>}
              <div className="pl-3 divide-y divide-border/40">
                {z.eintraege.map(e => e.client_id
                  ? <div key={e.qid} className="py-2 text-xs flex flex-wrap gap-2 tabular-nums"><span className="text-muted-foreground">{e.anzahl} {e.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} · letzte {dt(e.letzte)} · ID {e.qid.slice(0, 8)}…</span><span className="ml-auto flex items-center gap-1">→ {kundenName.get(e.client_id)} <Check className="h-3.5 w-3.5 text-success" /></span></div>
                  : <Zeile key={e.qid} titel={<span className="text-xs font-normal">ID {e.qid.startsWith('name:') ? 'ohne Qonto-ID' : `${e.qid.slice(0, 8)}…`}</span>}
                    info={<>{e.anzahl} {e.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} · letzte {dt(e.letzte)} · {eur(e.netto)} netto</>}
                    vorschlag={gesetzt.length === 1 ? { id: gesetzt[0], name: kundenName.get(gesetzt[0]) ?? null, grund: 'Für diesen Namen bereits gesetzt' } : kundeVorschlag(z.name, 'qonto', e.qid)}
                    kandidaten={kundenWahl} platzhalter="Kunde suchen…"
                    onUebernehmen={w => zahlerVerknuepfen([e], w)} onVerwerfen={w => verwerfen('qonto', e.qid, w.id)} />)}
              </div>
            </div>
          );
        })}
      </Abschnitt>

      <Abschnitt nr={3} titel="Kampagnen ohne Kunde" anzahl={offeneKampagnen ? offeneKampagnen.length : null} laedt={!offeneKampagnen || laedt}
        hinweis="Aktive Kampagnen auf unseren Untermarken-Konten, die weder als Kampagne noch über Anzeigengruppen zugeordnet sind. Sortiert nach Ausgaben der letzten 7 Tage.">
        {metaFehler.length > 0 && <p className="text-xs text-destructive py-2">Kampagnen einzelner Konten konnten nicht geladen werden – {metaFehler.join(' · ')}</p>}
        {(offeneKampagnen || []).map(c => (
          <Zeile key={c.id} titel={c.name}
            info={<>{c.untermarke || c.konto} · {STATUS_LABEL[c.status] || c.status} · {eur(c.spend)} in 7 Tagen</>}
            vorschlag={kundeVorschlag(c.name, SYS_KAMPAGNE, c.id)} kandidaten={kundenWahl} platzhalter="Kunde suchen…"
            onUebernehmen={async w => {
              await zuordnungAnlegen(w.id, c.konto, c.untermarke, 'kampagne', c.id, c.id, c.name);
              toast.success(`${c.name} → ${w.name}`);
              setZuo(z => [...z, { client_id: w.id, meta_account_id: c.konto, typ: 'kampagne', objekt_id: c.id, kampagne_id: c.id }]);
            }}
            onVerwerfen={w => verwerfen(SYS_KAMPAGNE, c.id, w.id)} />
        ))}
      </Abschnitt>

      <Abschnitt nr={4} titel="Kunden ohne Qonto-Verknüpfung" anzahl={laedt ? null : ohneZahler.length} laedt={laedt}
        hinweis="Aktive Kunden ohne bestätigten Zahler. Vorschläge aus den noch freien Qonto-Zahlern.">
        {ohneZahler.map(k => {
          const t = besterTreffer(k.name, offeneZahler, z => [z.name], z => z.eintraege[0]?.qid || z.key, qid => verworfen.has(`qonto|${qid}|${k.id}`))
            || (k.vor_nachname ? besterTreffer(k.vor_nachname, offeneZahler, z => [z.name], z => z.eintraege[0]?.qid || z.key, qid => verworfen.has(`qonto|${qid}|${k.id}`)) : null);
          const v: Vorschlag | null = t ? { id: t.key, name: t.name, grund: `${t._grund} · ${t.bezahlt} bezahlt, ${eur(t.netto)}` } : null;
          return <Zeile key={k.id} titel={<Link to={`/kunden/${k.id}?tab=verknuepfungen`} className="hover:text-primary">{k.name}</Link>}
            info={k.kundenstatus} vorschlag={v} kandidaten={freieZahler} platzhalter="Zahler suchen…"
            onUebernehmen={async w => { const z = offeneZahler.find(x => x.key === w.id); if (!z) throw new Error('Zahler nicht mehr offen'); await zahlerVerknuepfen(z.eintraege, { id: k.id, name: k.name }); }}
            onVerwerfen={async w => { const z = offeneZahler.find(x => x.key === w.id); await verwerfen('qonto', z?.eintraege[0]?.qid || w.id, k.id); }} />;
        })}
      </Abschnitt>

      <Abschnitt nr={5} titel="Kunden ohne Kampagnenzuordnung" anzahl={laedt ? null : ohneKampagneJetzt.length} laedt={laedt}
        hinweis="Direkt hier über „Zuordnen“ oder im Verknüpfungen-Tab des Kunden. Nicht jeder Kunde braucht eine Kampagne: wer sein eigenes Werbekonto bezahlt, steht hier zu Recht und kann abgehakt werden.">
        {ohneKampagne.map(k => <KundeOhneKampagneZeile key={k.id} k={k} callMeta={callMeta} onZugeordnet={() => { setNeuZugeordnet(m => new Map(m).set(k.id, (m.get(k.id) || 0) + 1)); ladeDaten(); }}>
          <div className="py-2 flex items-center gap-3 text-sm">
            <Link to={`/kunden/${k.id}?tab=verknuepfungen`} className="font-medium hover:text-primary truncate">{k.name}</Link>
            <span className="text-xs text-muted-foreground">{k.kundenstatus}</span>
            {!!neuZugeordnet.get(k.id) && <span className="text-[11px] rounded-full bg-success/10 text-success px-2 py-0.5 tabular-nums">{neuZugeordnet.get(k.id)} zugeordnet</span>}
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => verwerfen(SYS_OHNE_KAMPAGNE, 'eigenes_konto', k.id).catch(e => toast.error(e.message))}>Abhaken – zahlt selbst</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" asChild><Link to={`/kunden/${k.id}?tab=verknuepfungen`}>Zum Kunden</Link></Button>
          </div>
        </KundeOhneKampagneZeile>)}
      </Abschnitt>
    </div>
  );
}

/** Zeile mit aufklappbarer Schnellzuordnung; lädt Konten/Kampagnen erst beim Aufklappen. */
function KundeOhneKampagneZeile({ k, callMeta, onZugeordnet, children }: { k: { id: string }; callMeta: any; onZugeordnet: () => void; children: React.ReactElement }) {
  const [offen, setOffen] = useState(false);
  return <div>
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">{children}</div>
      <Button size="sm" variant={offen ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setOffen(v => !v)}>
        <ChevronRight className={cn('h-3.5 w-3.5 mr-1 transition-transform', offen && 'rotate-90')} />Zuordnen
      </Button>
    </div>
    {offen && <Schnellzuordnung clientId={k.id} callMeta={callMeta} onZugeordnet={onZugeordnet} />}
  </div>;
}

function Schnellzuordnung({ clientId, callMeta, onZugeordnet }: { clientId: string; callMeta: any; onZugeordnet: () => void }) {
  const { alle: zuoAlle, busy, fehler: zuoFehler, zuordnen, loesen } = useWerbebudgetZuordnung(clientId);
  const [konten, setKonten] = useState<Untermarke[] | null>(null);
  const [konto, setKonto] = useState<string>('');
  const [kamp, setKamp] = useState<ZuoKampagne[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { ladeUntermarken().then(setKonten).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!konto) return;
    setKamp(null); setErr(null);
    callMeta(`/${konto}/campaigns`, { fields: 'id,name,effective_status,daily_budget,insights.date_preset(last_7d){spend}', limit: 200 })
      .then((r: any) => setKamp(r?.data || [])).catch((e: Error) => setErr(e.message));
  }, [konto, callMeta]);
  const untermarke = konten?.find(x => x.meta_account_id === konto)?.name ?? null;
  return <div className="ml-2 mb-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
    {zuoFehler && <p className="text-xs text-destructive">{zuoFehler}</p>}
    {err && <p className="text-xs text-destructive">{err}</p>}
    {!konten && !err ? <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Werbekonten werden geladen …</p> :
      <select value={konto} onChange={e => setKonto(e.target.value)} className="h-8 w-full max-w-sm rounded-md border border-input bg-background px-2 text-xs">
        <option value="">Werbekonto wählen …</option>
        {konten?.map(x => <option key={x.meta_account_id} value={x.meta_account_id}>{x.name || x.meta_account_id}</option>)}
      </select>}
    {konto && (() => {
      const kz = kontoZuo(zuoAlle, konto);
      const einzeln = zuoAlle.filter(z => z.typ !== 'konto' && z.meta_account_id === konto);
      return <div className="rounded-lg bg-card px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="flex-1 min-w-0"><span className="font-medium">Ganzes Konto zuordnen</span> – neue Kampagnen auf diesem Konto gehören dann automatisch dazu.</span>
        {kz ? kz.client_id === clientId
            ? <span className="text-success flex items-center gap-1.5">Zugeordnet<button onClick={() => loesen(kz)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>
            : <span className="text-muted-foreground">gehört zu {zuoKundenName(kz)}</span>
          : einzeln.length
            ? <span className="text-muted-foreground">nicht möglich – einzelne Kampagnen sind schon vergeben ({[...new Set(einzeln.map(zuoKundenName))].join(', ')})</span>
            : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === konto} onClick={async () => { const ok = await zuordnen(konto, untermarke, 'konto', konto, null, untermarke || konto); if (ok) onZugeordnet(); }}>Ganzes Konto zuordnen</Button>}
      </div>;
    })()}
    {konto && !kamp && !err && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Kampagnen werden geladen …</p>}
    {kamp?.length === 0 && <p className="text-xs text-muted-foreground">Keine Kampagnen auf diesem Konto.</p>}
    {kamp && kamp.length > 0 && <div className="divide-y divide-border/40 rounded-lg bg-card">
      {kamp.map(c => <KampagneZeile key={c.id} k={c} kontoId={konto} alle={zuoAlle} clientId={clientId} busy={busy} callMeta={callMeta} loesen={loesen}
        zuordnen={async (t, o, kid, n) => { const ok = await zuordnen(konto, untermarke, t, o, kid, n); if (ok) onZugeordnet(); return ok; }} />)}
    </div>}
    <p className="text-[11px] text-muted-foreground">Ohne Auswahl einer Anzeigengruppe wird die ganze Kampagne zugeordnet. Anzeigengruppen nur nötig, wenn sich zwei Kunden eine Kampagne teilen.</p>
  </div>;
}
