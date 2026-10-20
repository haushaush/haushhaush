// Inline-Schnellzuordnung für „Verknüpfungen": Zeile mit „Zum Kunden" + Chevron „Zuordnen", aufklappendes Panel (kein Modal).
// Vorschläge sind nur vorbelegt – gespeichert wird ausschließlich nach Klick.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronRight, ExternalLink, Loader2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { alle, closeLeadVerknuepfen, keinBedarf, namensTreffer, suche, verknuepfen, SYSTEME, type Objekt, type SystemKey, type SystemStand } from '@/lib/kundenVerknuepfungen';
import { Schnellzuordnung } from './VerknuepfungsArbeitsliste';

export type Erledigt = { text: string };

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

const fehlerText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'Fehlgeschlagen';

/** Zeile mit Aktionen rechts; nach Erfolg grüner Haken + Ergebnis, bleibt bis zum nächsten Laden stehen. */
export function QuickZeile({ clientId, titel, info, panel }: {
  clientId: string; titel: React.ReactNode; info?: React.ReactNode;
  panel: (fertig: (e: Erledigt) => void) => React.ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [erledigt, setErledigt] = useState<Erledigt | null>(null);
  return <div className="py-2">
    <div className="flex items-center gap-2 text-sm">
      <div className="min-w-0 flex-1"><div className="font-medium truncate">{titel}</div>{info && <div className="text-xs text-muted-foreground">{info}</div>}</div>
      {erledigt && <span className="text-xs text-success flex items-center gap-1 shrink-0"><Check className="h-3.5 w-3.5" />{erledigt.text}</span>}
      <Button size="sm" variant="outline" className="h-7 text-xs" asChild><Link to={`/kunden/${clientId}?tab=verknuepfungen`}>Zum Kunden</Link></Button>
      {!erledigt && <Button size="sm" variant={offen ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setOffen(v => !v)} aria-expanded={offen}>
        <ChevronRight className={cn('h-3.5 w-3.5 mr-1 transition-transform', offen && 'rotate-90')} />Zuordnen
      </Button>}
    </div>
    {offen && !erledigt && <div className="mt-2 ml-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">{panel(e => { setErledigt(e); setOffen(false); })}</div>}
  </div>;
}

/** „Nicht zuordnen" – gleiches Muster wie bei Qonto, hier ohne Grundliste: der Kunde braucht in diesem System keine Verknüpfung. */
export function KeinBedarfKnopf({ text, onSpeichern }: { text: string; onSpeichern: () => Promise<void> }) {
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!offen) return <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOffen(true)}>Nicht zuordnen</Button>;
  return <span className="flex flex-wrap items-center gap-1.5 text-xs">
    <span className="text-muted-foreground">{text}</span>
    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={async () => { setBusy(true); try { await onSpeichern(); } catch (e) { toast.error(fehlerText(e)); setBusy(false); } }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Speichern'}</Button>
    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => setOffen(false)}>Abbrechen</Button>
  </span>;
}

function Suchfeld({ q, setQ, platzhalter }: { q: string; setQ: (s: string) => void; platzhalter: string }) {
  return <div className="relative max-w-sm">
    <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
    <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={platzhalter} className="h-8 pl-7 text-xs bg-background" />
  </div>;
}

function Treffer({ o, vorschlag, grund, busy, onPick }: { o: Objekt; vorschlag?: boolean; grund?: string; busy: boolean; onPick: () => void }) {
  return <div className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', vorschlag ? 'bg-primary/5 border border-primary/20' : 'bg-card')}>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        {vorschlag && <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">Vorschlag</span>}
        <span className="font-medium truncate">{o.name || o.id}</span>
        {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-3 w-3" /></a>}
      </div>
      {(grund || o.detail) && <div className="text-muted-foreground truncate">{[grund, o.detail].filter(Boolean).join(' · ')}</div>}
    </div>
    {o.belegt ? <span className="text-muted-foreground shrink-0">gehört zu {o.belegt}</span>
      : <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onPick}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Übernehmen'}</Button>}
  </div>;
}

// ---------- Close-Lead ----------
let freieLeadsCache: Promise<{ id: string; name: string | null; status: string | null }[]> | null = null;
async function freieLeads() {
  if (!freieLeadsCache) freieLeadsCache = (async () => {
    const [l, cl] = await Promise.all([
      alle('close_leads', 'id, display_name, status_label', q => q.is('client_id', null)),
      alle('close_link', 'close_lead_id'),
    ]);
    if (l.error) { freieLeadsCache = null; throw new Error('Close-Leads konnten nicht geladen werden.'); }
    const verkn = new Set(cl.rows.map(r => r.close_lead_id));
    return l.rows.filter(r => !verkn.has(r.id)).map(r => ({ id: r.id, name: r.display_name, status: r.status_label }));
  })();
  return freieLeadsCache;
}

export function ClosePanel({ clientId, namen, fertig }: { clientId: string; namen: (string | null | undefined)[]; fertig: (e: Erledigt) => void }) {
  const [leads, setLeads] = useState<{ id: string; name: string | null; status: string | null }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q).trim().toLowerCase();
  const [busy, setBusy] = useState(false);
  useEffect(() => { freieLeads().then(setLeads).catch(e => setErr(fehlerText(e))); }, []);
  const vorschlag = useMemo(() => {
    let best: { l: any; s: number } | null = null;
    for (const l of leads || []) { const s = Math.max(...namen.map(n => namensTreffer(n, l.name))); if (s >= 0.5 && (!best || s > best.s)) best = { l, s }; }
    return best;
  }, [leads, namen]);
  const liste = useMemo(() => !dq ? [] : (leads || []).filter(l => (l.name || '').toLowerCase().includes(dq) && l.id !== vorschlag?.l.id).slice(0, 8), [leads, dq, vorschlag]);
  const nimm = async (l: { id: string; name: string | null }) => {
    setBusy(true);
    try { await closeLeadVerknuepfen(clientId, l.id); freieLeadsCache = null; toast.success(`Close-Lead verknüpft: ${l.name}`); fertig({ text: `Close: ${l.name || l.id}` }); }
    catch (e) { toast.error(fehlerText(e)); } finally { setBusy(false); }
  };
  const obj = (l: any): Objekt => ({ id: l.id, name: l.name, detail: l.status, url: `https://app.close.com/lead/${l.id}/` });
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!leads) return <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Close-Leads ohne Kunde werden geladen …</p>;
  return <>
    <Suchfeld q={q} setQ={setQ} platzhalter={`${leads.length} Close-Leads ohne Kunde durchsuchen …`} />
    <div className="space-y-1">
      {vorschlag && <Treffer o={obj(vorschlag.l)} vorschlag grund={`Namenstreffer ${Math.round(vorschlag.s * 100)} %`} busy={busy} onPick={() => nimm(vorschlag.l)} />}
      {liste.map(l => <Treffer key={l.id} o={obj(l)} busy={busy} onPick={() => nimm(l)} />)}
      {!vorschlag && !liste.length && <p className="text-xs text-muted-foreground">{dq ? 'Kein Treffer.' : 'Kein Vorschlag – Namen eintippen.'}</p>}
    </div>
    <KeinBedarfKnopf text="Kunde hat keinen Close-Lead." onSpeichern={async () => { await keinBedarf(clientId, 'close'); fertig({ text: 'Kein Close-Lead' }); }} />
  </>;
}

// ---------- Marke in Close ----------
// Exakt die Auswahlwerte des Close-Felds „Marke". Kein Vorschlag – der Nutzer wählt selbst.
const MARKEN = ['AttentionX', 'Haush Haush', 'Leadsharks', 'Viral Connect'] as const;
export function MarkePanel({ clientId, fertig }: { clientId: string; fertig: (e: Erledigt) => void }) {
  const [wahl, setWahl] = useState<typeof MARKEN[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const speichern = async () => {
    if (!wahl) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('close-marke-schreiben', { body: { client_id: clientId, marke: wahl } });
      let r: any = data;
      if (error) { const ctx: any = (error as any).context; r = ctx?.json ? await ctx.json().catch(() => null) : null; throw new Error(r?.error || error.message); }
      if (!r?.ok) throw new Error(r?.error || `Close hält jetzt „${r?.marke ?? 'leer'}"`);
      toast.success(`Marke in Close gesetzt: ${r.marke}`);
      fertig({ text: `Marke: ${r.marke}` });
    } catch (e) { toast.error(fehlerText(e)); } finally { setBusy(false); }
  };
  return <>
    <p className="text-xs flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 w-fit"><AlertTriangle className="h-3.5 w-3.5 text-warning" />Schreibt direkt in Close (Feld „Marke" am verknüpften Lead).</p>
    <div className="flex flex-wrap items-center gap-2">
      {MARKEN.map(m => <Button key={m} size="sm" variant={wahl === m ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setWahl(m)}>{m}</Button>)}
      <Button size="sm" className="h-7 text-xs" disabled={!wahl || busy} onClick={speichern}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'In Close speichern'}</Button>
      <KeinBedarfKnopf text="Keine Marke nötig." onSpeichern={async () => { await keinBedarf(clientId, 'marke'); fertig({ text: 'Keine Marke nötig' }); }} />
    </div>
  </>;
}

// ---------- Buchhaltungsquelle ----------
export function QuellePanel({ clientId, marke, fertig }: { clientId: string; marke: string | null; fertig: (e: Erledigt) => void }) {
  const [busy, setBusy] = useState(false);
  const setzen = async (quelle: 'qonto' | 'lexoffice') => {
    if (!marke) return;
    setBusy(true);
    try {
      const { data: ex, error: e1 } = await (supabase.from as any)('buchhaltung_quelle').select('marke').ilike('marke', marke.trim()).limit(1);
      if (e1) throw new Error(e1.message);
      const r = ex?.length
        ? await (supabase.from as any)('buchhaltung_quelle').update({ quelle, updated_at: new Date().toISOString() }).eq('marke', ex[0].marke)
        : await (supabase.from as any)('buchhaltung_quelle').insert({ marke: marke.trim(), quelle });
      if (r.error) throw new Error(r.error.message);
      toast.success(`Marke „${marke}" → ${quelle}`);
      fertig({ text: `Quelle: ${quelle === 'qonto' ? 'Qonto' : 'lexoffice'}` });
    } catch (e) { toast.error(fehlerText(e)); } finally { setBusy(false); }
  };
  return <>
    {marke ? <p className="text-xs text-muted-foreground">Die Quelle wird für die Marke „{marke}" festgelegt und gilt damit für alle Kunden mit dieser Marke.</p>
      : <p className="text-xs text-muted-foreground">Ohne Marke lässt sich keine Quelle festlegen – zuerst die Marke in Close setzen.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!marke || busy} onClick={() => setzen('qonto')}>Qonto</Button>
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!marke || busy} onClick={() => setzen('lexoffice')}>lexoffice</Button>
      <KeinBedarfKnopf text="Keine Buchhaltungsquelle nötig." onSpeichern={async () => { await keinBedarf(clientId, 'buchhaltung'); fertig({ text: 'Keine Quelle nötig' }); }} />
    </div>
  </>;
}

// ---------- Übersichtstabelle: ein System eines Kunden ----------
export function SystemPanel({ system, kunde, stand, fertig }: {
  system: SystemKey; kunde: { id: string; name: string | null; vor_nachname?: string | null }; stand: SystemStand;
  fertig: (e: Erledigt, objekt: Objekt | null) => void;
}) {
  const { callMeta } = useMetaAds();
  const label = SYSTEME.find(s => s.key === system)?.label || system;
  const [q, setQ] = useState(system === 'drive' ? '' : (kunde.name || ''));
  const dq = useDebounced(q).trim();
  const [treffer, setTreffer] = useState<Objekt[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vorschlag = stand.zustand === 'vorschlag' ? stand.vorschlag : null;
  useEffect(() => {
    if (system === 'close' || system === 'meta') return;
    if (dq.length < 2) { setTreffer([]); return; }
    let ab = false; setErr(null); setTreffer(null);
    suche(system, dq, kunde.id).then(r => { if (!ab) setTreffer(r); }).catch(e => { if (!ab) { setErr(fehlerText(e)); setTreffer([]); } });
    return () => { ab = true; };
  }, [system, dq, kunde.id]);
  const kein = <KeinBedarfKnopf text={`Kein ${label} nötig.`} onSpeichern={async () => { await keinBedarf(kunde.id, system); fertig({ text: `Kein ${label} nötig` }, null); }} />;
  if (system === 'close') return <ClosePanel clientId={kunde.id} namen={[kunde.name, kunde.vor_nachname]} fertig={e => fertig(e, { id: '', name: e.text })} />;
  if (system === 'meta') return <>
    <p className="text-xs text-muted-foreground">Das Werbekonto entsteht aus der Kampagnenzuordnung.</p>
    <Schnellzuordnung clientId={kunde.id} callMeta={callMeta} onZugeordnet={() => fertig({ text: 'Meta zugeordnet' }, { id: '', name: 'Meta' })} />
    {kein}
  </>;
  const nimm = async (o: Objekt) => {
    setBusy(true);
    try { await verknuepfen(system, kunde.id, o); toast.success(`${label}: ${o.name || o.id}`); fertig({ text: `${label}: ${o.name || o.id}` }, o); }
    catch (e) { toast.error(fehlerText(e)); } finally { setBusy(false); }
  };
  // Bester Namenstreffer oben als Vorschlag: bestehender Vorschlag, sonst der Suchtreffer mit dem höchsten Namensanteil.
  const rest = (treffer || []).filter(o => o.id !== vorschlag?.id);
  const bester = !vorschlag ? rest.map(o => ({ o, s: Math.max(namensTreffer(kunde.name, o.name), namensTreffer(kunde.vor_nachname, o.name)) })).filter(x => x.s >= 0.5 && !x.o.belegt).sort((a, b) => b.s - a.s)[0] : undefined;
  return <>
    <Suchfeld q={q} setQ={setQ} platzhalter={system === 'drive' ? 'Drive-Ordnerlink oder ID einfügen …' : `${label} durchsuchen …`} />
    {err && <p className="text-xs text-destructive">{err}</p>}
    <div className="space-y-1">
      {vorschlag && <Treffer o={vorschlag} vorschlag grund={vorschlag.grund} busy={busy} onPick={() => nimm(vorschlag)} />}
      {bester && <Treffer o={bester.o} vorschlag grund={`Namenstreffer ${Math.round(bester.s * 100)} %`} busy={busy} onPick={() => nimm(bester.o)} />}
      {treffer === null ? <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Suche …</p>
        : rest.filter(o => o !== bester?.o).slice(0, 8).map(o => <Treffer key={o.id} o={o} busy={busy} onPick={() => nimm(o)} />)}
      {treffer && !rest.length && !vorschlag && <p className="text-xs text-muted-foreground">{dq.length < 2 ? 'Suchbegriff eintippen.' : 'Kein Treffer.'}</p>}
    </div>
    {kein}
  </>;
}
