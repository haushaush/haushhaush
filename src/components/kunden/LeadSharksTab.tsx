import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertCircle, AlertTriangle, Copy, ExternalLink, KeyRound, Loader2, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PORTAL_URL, erzeugePasswort, portalEinstellungen, portalEinstellungenSetzen, portalZugangZuruecksetzen } from '@/lib/kundenVerknuepfungen';

const BEREICH_NAMEN: Record<string, string> = {
  benchmark: 'Marktradar', compliance: 'Compliance', contracts: 'Verträge', kennzahlen: 'Kennzahlen', outreach: 'Outreach',
};

const VERTRAG_FELDER: { key: string; label: string; typ: 'text' | 'number' | 'date' }[] = [
  { key: 'tier', label: 'Tier', typ: 'text' },
  { key: 'betreuung_monate', label: 'Betreuungsmonate', typ: 'number' },
  { key: 'start_date', label: 'Startdatum', typ: 'date' },
  { key: 'live_date', label: 'Live-Datum', typ: 'date' },
  { key: 'verlaengerung_monate', label: 'Verlängerungsmonate', typ: 'number' },
  { key: 'garantie_menge', label: 'Garantiemenge', typ: 'number' },
  { key: 'budget_guthaben', label: 'Budget-Guthaben', typ: 'number' },
  { key: 'budget_empfohlen', label: 'Budget-Empfehlung', typ: 'number' },
];

function fehlerText(code: unknown): string {
  const c = String(code || '');
  const m: Record<string, string> = {
    profile_not_found: 'Das verknüpfte Portalkonto existiert nicht mehr. Die Verknüpfung zeigt ins Leere – bitte im Tab „Verknüpfungen" lösen und neu setzen.',
    tier_required: 'Bitte ein Tier angeben – ohne Tier kann kein Vertrag angelegt werden.',
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

  const initVertrag = (v: any) => Object.fromEntries(VERTRAG_FELDER.map(f => [f.key, v ? zuText(v[f.key]) : '']));
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
    if (VERTRAG_FELDER.some(f => v0[f.key] !== vertrag[f.key])) {
      out.vertrag = Object.fromEntries(VERTRAG_FELDER.map(f => {
        const s = (vertrag[f.key] ?? '').trim();
        return [f.key, s === '' ? null : f.typ === 'number' ? Number(s.replace(',', '.')) : s];
      }));
    }
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
    if (aenderungen.vertrag && !daten.vertrag && !(vertrag.tier || '').trim()) { setSpeicherFehler(fehlerText('tier_required')); return; }
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
  const ansprechpartner = [k.first_name, k.last_name].filter(Boolean).join(' ') || '—';

  return (
    <div className="space-y-4">
      {kopf}

      {/* 1. Konto */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Konto</CardTitle>
          <Button size="sm" variant="outline" disabled={reset} onClick={() => setFrage(true)}>
            {reset ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <KeyRound className="h-3.5 w-3.5 mr-1" />}Zugang zurücksetzen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <Feld label="E-Mail" wert={k.email} />
            <Feld label="Firma" wert={k.company_name} />
            <Feld label="Ansprechpartner" wert={ansprechpartner} />
            <Feld label="Telefon" wert={k.phone} />
            <Feld label="Status" wert={<Badge variant={k.is_active === false ? 'secondary' : 'outline'}>{k.is_active === false ? 'inaktiv' : 'aktiv'}</Badge>} />
            <Feld label="Angelegt am" wert={fmtDatum(k.created_at)} />
          </dl>
          {k.passwort_wechsel_noetig && (abgelaufen
            ? <p className="flex gap-1.5 text-destructive font-medium"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />Zugang abgelaufen</p>
            : <p className="flex gap-1.5 font-medium text-amber-600 dark:text-amber-400"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Passwortwechsel offen{ablauf ? `, Übergangspasswort läuft am ${fmtDatum(ablauf)} um ${fmtZeit(ablauf)} ab` : ''}
              </p>)}
          {neuesPw && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-muted px-2 py-1 rounded">{neuesPw}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(neuesPw).then(() => toast.success('Passwort kopiert'))}><Copy className="h-3.5 w-3.5 mr-1" />Kopieren</Button>
              </div>
              <p className="text-xs text-muted-foreground flex gap-1.5"><ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />Dieses Passwort wird nur jetzt angezeigt. Der Kunde muss es bei der ersten Anmeldung ändern, es verfällt nach 7 Tagen.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Vertrag */}
      <Card>
        <CardHeader><CardTitle className="text-base">Vertrag</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!daten?.vertrag && <p className="text-sm text-muted-foreground">Noch kein Vertrag hinterlegt.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {VERTRAG_FELDER.map(f => (
              <label key={f.key} className="space-y-1">
                <span className="text-xs text-muted-foreground">{f.label}{f.key === 'tier' && !daten?.vertrag ? ' *' : ''}</span>
                <Input type={f.typ} inputMode={f.typ === 'number' ? 'decimal' : undefined} value={vertrag[f.key] ?? ''}
                  onChange={e => setVertrag(v => ({ ...v, [f.key]: e.target.value }))} />
              </label>
            ))}
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

      {/* 7. Leads */}
      <Card>
        <CardHeader><CardTitle className="text-base">Leads</CardTitle></CardHeader>
        <CardContent className="text-sm tabular-nums">
          {(leads.gesamt ?? 0).toLocaleString('de-DE')} Leads geliefert{leads.letzte_lieferung ? `, zuletzt am ${fmtDatum(leads.letzte_lieferung)}` : ''}
        </CardContent>
      </Card>

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

function Feld({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{wert || '—'}</dd>
    </div>
  );
}
