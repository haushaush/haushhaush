import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, X, Minus, ExternalLink, GitMerge } from 'lucide-react';
import { BuchhaltungUngeklaert } from '@/components/kunden/BuchhaltungUngeklaert';
import { VerknuepfungsArbeitsliste, type ArbeitslisteZahlen } from '@/components/kunden/VerknuepfungsArbeitsliste';
import { cn } from '@/lib/utils';
import { SYSTEME, ladeStand, zaehle, type KundeMin, type Objekt, type SystemKey, type SystemStand, type Vorschlag } from '@/lib/kundenVerknuepfungen';
import { SystemPanel } from '@/components/kunden/QuickMatch';

type Stand = Record<SystemKey, SystemStand>;

export default function KundenVerknuepfungen() {
  const [kunden, setKunden] = useState<KundeMin[]>([]);
  const [stand, setStand] = useState<Map<string, Stand>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [pruefen, setPruefen] = useState(false);
  const [zahlen, setZahlen] = useState<ArbeitslisteZahlen | null>(null);
  const [offen, setOffen] = useState<{ id: string; sys: SystemKey } | null>(null);
  const [erledigt, setErledigt] = useState<Map<string, string>>(new Map());
  useEffect(() => { document.title = 'Verknüpfungen · Kunden'; }, []);
  /** Nach erfolgreichem Match: Zelle sofort umstellen, damit LÜCKEN live sinkt. */
  const setzeStand = (clientId: string, sys: SystemKey, objekt: Objekt | null, text?: string) => {
    setStand(m => {
      const st = m.get(clientId); if (!st) return m;
      const n = new Map(m); n.set(clientId, { ...st, [sys]: objekt ? { zustand: 'verknuepft', objekt } : { zustand: 'nicht_angebunden' } });
      return n;
    });
    if (text) setErledigt(e => new Map(e).set(`${clientId}|${sys}`, text));
    setOffen(null);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('clients')
      .select('id, name, vor_nachname, email, website_url, website')
      .is('deleted_at', null).in('kundenstatus', ['In Betreuung', 'Pausiert'] as any).order('name');
    const ks = (data || []) as KundeMin[];
    setKunden(ks);
    setStand(await ladeStand(ks));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const zeilen = useMemo(() => kunden
    .filter(k => !q || (k.name || '').toLowerCase().includes(q.toLowerCase()))
    .filter(k => stand.has(k.id))
    .map(k => ({ k, st: stand.get(k.id)!, z: zaehle(stand.get(k.id)!) }))
    .sort((a, b) => b.z.luecken - a.z.luecken || (a.k.name || '').localeCompare(b.k.name || '')), [kunden, stand, q]);

  const vorschlaege = useMemo(() => zeilen.flatMap(r =>
    SYSTEME.map(s => r.st[s.key]).filter((v): v is Extract<SystemStand, { zustand: 'vorschlag' }> => v.zustand === 'vorschlag')
      .map(v => ({ kunde: r.k, v: v.vorschlag }))), [zeilen]);
  const mitLuecken = zeilen.filter(r => r.z.luecken > 0).length;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-heading flex items-center gap-2"><GitMerge className="h-6 w-6 text-primary" />Verknüpfungen</h1>
          <p className="text-sm mt-1 tabular-nums font-medium">
            {zahlen ? `${zahlen.zahler} Qonto-Zahler · ${zahlen.lexoffice} lexoffice-Kontakte · ${zahlen.kampagnen} Kampagnen · ${zahlen.ohneZahler} Kunden ohne Zahler · ${zahlen.dubletten} Dubletten` : 'Lade offene Posten …'}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {loading ? '…' : `${zeilen.length} aktive Kunden · ${mitLuecken} mit Lücken · ${vorschlaege.length} Vorschläge offen`}
          </p>
        </div>
        <div className="flex gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Kunde suchen…" className="h-9 w-56 bg-muted/50 border-0" />
          <Button size="sm" onClick={() => setPruefen(true)} disabled={!vorschlaege.length}>Alle Vorschläge prüfen</Button>
        </div>
      </div>

      <VerknuepfungsArbeitsliste onZahlen={setZahlen} />
      <BuchhaltungUngeklaert />
      <h2 className="text-lg font-semibold font-heading pt-2">Übersicht je Kunde</h2>
      <div className="rounded-2xl bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border/60">
              <th className="text-left font-medium px-4 py-3">Kunde</th>
              <th className="text-right font-medium px-2 py-3">Lücken</th>
              {SYSTEME.map(s => <th key={s.key} className={cn('font-medium px-2 py-3 text-center', !s.angebunden && 'opacity-50')}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}><td colSpan={2 + SYSTEME.length} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>
            )) : zeilen.map(({ k, st, z }) => (
              <Fragment key={k.id}>
              <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5"><Link to={`/kunden/${k.id}?tab=verknuepfungen`} className="font-medium hover:text-primary">{k.name}</Link></td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{z.luecken}</td>
                {SYSTEME.map(s => {
                  const klickbar = s.angebunden && (st[s.key].zustand === 'offen' || st[s.key].zustand === 'vorschlag');
                  const aktiv = offen?.id === k.id && offen.sys === s.key;
                  return <td key={s.key} className="px-2 py-2.5 text-center">
                    {klickbar ? <button onClick={() => setOffen(aktiv ? null : { id: k.id, sys: s.key })} title={`${s.label} zuordnen`} aria-expanded={aktiv}
                      className={cn('rounded-md px-1.5 py-0.5 hover:bg-muted', aktiv && 'bg-muted ring-1 ring-primary/40')}><Symbol st={st[s.key]} /></button>
                      : <span title={erledigt.get(`${k.id}|${s.key}`)}><Symbol st={st[s.key]} /></span>}
                  </td>;
                })}
              </tr>
              {offen?.id === k.id && (
                <tr className="border-b border-border/40 bg-muted/10">
                  <td colSpan={2 + SYSTEME.length} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs mb-2"><span className="font-medium">{SYSTEME.find(s => s.key === offen.sys)?.label} für {k.name}</span>
                      <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => setOffen(null)}>Schließen</Button></div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                      <SystemPanel key={offen.sys} system={offen.sys} kunde={k} stand={st[offen.sys]} fertig={(e, o) => setzeStand(k.id, offen.sys, o, e.text)} />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">✓ verknüpft · • Vorschlag offen · ✕ fehlt (anklicken zum Zuordnen) · – nicht nötig, nicht angebunden oder nicht sichtbar</p>

      <VorschlagPruefung open={pruefen} onClose={() => setPruefen(false)} liste={vorschlaege} />
    </div>
  );
}

function Symbol({ st }: { st: SystemStand }) {
  if (st.zustand === 'verknuepft') return <Check className="h-4 w-4 text-success inline" />;
  if (st.zustand === 'vorschlag') return <span className="inline-block h-2 w-2 rounded-full bg-primary" title={st.vorschlag.grund} />;
  if (st.zustand === 'offen') return <X className="h-4 w-4 text-muted-foreground inline" />;
  return <Minus className="h-4 w-4 text-muted-foreground/40 inline" />;
}

/** Zeigt alle offenen Vorschläge nur an; übernommen wird einzeln beim Kunden oder in der Arbeitsliste. */
function VorschlagPruefung({ open, onClose, liste }: { open: boolean; onClose: () => void; liste: { kunde: KundeMin; v: Vorschlag }[] }) {
  const label = (s: SystemKey) => SYSTEME.find(x => x.key === s)?.label;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Offene Vorschläge</DialogTitle>
          <DialogDescription className="tabular-nums">{liste.length} Vorschläge · nur Anzeige – übernehmen beim jeweiligen Kunden</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/50">
          {liste.map((x, i) => (
            <div key={i} className="py-2.5 grid grid-cols-[1fr_1fr_auto] gap-3 items-center text-sm">
              <Link to={`/kunden/${x.kunde.id}?tab=verknuepfungen`} onClick={onClose} className="font-medium hover:text-primary truncate">{x.kunde.name}</Link>
              <div className="min-w-0">
                <p className="truncate"><span className="text-xs text-muted-foreground">{label(x.v.system)}: </span>{x.v.name || x.v.id}</p>
                <p className="text-xs text-muted-foreground truncate">{x.v.grund}</p>
              </div>
              {x.v.url ? <a href={x.v.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /></a> : <span />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
