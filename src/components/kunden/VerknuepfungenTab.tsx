import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ExternalLink, Search, Loader2, Check, Link2, UserPlus, Copy, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SYSTEME, type SystemKey, type SystemStand, type Objekt, type KundeMin,
  suche, verknuepfen, loesen, verwerfen, zaehle, portalAnlegen, erzeugePasswort, PORTAL_URL,
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
            kunde={kunde}
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

function Zeile({ system, st, busy, kunde, onLink, onDiscard, onUnlink }: {
  system: (typeof SYSTEME)[number]; st: SystemStand; busy: boolean;
  kunde: KundeMin; onLink: (o: Objekt) => void; onDiscard: (v: any) => void; onUnlink: (o: Objekt) => void;
}) {
  const [suchen, setSuchen] = useState(false);
  const clientId = kunde.id;
  const portal = system.key === 'portal';
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
            <Button size="sm" variant="outline" onClick={() => setSuchen(v => !v)}>{portal ? <><Link2 className="h-3.5 w-3.5 mr-1" />Zuordnen</> : <><Search className="h-3.5 w-3.5 mr-1" />Suchen</>}</Button>
          )}
        </div>
      </div>
      {suchen && portal && <PortalAuswahl kunde={kunde} onPick={(o) => { setSuchen(false); onLink(o); }} />}
      {suchen && !portal && <SuchFeld system={system.key} clientId={clientId} label={system.label} onPick={(o) => { setSuchen(false); onLink(o); }} />}
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


function PortalAuswahl({ kunde, onPick }: { kunde: KundeMin; onPick: (o: Objekt) => void }) {
  const [modus, setModus] = useState<'verknuepfen' | 'anlegen' | null>(null);
  const kachel = (aktiv: boolean) => cn('flex-1 flex flex-col items-start gap-2 rounded-2xl border p-5 text-left transition-colors hover:bg-muted/50',
    aktiv ? 'border-primary bg-primary/5' : 'border-border/60');
  return (
    <div className="mt-3 sm:ml-[290px] space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <button className={kachel(modus === 'verknuepfen')} onClick={() => setModus('verknuepfen')}>
          <Link2 className="h-6 w-6 text-primary" />
          <span className="text-sm font-semibold">Bestehendes Konto verknüpfen</span>
          <span className="text-xs text-muted-foreground">Portalkonto aus der Kontenliste wählen</span>
        </button>
        <button className={kachel(modus === 'anlegen')} onClick={() => setModus('anlegen')}>
          <UserPlus className="h-6 w-6 text-primary" />
          <span className="text-sm font-semibold">Neues Konto anlegen</span>
          <span className="text-xs text-muted-foreground">Zugang mit Einmal-Passwort erstellen</span>
        </button>
      </div>
      {modus === 'verknuepfen' && <div className="-mt-3 sm:-ml-[290px]"><SuchFeld system="portal" clientId={kunde.id} label="LeadSharks Portal" onPick={onPick} /></div>}
      {modus === 'anlegen' && <PortalAnlegen kunde={kunde} onPick={onPick} />}
    </div>
  );
}

type Feld = 'email' | 'passwort' | 'crm_client_id';
/** Vorbelegung nur aus clients.name: letztes Wort = Nachname, alles davor = Vorname, ein Wort = nur Nachname. */
function aufteilen(name: string | null | undefined) {
  const w = (name || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return { firma: w.join(' '), nachname: w.length ? w[w.length - 1] : '', vorname: w.length > 1 ? w.slice(0, -1).join(' ') : '' };
}
function PortalAnlegen({ kunde, onPick }: { kunde: KundeMin; onPick: (o: Objekt) => void }) {
  const vor = aufteilen(kunde.name);
  const [f, setF] = useState({ email: kunde.email || '', firma: vor.firma, vorname: vor.vorname, nachname: vor.nachname, telefon: kunde.phone || '' });
  const [busy, setBusy] = useState(false);
  const [feldFehler, setFeldFehler] = useState<Partial<Record<Feld, string>>>({});
  const [konflikt, setKonflikt] = useState<{ text: string; profile_id: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<{ pw: string; o: Objekt } | null>(null);

  const anlegen = async () => {
    setBusy(true); setFeldFehler({}); setKonflikt(null); setFehler(null);
    const pw = erzeugePasswort();
    try {
      const r = await portalAnlegen({ email: f.email.trim(), passwort: pw, crm_client_id: kunde.id, firma: f.firma.trim(), vorname: f.vorname.trim(), nachname: f.nachname.trim() });
      if (r.ok && r.profile_id) { setFertig({ pw, o: { id: r.profile_id, name: f.firma.trim() || f.email.trim(), url: PORTAL_URL } }); return; }
      if (r.error === 'email_exists' && r.profile_id) setKonflikt({ text: 'Für diese Mailadresse gibt es bereits ein Portalkonto.', profile_id: r.profile_id });
      else if (r.error === 'crm_client_id_exists' && r.profile_id) setKonflikt({ text: 'Dieser Kunde hat bereits ein Portalkonto.', profile_id: r.profile_id });
      else if (r.error === 'invalid_email') setFeldFehler({ email: 'Bitte eine gültige Mailadresse eingeben.' });
      else if (r.error === 'invalid_password') setFeldFehler({ passwort: 'Das erzeugte Passwort wurde abgelehnt (8–72 Zeichen erforderlich). Bitte erneut versuchen.' });
      else if (r.error === 'invalid_crm_client_id') setFeldFehler({ crm_client_id: 'Die Kunden-ID wurde vom Portal nicht akzeptiert.' });
      else setFehler(`Anlegen fehlgeschlagen: ${r.error}`);
    } catch (e: any) { setFehler(e.message || 'Anlegen fehlgeschlagen'); }
    finally { setBusy(false); }
  };

  if (fertig) return (
    <div className="rounded-2xl border border-border/60 p-5 space-y-3">
      <p className="text-sm font-semibold">Portalkonto angelegt</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-lg bg-muted/60 px-3 py-2 text-sm font-mono tracking-wide select-all">{fertig.pw}</code>
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(fertig.pw).then(() => toast.success('Passwort kopiert'))}><Copy className="h-3.5 w-3.5 mr-1" />Kopieren</Button>
      </div>
      <p className="text-xs text-muted-foreground flex gap-1.5"><ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />Dieses Passwort wird nur jetzt angezeigt. Der Kunde muss es bei der ersten Anmeldung ändern, es verfällt nach 7 Tagen.</p>
      <Button size="sm" onClick={() => onPick(fertig.o)}>Konto mit Kunden verknüpfen</Button>
    </div>
  );

  const feld = (k: keyof typeof f, label: string, err?: string) => (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <Input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className={cn('h-9 bg-muted/50 border-0', err && 'ring-1 ring-destructive')} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
  return (
    <div className="rounded-2xl border border-border/60 p-5 space-y-3">
      {feld('email', 'Mail', feldFehler.email)}
      {feld('firma', 'Firma')}
      <div className="grid grid-cols-2 gap-3">{feld('vorname', 'Vorname')}{feld('nachname', 'Nachname')}</div>
      {feldFehler.passwort && <p className="text-xs text-destructive">{feldFehler.passwort}</p>}
      {feldFehler.crm_client_id && <p className="text-xs text-destructive">{feldFehler.crm_client_id}</p>}
      {fehler && <p className="text-xs text-destructive">{fehler}</p>}
      {konflikt && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-xs flex-1">{konflikt.text}</p>
          <Button size="sm" variant="outline" onClick={() => onPick({ id: konflikt.profile_id, name: f.firma.trim() || f.email.trim(), url: PORTAL_URL })}>Stattdessen verknüpfen</Button>
        </div>
      )}
      <Button size="sm" disabled={busy || !f.email.trim()} onClick={anlegen}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Passwort erzeugen &amp; Konto anlegen
      </Button>
    </div>
  );
}
