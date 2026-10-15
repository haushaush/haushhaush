import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ExternalLink, Search, Loader2, Check, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SYSTEME, type SystemKey, type SystemStand, type Objekt, type KundeMin,
  suche, verknuepfen, loesen, verwerfen, zaehle,
} from '@/lib/kundenVerknuepfungen';
import { MetaWerbebudgetBlock } from './MetaWerbebudgetBlock';

export function VerknuepfungenTab({ kunde, stand, loading, onChanged }: {
  kunde: KundeMin;
  stand: Record<SystemKey, SystemStand> | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<SystemKey | null>(null);
  const [loeseZiel, setLoeseZiel] = useState<{ system: SystemKey; objekt: Objekt } | null>(null);

  if (loading || !stand) return <div className="space-y-2">{SYSTEME.map(s => <Skeleton key={s.key} className="h-14 w-full" />)}</div>;
  const z = zaehle(stand);

  const run = async (system: SystemKey, fn: () => Promise<void>, ok: string) => {
    setBusy(system);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e: any) { toast.error(e.message || 'Fehlgeschlagen'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        <span className="text-foreground font-medium">{z.verknuepft} von {z.gesamt} Systemen verknüpft</span>
        {' · '}{z.vorschlaege === 1 ? '1 Vorschlag offen' : `${z.vorschlaege} Vorschläge offen`}
      </p>
      <div className="rounded-2xl bg-card shadow-sm divide-y divide-border/60">
        {SYSTEME.map(s => (
          <Zeile key={s.key} system={s} st={stand[s.key]} busy={busy === s.key}
            clientId={kunde.id}
            onLink={(o) => run(s.key, () => verknuepfen(s.key, kunde.id, o), `${s.label} verknüpft`)}
            onDiscard={(v) => run(s.key, () => verwerfen(v, kunde.id), 'Vorschlag verworfen')}
            onUnlink={(o) => setLoeseZiel({ system: s.key, objekt: o })}
          />
        ))}
      </div>

      <MetaWerbebudgetBlock clientId={kunde.id} />

      <Dialog open={!!loeseZiel} onOpenChange={(o) => !o && setLoeseZiel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Verknüpfung lösen?</DialogTitle>
            <DialogDescription>
              {SYSTEME.find(x => x.key === loeseZiel?.system)?.label}: „{loeseZiel?.objekt.name || loeseZiel?.objekt.id}“ wird von diesem Kunden getrennt. Daten im Zielsystem bleiben unverändert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLoeseZiel(null)}>Abbrechen</Button>
            <Button variant="destructive" size="sm" onClick={() => {
              const t = loeseZiel!; setLoeseZiel(null);
              run(t.system, () => loesen(t.system, kunde.id, t.objekt), 'Verknüpfung gelöst');
            }}>Lösen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Zeile({ system, st, busy, clientId, onLink, onDiscard, onUnlink }: {
  system: (typeof SYSTEME)[number]; st: SystemStand; busy: boolean;
  clientId?: string; onLink: (o: Objekt) => void; onDiscard: (v: any) => void; onUnlink: (o: Objekt) => void;
}) {
  const [suchen, setSuchen] = useState(false);
  const grau = st.zustand === 'nicht_angebunden' || st.zustand === 'keine_berechtigung';
  const status = {
    verknuepft: { t: 'Verknüpft', c: 'text-success' },
    vorschlag: { t: 'Vorschlag', c: 'text-primary' },
    offen: { t: 'Nicht verknüpft', c: 'text-muted-foreground' },
    nicht_angebunden: { t: 'Nicht angebunden', c: 'text-muted-foreground/60' },
    keine_berechtigung: { t: 'Keine Berechtigung', c: 'text-muted-foreground/60' },
  }[st.zustand];

  return (
    <div className={cn('px-5 py-4', grau && 'opacity-60')}>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_130px_1fr_auto] gap-2 sm:gap-4 sm:items-center">
        <div>
          <p className="text-sm font-medium">{system.label}</p>
          <p className="text-[11px] text-muted-foreground">{system.objekt}</p>
        </div>
        <p className={cn('text-xs font-medium flex items-center gap-1.5', status.c)}>
          <span className={cn('h-1.5 w-1.5 rounded-full bg-current')} />{status.t}
        </p>
        <div className="min-w-0 text-sm">
          {st.zustand === 'verknuepft' && <ObjektZeile o={st.objekt} />}
          {st.zustand === 'vorschlag' && (
            <div className="min-w-0">
              <ObjektZeile o={st.vorschlag} />
              <p className="text-[11px] text-muted-foreground mt-0.5">{st.vorschlag.grund}</p>
            </div>
          )}
          {st.zustand === 'offen' && <span className="text-xs text-muted-foreground">Kein {system.objekt} zugeordnet</span>}
          {st.zustand === 'nicht_angebunden' && <span className="text-xs text-muted-foreground">Im Dashboard noch nicht angebunden</span>}
          {st.zustand === 'keine_berechtigung' && <span className="text-xs text-muted-foreground">Für dein Konto nicht sichtbar</span>}
        </div>
        <div className="flex gap-2 sm:justify-end">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!busy && st.zustand === 'verknuepft' && (
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onUnlink(st.objekt)}>Verknüpfung lösen</Button>
          )}
          {!busy && st.zustand === 'vorschlag' && (<>
            <Button size="sm" onClick={() => onLink(st.vorschlag)}><Check className="h-3.5 w-3.5 mr-1" />Übernehmen</Button>
            <Button size="sm" variant="ghost" onClick={() => onDiscard(st.vorschlag)}>Verwerfen</Button>
          </>)}
          {!busy && (st.zustand === 'offen' || st.zustand === 'vorschlag') && (
            <Button size="sm" variant="outline" onClick={() => setSuchen(v => !v)}><Search className="h-3.5 w-3.5 mr-1" />Suchen</Button>
          )}
        </div>
      </div>
      {suchen && <SuchFeld system={system.key} clientId={clientId} label={system.label} onPick={(o) => { setSuchen(false); onLink(o); }} />}
    </div>
  );
}

function ObjektZeile({ o }: { o: Objekt }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="truncate font-medium">{o.name || '(ohne Namen)'}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums truncate hidden md:inline">{o.id}</span>
      {o.detail && <span className="text-[11px] text-muted-foreground shrink-0">· {o.detail}</span>}
      {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" title="Im Zielsystem öffnen"><ExternalLink className="h-3.5 w-3.5" /></a>}
    </div>
  );
}

function SuchFeld({ system, clientId, label, onPick }: { system: SystemKey; clientId?: string; label: string; onPick: (o: Objekt) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Objekt[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => {
      suche(system, q.trim(), clientId).then(r => { setRes(r); setErr(null); }).catch(e => setErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [q, system, clientId]);
  const ph = system === 'drive' ? 'Link zum Drive-Ordner einfügen…' : `In ${label} suchen…`;
  return (
    <div className="mt-3 sm:ml-[290px] space-y-1.5">
      <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={ph} className="h-9 bg-muted/50 border-0" />
      {err && <p className="text-xs text-destructive">{err}</p>}
      {res && res.length === 0 && <p className="text-xs text-muted-foreground py-2">Nichts gefunden</p>}
      {res?.map(o => (
        <button key={o.id} disabled={!!o.belegt} onClick={() => !o.belegt && onPick(o)} className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/60 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{o.name || o.id}</span>
          {o.detail && <span className="text-[11px] text-muted-foreground truncate">{o.detail}</span>}
          {o.belegt && <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">bereits {o.belegt} zugeordnet</span>}
        </button>
      ))}
    </div>
  );
}

