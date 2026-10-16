import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertCircle, AlertTriangle, Copy, ExternalLink, KeyRound, Loader2, Save, ShieldAlert, Bell, ChartNoAxesCombined, LayoutDashboard, Receipt, UserRound, Megaphone, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PORTAL_URL, erzeugePasswort, portalEinstellungen, portalEinstellungenSetzen, portalZugangZuruecksetzen } from '@/lib/kundenVerknuepfungen';

const BEREICH_NAMEN: Record<string, string> = {
  benchmark: 'Marktradar', compliance: 'Compliance', contracts: 'Verträge', kennzahlen: 'Kennzahlen', outreach: 'Outreach',
};

const ABSCHNITTE = [
  { id: 'uebersicht', name: 'Übersicht', icon: LayoutDashboard, gruppe: 'Kunde' },
  { id: 'kundendaten', name: 'Kundendaten & Zugang', icon: UserRound, gruppe: 'Kunde' },
  { id: 'benachrichtigungen', name: 'Benachrichtigungen', icon: Bell, gruppe: 'Kunde' },
  { id: 'kennzahlen', name: 'Kennzahlen', icon: ChartNoAxesCombined, gruppe: 'Kunde' },
  { id: 'rechnungen', name: 'Rechnungen', icon: Receipt, gruppe: 'Kunde' },
  { id: 'meta', name: 'Meta', icon: Megaphone, gruppe: 'Integrationen' },
] as const;
type Abschnitt = typeof ABSCHNITTE[number]['id'];

const SYSTEME = [
  { wert: 'lead_system', name: 'Lead System', beschreibung: 'Eigene Kampagne, Leads direkt per Mail' },
  { wert: 'termin_system_solo', name: 'Termin System Solo', beschreibung: 'Terminierung durch LeadSharks' },
  { wert: 'termin_system', name: 'Termin System', beschreibung: 'Terminierung plus Sales Enablement' },
  { wert: 'leadkauf', name: 'Leadkauf', beschreibung: 'Bezug von Leads, kein Betreuungspaket' },
  { wert: 'kein_system', name: 'Kein System', beschreibung: 'Derzeit nichts gebucht' },
];

const VERTRAG_FELDER: { key: string; label: string; typ: 'number' | 'date'; hilfe?: string }[] = [
  { key: 'start_date', label: 'Start', typ: 'date' },
  { key: 'live_date', label: 'Livegang', typ: 'date' },
  { key: 'betreuung_monate', label: 'Betreuung (Monate)', typ: 'number', hilfe: 'Laufzeit ab Livegang.' },
  { key: 'verlaengerung_monate', label: 'Verlängerung (Monate)', typ: 'number', hilfe: 'Aus Garantie-Nacherfüllung.' },
  { key: 'garantie_menge', label: 'Garantiemenge', typ: 'number', hilfe: 'Leer lassen, wenn nicht vereinbart.' },
  { key: 'budget_guthaben', label: 'Werbebudget-Guthaben (€)', typ: 'number' },
  { key: 'budget_empfohlen', label: 'Empfohlenes Monatsbudget (€)', typ: 'number' },
];

const systemName = (wert: string) => SYSTEME.find(s => s.wert === wert)?.name || wert;
const sichtbareVertragsfelder = (system: string) => {
  if (system === 'leadkauf') return VERTRAG_FELDER.filter(f => f.key === 'start_date' || f.key === 'garantie_menge');
  if (['lead_system', 'termin_system_solo', 'termin_system'].includes(system)) return VERTRAG_FELDER;
  return [];
};

function fehlerText(code: unknown): string {
  const c = String(code || '');
  const m: Record<string, string> = {
    profile_not_found: 'Das verknüpfte Portalkonto existiert nicht mehr. Die Verknüpfung zeigt ins Leere – bitte im Tab „Verknüpfungen" lösen und neu setzen.',
    tier_required: 'Bitte ein gültiges System auswählen – ohne System können keine Vertragsangaben gespeichert werden.',
    invalid_password: 'Das erzeugte Passwort wurde abgelehnt. Bitte erneut versuchen.',
    unauthorized: 'Das Portal hat die Anfrage abgelehnt (Zugangsschlüssel ungültig).',
    invalid_action: 'Diese Aktion wird von der Portal-Schnittstelle nicht unterstützt.',
    invalid_json: 'Die Anfrage war fehlerhaft aufgebaut.',
  };
  if (m[c]) return m[c];
  if (/fetch|network|failed/i.test(c)) return 'Das Portal ist gerade nicht erreichbar. Bitte später erneut versuchen.';
  return 'Das Portal hat einen Fehler gemeldet. Bitte später erneut versuchen.';
}

const fmtDatum = (v?: string | null) => (v ? new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const fmtZeit = (v: string) => new Date(v).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtEur = (v: unknown) => (v == null || v === '' ? '—' : Number(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
const zuText = (v: unknown) => (v == null ? '' : String(v).slice(0, 10).length && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : String(v));

export function LeadSharksTab({ profileId }: { profileId: string }) {
  const [daten, setDaten] = useState<any>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vertrag, setVertrag] = useState<Record<string, string>>({});
  const [bereiche, setBereiche] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState('');
  const [speichern, setSpeichern] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);
  const [reset, setReset] = useState(false);
  const [neuesPw, setNeuesPw] = useState<string | null>(null);
  const [systemFrage, setSystemFrage] = useState(false);
  const [abschnitt, setAbschnitt] = useState<Abschnitt>('uebersicht');

  const initVertrag = (v: any) => Object.fromEntries(['tier', ...VERTRAG_FELDER.map(f => f.key)].map(key => [key, v ? zuText(v[key]) : '']));
  const initBereiche = (b: any[]) => Object.fromEntries((b || []).map(x => [x.module_key, !!x.enabled]));
  const initLimit = (l: any) => (l?.global_lead_limit ? String(l.global_lead_limit) : '');

  const holen = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const r = await portalEinstellungen(profileId);
      if (!r?.ok) { setFehler(fehlerText(r?.error)); setDaten(null); return; }
      setDaten(r);
      setVertrag(initVertrag(r.vertrag));
      setBereiche(initBereiche(r.bereiche));
      setLimit(initLimit(r.lead_limit));
    } catch (e: any) { setFehler(fehlerText(e?.message)); }
    finally { setLaden(false); }
  }, [profileId]);

  useEffect(() => { holen(); }, [holen]);

  const aenderungen = useMemo(() => {
    if (!daten) return {};
    const out: any = {};
    const v0 = initVertrag(daten.vertrag);
    const vertragsAenderungen: Record<string, string | number | null> = {};
    if (v0.tier !== vertrag.tier) vertragsAenderungen.tier = vertrag.tier;
    for (const f of sichtbareVertragsfelder(vertrag.tier)) {
      const s = (vertrag[f.key] ?? '').trim();
      if (v0[f.key] === s) continue;
      vertragsAenderungen[f.key] = s === '' ? null : f.typ === 'number' ? Number(s.replace(',', '.')) : s;
    }
    if (Object.keys(vertragsAenderungen).length) out.vertrag = vertragsAenderungen;
    const b0 = initBereiche(daten.bereiche);
    const geaendert = Object.keys(bereiche).filter(k => b0[k] !== bereiche[k]);
    if (geaendert.length) out.bereiche = geaendert.map(k => ({ module_key: k, enabled: bereiche[k] }));
    if (initLimit(daten.lead_limit) !== limit.trim()) {
      const n = Number(limit.trim() || 0);
      out.global_lead_limit = n > 0 ? n : null;
    }
    return out;
  }, [daten, vertrag, bereiche, limit]);
  const hatAenderungen = Object.keys(aenderungen).length > 0;

  async function speichernKlick() {
    setSpeicherFehler(null);
    if (aenderungen.vertrag && !SYSTEME.some(s => s.wert === vertrag.tier)) { setSpeicherFehler(fehlerText('tier_required')); return; }
    if (daten?.vertrag?.tier && aenderungen.vertrag?.tier && daten.vertrag.tier !== vertrag.tier) {
      setSystemFrage(true);
      return;
    }
    await speichernAusfuehren();
  }

  async function speichernAusfuehren() {
    setSystemFrage(false);
    setSpeichern(true);
    try {
      const r = await portalEinstellungenSetzen(profileId, aenderungen);
      if (!r?.ok) { setSpeicherFehler(fehlerText(r?.error)); return; }
      toast.success('Änderungen im Portal gespeichert');
      await holen();
    } catch (e: any) { setSpeicherFehler(fehlerText(e?.message)); }
    finally { setSpeichern(false); }
  }

  async function zuruecksetzen() {
    setFrage(false); setReset(true);
    const pw = erzeugePasswort();
    try {
      const r = await portalZugangZuruecksetzen(profileId, pw);
      if (!r?.ok) { toast.error(fehlerText(r?.error)); return; }
      setNeuesPw(pw);
      holen();
    } catch (e: any) { toast.error(fehlerText(e?.message)); }
    finally { setReset(false); }
  }

  const kopf = (
    <div className="flex justify-end">
      <Button asChild size="sm" variant="outline"><a href={PORTAL_URL} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" />Im Portal öffnen</a></Button>
    </div>
  );

  if (laden && !daten) return <div className="space-y-3">{kopf}<Skeleton className="h-40 w-full" /><Skeleton className="h-60 w-full" /></div>;
  if (fehler) return (
    <div className="space-y-3">{kopf}
      <Card><CardContent className="p-5 flex gap-2 text-sm"><AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><div className="space-y-2"><p>{fehler}</p><Button size="sm" variant="outline" onClick={holen}>Erneut laden</Button></div></CardContent></Card>
    </div>
  );

  const k = daten?.konto || {};
  const ablauf = k.uebergangspasswort_bis || null;
  const abgelaufen = ablauf && new Date(ablauf).getTime() < Date.now();
  const ll = daten?.lead_limit || {};
  const leads = daten?.leads || {};

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{kopf}</div>
      <div className="flex min-w-0 flex-col gap-5 md:flex-row md:gap-6">
        <nav aria-label="LeadSharks Abschnitte" className="flex min-w-0 gap-5 overflow-x-auto border-b pb-3 md:w-[220px] md:shrink-0 md:flex-col md:gap-6 md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-4">
          {['Kunde', 'Integrationen'].map(gruppe => (
            <div key={gruppe} className="shrink-0 space-y-2">
              <h3 className="px-2 text-xs uppercase tracking-wide text-muted-foreground">{gruppe}</h3>
              <div className="flex gap-1 md:flex-col">
                {ABSCHNITTE.filter(a => a.gruppe === gruppe).map(a => (
                  <Button key={a.id} variant="ghost" aria-current={abschnitt === a.id ? 'page' : undefined}
                    onClick={() => setAbschnitt(a.id)}
                    className={`justify-start gap-2 whitespace-nowrap px-2 md:w-full ${abschnitt === a.id ? 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary' : 'text-muted-foreground'}`}>
                    <a.icon className="h-4 w-4 shrink-0" />{a.name}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-4">
          <h2 className="text-lg font-semibold">{ABSCHNITTE.find(a => a.id === abschnitt)?.name}</h2>

      {abschnitt === 'kundendaten' && <>
      <Card>
        <CardHeader><CardTitle className="text-base">Kontaktdaten</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 [&_dd]:break-words">
            <Feld label="Firmenname" wert={k.company_name} />
            <Feld label="Vorname" wert={k.first_name} />
            <Feld label="Nachname" wert={k.last_name} />
            <div>
              <Feld label="E-Mail (Login)" wert={k.email} />
              <p className="mt-1 text-xs text-muted-foreground">Nicht änderbar.</p>
            </div>
            <Feld label="Telefon" wert={k.phone} />
            <Feld label="USt-IdNr." wert="—" />
          </dl>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Diese Daten werden derzeit im Portal gepflegt.</p>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Rolle & Zugang</CardTitle>
          <Button size="sm" variant="outline" disabled={reset} onClick={() => setFrage(true)}>
            {reset ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <KeyRound className="h-3.5 w-3.5 mr-1" />}Zugang zurücksetzen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <Feld label="Status" wert={<Badge variant={k.is_active === false ? 'secondary' : 'outline'}>{k.is_active === false ? 'inaktiv' : 'aktiv'}</Badge>} />
            <Feld label="Angelegt am" wert={fmtDatum(k.created_at)} />
          </dl>
          {k.passwort_wechsel_noetig && (abgelaufen
            ? <p className="flex gap-1.5 text-destructive font-medium"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />Zugang abgelaufen</p>
            : <p className="flex gap-1.5 font-medium text-warning"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Passwortwechsel offen{ablauf ? `, Übergangspasswort läuft am ${fmtDatum(ablauf)} um ${fmtZeit(ablauf)} ab` : ''}
              </p>)}
          {neuesPw && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm bg-muted px-2 py-1 rounded">{neuesPw}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(neuesPw).then(() => toast.success('Passwort kopiert'))}><Copy className="h-3.5 w-3.5 mr-1" />Kopieren</Button>
              </div>
              <p className="text-xs text-muted-foreground flex gap-1.5"><ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />Dieses Passwort wird nur jetzt angezeigt. Der Kunde muss es bei der ersten Anmeldung ändern, es verfällt nach 7 Tagen.</p>
            </div>
          )}
        </CardContent>
      </Card>

      </>}
      {abschnitt === 'uebersicht' && <>
      {/* 2. Gebuchtes System */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Gebuchtes System</CardTitle>
            <p className="text-sm text-muted-foreground">Erscheint beim Kunden unter „Mein System". Schaltet keine Module oder Kennzahlen frei.</p>
          </div>
          {!daten?.vertrag?.tier && <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-warning">Noch nicht festgelegt</Badge>}
        </CardHeader>
        <CardContent className="space-y-5">
          {!daten?.vertrag?.tier && <p className="text-sm text-muted-foreground">Für diesen Kunden ist noch kein System hinterlegt. Bitte nachtragen – bis dahin sieht der Kunde nur einen neutralen Hinweis.</p>}
          <div className="space-y-1.5">
            <label htmlFor="leadsharks-system" className="text-sm font-medium">System*</label>
            <Select value={vertrag.tier || ''} onValueChange={tier => setVertrag(v => ({ ...v, tier }))} required>
              <SelectTrigger id="leadsharks-system" className="h-auto min-h-10 text-left [&>span]:line-clamp-none [&>span]:min-w-0 [&>span]:whitespace-normal">
                <SelectValue placeholder="System auswählen" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {SYSTEME.map(s => <SelectItem key={s.wert} value={s.wert} className="whitespace-normal">{s.name} – {s.beschreibung}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {vertrag.tier === 'kein_system' && <p className="text-sm text-muted-foreground">Betreuung, Laufzeit, Garantie und Budget gibt es hier nicht. Vorhandene Werte bleiben gespeichert, sind nur ausgeblendet.</p>}
          {vertrag.tier === 'leadkauf' && <p className="text-sm text-muted-foreground">Betreuung voraussichtlich 1 Monat – keine feste Laufzeit, keine Vertragsbindung.</p>}
          {sichtbareVertragsfelder(vertrag.tier).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              {sichtbareVertragsfelder(vertrag.tier).map(f => {
                const label = f.key !== 'garantie_menge' ? f.label : vertrag.tier === 'leadkauf' ? 'Leadanzahl' : vertrag.tier === 'lead_system' ? 'Garantiemenge (Leads/Monat)' : 'Garantiemenge (erschienene Termine/Monat)';
                const hilfe = f.key === 'garantie_menge' && vertrag.tier === 'leadkauf' ? 'Vereinbarte Menge, keine Garantie. Leer lassen, wenn nicht vereinbart.' : f.hilfe;
                return (
                  <div key={f.key} className="min-w-0 space-y-1.5">
                    <label htmlFor={`leadsharks-${f.key}`} className="block text-sm font-medium">{label}</label>
                    <Input id={`leadsharks-${f.key}`} type={f.typ} inputMode={f.typ === 'number' ? 'decimal' : undefined} value={vertrag[f.key] ?? ''}
                      aria-describedby={hilfe ? `leadsharks-${f.key}-hilfe` : undefined}
                      onChange={e => setVertrag(v => ({ ...v, [f.key]: e.target.value }))} />
                    {hilfe && <p id={`leadsharks-${f.key}-hilfe`} className="text-xs text-muted-foreground">{hilfe}</p>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t pt-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium">Ansprechpartner</h3>
              <p className="text-xs text-muted-foreground">Wird derzeit im Portal gepflegt</p>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm [&_dd]:break-words">
              <Feld label="Name" wert={daten?.vertrag?.ansprechpartner_name} />
              <Feld label="Rolle" wert={daten?.vertrag?.ansprechpartner_rolle} />
              <Feld label="E-Mail" wert={daten?.vertrag?.ansprechpartner_email} />
              <Feld label="Telefon" wert={daten?.vertrag?.ansprechpartner_telefon} />
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* 3. Bereiche */}
      <Card>
        <CardHeader><CardTitle className="text-base">Freigeschaltete Bereiche</CardTitle></CardHeader>
        <CardContent>
          {(daten?.bereiche || []).length === 0 ? <p className="text-sm text-muted-foreground">Keine Bereiche vorhanden.</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(daten.bereiche as any[]).map(b => (
                <label key={b.module_key} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  {BEREICH_NAMEN[b.module_key] || b.module_key}
                  <Switch checked={!!bereiche[b.module_key]} onCheckedChange={c => setBereiche(s => ({ ...s, [b.module_key]: c }))} />
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Lead-Limit */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lead-Limit</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="w-40 tabular-nums" type="number" min={0} placeholder="kein Limit" value={limit} onChange={e => setLimit(e.target.value)} />
            <span className="text-sm text-muted-foreground tabular-nums">davon erhalten: {ll.global_leads_received ?? 0}</span>
            {ll.global_lead_limit_reached && <Badge variant="destructive">Limit erreicht</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">Leer oder 0 bedeutet kein Limit.</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {speicherFehler && <p className="text-sm text-destructive flex gap-1.5"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{speicherFehler}</p>}
        <Button disabled={!hatAenderungen || speichern} onClick={speichernKlick}>
          {speichern ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Änderungen speichern
        </Button>
      </div>

      {/* 5. Bestellungen */}
      <Card>
        <CardHeader><CardTitle className="text-base">Bestellungen</CardTitle></CardHeader>
        <CardContent>
          {(daten?.bestellungen || []).length === 0 ? <p className="text-sm text-muted-foreground">Keine Bestellungen.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Sparte</TableHead><TableHead className="text-right">Menge</TableHead><TableHead className="text-right">Preis/Lead</TableHead><TableHead className="text-right">Gesamt brutto</TableHead><TableHead>Status</TableHead><TableHead>Datum</TableHead></TableRow></TableHeader>
              <TableBody>
                {(daten.bestellungen as any[]).map((b, i) => (
                  <TableRow key={b.id || i}>
                    <TableCell>{b.lead_type_label || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.quantity ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(b.price_per_lead)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(b.total_gross)}</TableCell>
                    <TableCell>{b.status ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{fmtDatum(b.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 7. Leads */}
      <Card>
        <CardHeader><CardTitle className="text-base">Leads</CardTitle></CardHeader>
        <CardContent className="text-sm tabular-nums">
          {(leads.gesamt ?? 0).toLocaleString('de-DE')} Leads geliefert{leads.letzte_lieferung ? `, zuletzt am ${fmtDatum(leads.letzte_lieferung)}` : ''}
        </CardContent>
      </Card>

      </>}
      {abschnitt === 'rechnungen' && (
      {/* 6. Rechnungen */}
      <Card>
        <CardHeader><CardTitle className="text-base">Rechnungen</CardTitle></CardHeader>
        <CardContent>
          {(daten?.rechnungen || []).length === 0 ? <p className="text-sm text-muted-foreground">Keine Rechnungen.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Nummer</TableHead><TableHead>Datum</TableHead><TableHead className="text-right">Betrag</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(daten.rechnungen as any[]).map((r, i) => (
                  <TableRow key={r.id || i}>
                    <TableCell>{r.nummer || '—'}</TableCell>
                    <TableCell className="tabular-nums">{fmtDatum(r.datum)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.betrag)}</TableCell>
                    <TableCell>{r.status ?? '—'}</TableCell>
                    <TableCell>{r.file_url && <a href={r.file_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-sm">Öffnen<ExternalLink className="h-3 w-3" /></a>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      )}
      {abschnitt === 'benachrichtigungen' && <Platzhalter icon={Bell} text="Noch nicht angebunden. Die Benachrichtigungsadressen liegen im Portal und werden von der Schnittstelle noch nicht geliefert." />}
      {abschnitt === 'kennzahlen' && <Platzhalter icon={ChartNoAxesCombined} text="Noch nicht angebunden." />}
      {abschnitt === 'meta' && <Platzhalter icon={Megaphone} text="Noch nicht angebunden." />}
        </div>
      </div>

      <AlertDialog open={systemFrage} onOpenChange={setSystemFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>System ändern: {systemName(daten?.vertrag?.tier || '')} → {systemName(vertrag.tier || '')}</AlertDialogTitle>
            <AlertDialogDescription>
              Der Kunde sieht die Änderung sofort unter ‚Mein System'. Module, Kennzahlen und Vertragswerte bleiben unverändert.
              {vertrag.tier === 'kein_system' && <span className="block mt-2">Der Kunde sieht dann nur: ‚Derzeit ist kein System gebucht'.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={speichern} onClick={speichernAusfuehren}>System ändern und speichern</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={frage} onOpenChange={setFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zugang zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>Es wird ein neues Übergangspasswort erzeugt. Das bisherige Passwort des Kunden wird dabei sofort ungültig.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={zuruecksetzen}>Zurücksetzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Platzhalter({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <p>{text}</p>
      </CardContent>
    </Card>
  );
}

function Feld({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{wert || '—'}</dd>
    </div>
  );
}
