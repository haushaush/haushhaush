// Portal-Zuordnung (bestehendes Konto oder neu anlegen) und das gemeinsame Suchfeld der Verknüpfungen.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Link2, UserPlus, Copy, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type SystemKey, type Objekt, type KundeMin, suche, portalAnlegen, erzeugePasswort, PORTAL_URL, auchBeiText } from '@/lib/kundenVerknuepfungen';

export function SuchFeld({ system, clientId, label, onPick }: { system: SystemKey; clientId?: string; label: string; onPick: (o: Objekt) => void }) {
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
          {!o.belegt && auchBeiText(o.auchBei) && <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">{auchBeiText(o.auchBei)}</span>}
        </button>
      ))}
    </div>
  );
}


export function PortalAuswahl({ kunde, onPick }: { kunde: KundeMin; onPick: (o: Objekt) => void }) {
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
      const r = await portalAnlegen({ email: f.email.trim(), passwort: pw, crm_client_id: kunde.id, firma: f.firma.trim(), vorname: f.vorname.trim(), nachname: f.nachname.trim(), telefon: f.telefon.trim() });
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
      {feld('telefon', 'Telefon')}
      <p className="text-xs text-muted-foreground">Vorbelegt aus dem Kundennamen. Bei Firmenkunden bitte Vor- und Nachname des Ansprechpartners eintragen.</p>
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
