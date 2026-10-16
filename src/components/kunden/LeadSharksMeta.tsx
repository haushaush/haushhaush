// Abschnitt „Meta" im LeadSharks-Tab: Kampagnen/Formulare des Portals anzeigen, steuern und zuweisen.
// Alle Aufrufe laufen über portal-bruecke (meta_get, meta_katalog, meta_anlegen, meta_steuern).
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertCircle, AlertTriangle, Check, Loader2, Megaphone, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { portalMeta } from '@/lib/kundenVerknuepfungen';

type Kampagne = Record<string, any>;
type Formular = Record<string, any>;
type LeadTyp = { id: string; name: string } & Record<string, any>;

function fehlerMeldung(r: any): string {
  const c = String(r?.error || '');
  if (c === 'profile_not_found') return 'Das verknüpfte Portalkonto existiert nicht mehr.';
  if (c === 'invalid_action') return 'Diese Aktion wird von der Portal-Schnittstelle nicht unterstützt.';
  if (/fetch|network|failed to send/i.test(c)) return 'Das Portal ist gerade nicht erreichbar. Bitte später erneut versuchen.';
  return r?.detail ? `Das Portal hat einen Fehler gemeldet: ${r.detail}` : 'Das Portal hat einen Fehler gemeldet. Bitte später erneut versuchen.';
}

const fmtDatum = (v?: string | null) => (v ? new Date(v).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
function relativ(v?: string | null): string {
  if (!v) return 'noch nie';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  const m = Math.round(s / 60); if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60); if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24); return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}
const fmtEur = (v: unknown) => (v == null || v === '' ? '—' : Number(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));

export function LeadSharksMeta({ profileId }: { profileId: string }) {
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kampagnen, setKampagnen] = useState<Kampagne[]>([]);
  const [formulare, setFormulare] = useState<Formular[]>([]);
  const [leadTypen, setLeadTypen] = useState<LeadTyp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reakt, setReakt] = useState<{ form: Formular; body: Record<string, unknown>; text: string } | null>(null);
  const [assistent, setAssistent] = useState(false);
  const [zuordnung, setZuordnung] = useState<any[] | null>(null);

  const neuLaden = useCallback(async () => {
    setFehler(null);
    try {
      const r = await portalMeta('meta_get', { profile_id: profileId });
      if (!r?.ok) { setFehler(fehlerMeldung(r)); return; }
      setKampagnen(r.kampagnen || []); setFormulare(r.formulare || []); setLeadTypen(r.lead_typen || []);
    } catch (e: any) { setFehler(fehlerMeldung({ error: e?.message })); }
    finally { setLaden(false); }
  }, [profileId]);
  useEffect(() => { setLaden(true); neuLaden(); }, [neuLaden]);

  async function steuern(key: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(key);
    try {
      const r = await portalMeta('meta_steuern', { profile_id: profileId, ...body });
      if (!r?.ok) { toast.error(fehlerMeldung(r)); return false; }
      toast.success('Gespeichert');
      await neuLaden();
      return true;
    } catch (e: any) { toast.error(fehlerMeldung({ error: e?.message })); return false; }
    finally { setBusy(null); }
  }

  // Weitere Formulare derselben Meta-Kampagne (ohne das betroffene Formular).
  function weitereFormulare(form: Formular): number {
    const k = kampagnen.find(x => x.id === form.customer_campaign_id);
    const metaId = k?.meta_campaign_id;
    const kIds = new Set(kampagnen.filter(x => (metaId ? x.meta_campaign_id === metaId : x.id === k?.id)).map(x => x.id));
    return formulare.filter(f => f.id !== form.id && kIds.has(f.customer_campaign_id)).length;
  }
  function reaktivierenFragen(form: Formular, body: Record<string, unknown>, text: string) {
    setReakt({ form, body, text });
  }

  if (laden) return <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Meta-Kampagnen und Formulare, aus denen das Portal Leads für diesen Kunden abruft.</p>
        <Button size="sm" onClick={() => setAssistent(true)} disabled={!!fehler}><Plus className="h-4 w-4 mr-1.5" />Kampagne zuweisen</Button>
      </div>

      {fehler && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{fehler}</span>
        </div>
      )}

      {zuordnung && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between"><CardTitle className="text-sm">Erkannte Felder der neuen Formulare</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setZuordnung(null)}>Ausblenden</Button></CardHeader>
          <CardContent className="space-y-2">
            {zuordnung.length === 0 && <p className="text-sm text-muted-foreground">Keine Formulare angelegt.</p>}
            {zuordnung.map((z, i) => {
              const erkannt: string[] = Array.isArray(z?.erkannt) ? z.erkannt : [];
              return (
                <div key={z?.meta_form_id || i} className={cn('rounded-lg border p-3 text-sm', erkannt.length === 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border')}>
                  <p className="font-medium">{z?.meta_form_name || z?.form_name || z?.meta_form_id || `Formular ${i + 1}`}</p>
                  {erkannt.length === 0
                    ? <p className="mt-1 flex items-start gap-1.5 text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />Keine Kernfelder erkannt – hier kommen Leads ohne Name, E-Mail und Telefon an.</p>
                    : <div className="mt-1.5 flex flex-wrap gap-1.5">{erkannt.map(e => <Badge key={e} variant="secondary">{e}</Badge>)}</div>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!fehler && kampagnen.length === 0 && (
        <Card><CardContent className="py-10 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <Megaphone className="h-6 w-6" />Diesem Kunden ist noch keine Meta-Kampagne zugewiesen.
        </CardContent></Card>
      )}

      {kampagnen.map(k => (
        <Card key={k.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{k.name || k.meta_campaign_name || 'Kampagne'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Werbekonto: {k.meta_ad_account_name || '—'} · Meta-Kampagne: {k.meta_campaign_name || '—'}</p>
              </div>
              <label className="flex items-center gap-2 text-sm shrink-0">Aktiv
                <Switch checked={!!k.is_active} disabled={busy === `k${k.id}`} onCheckedChange={v => steuern(`k${k.id}`, { was: 'kampagne_aktiv', campaign_id: k.id, aktiv: v })} />
              </label>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-2">
              <span>Lead-Abruf ab: <span className="text-foreground tabular-nums">{fmtDatum(k.polling_start_date)}</span></span>
              <span>Letzter Abruf: <span className="text-foreground" title={fmtDatum(k.last_polled_at)}>{relativ(k.last_polled_at)}</span></span>
            </div>
            {k.last_error && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Abruffehler ({k.error_count ?? 0}×): {String(k.last_error)}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {formulare.filter(f => f.customer_campaign_id === k.id).length === 0 && <p className="text-sm text-muted-foreground">Keine Formulare – es werden keine Leads abgerufen.</p>}
            {formulare.filter(f => f.customer_campaign_id === k.id).map(f => (
              <FormularZeile key={f.id} f={f} busy={busy} steuern={steuern} reaktivierenFragen={reaktivierenFragen} />
            ))}
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!reakt} onOpenChange={o => { if (!o && !busy) setReakt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meta-Kampagne wieder aktivieren?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{reakt?.text}</p>
                <p className="font-medium text-destructive">Achtung: Reaktivieren setzt die gesamte Meta-Kampagne auf ACTIVE, nicht nur dieses Formular. Alle anderen Formulare derselben Meta-Kampagne laufen damit ebenfalls wieder.</p>
                <p>Davon betroffen: {reakt ? weitereFormulare(reakt.form) : 0} weitere{reakt && weitereFormulare(reakt.form) === 1 ? 's' : ''} Formular{reakt && weitereFormulare(reakt.form) === 1 ? '' : 'e'}.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={async e => { e.preventDefault(); if (!reakt) return; const ok = await steuern(`r${reakt.form.id}`, reakt.body); if (ok) setReakt(null); }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ja, Kampagne reaktivieren'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {assistent && (
        <ZuweisenAssistent profileId={profileId} leadTypen={leadTypen}
          onClose={() => setAssistent(false)}
          onErfolg={async r => { setAssistent(false); setZuordnung(Array.isArray(r?.zuordnung) ? r.zuordnung : []); toast.success('Kampagne angelegt'); await neuLaden(); }} />
      )}
    </div>
  );
}

function FormularZeile({ f, busy, steuern, reaktivierenFragen }: {
  f: Formular; busy: string | null;
  steuern: (key: string, body: Record<string, unknown>) => Promise<boolean>;
  reaktivierenFragen: (form: Formular, body: Record<string, unknown>, text: string) => void;
}) {
  const [lead, setLead] = useState(f.lead_limit == null ? '' : String(f.lead_limit));
  const [spend, setSpend] = useState(f.spend_limit == null ? '' : String(f.spend_limit));
  const [leadReakt, setLeadReakt] = useState(false);
  const [spendReakt, setSpendReakt] = useState(false);
  useEffect(() => { setLead(f.lead_limit == null ? '' : String(f.lead_limit)); setSpend(f.spend_limit == null ? '' : String(f.spend_limit)); }, [f.lead_limit, f.spend_limit]);

  const leadZahl = (): number | null | 'ungueltig' => {
    const t = lead.trim(); if (t === '') return null;
    const n = Number(t); return Number.isInteger(n) && n >= 0 ? n : 'ungueltig';
  };
  const spendZahl = (): number | null | 'ungueltig' => {
    const t = spend.trim().replace(',', '.'); if (t === '') return null;
    const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : 'ungueltig';
  };

  function leadSpeichern() {
    const n = leadZahl();
    if (n === 'ungueltig') { toast.error('Das Lead-Limit muss eine ganze Zahl sein (oder leer für kein Limit).'); return; }
    const body = { was: 'lead_limit', form_id: f.id, lead_limit: n, reactivate: leadReakt };
    if (leadReakt) reaktivierenFragen(f, body, 'Das Lead-Limit wird gespeichert und die Kampagne wieder aktiviert.');
    else steuern(`l${f.id}`, body).then(ok => ok && setLeadReakt(false));
  }
  function spendSpeichern() {
    const n = spendZahl();
    if (n === 'ungueltig') { toast.error('Das Ausgaben-Limit muss eine Zahl sein (oder leer für kein Limit).'); return; }
    const body = { was: 'ausgaben_limit', form_id: f.id, spend_limit: n, reactivate: spendReakt };
    if (spendReakt) reaktivierenFragen(f, body, 'Das Ausgaben-Limit wird gespeichert und die Kampagne wieder aktiviert.');
    else steuern(`s${f.id}`, body).then(ok => ok && setSpendReakt(false));
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{f.meta_form_name || f.name || f.meta_form_id || 'Formular'}</p>
          <p className="text-xs text-muted-foreground">Sparte: {f.lead_type_label || '—'}</p>
        </div>
        <label className="flex items-center gap-2 text-sm shrink-0">Aktiv
          <Switch checked={!!f.is_active} disabled={busy === `f${f.id}`} onCheckedChange={v => steuern(`f${f.id}`, { was: 'formular_aktiv', form_id: f.id, aktiv: v })} />
        </label>
      </div>

      {f.lead_limit_reached && (
        <Pausiert text={`Lead-Limit erreicht – pausiert seit ${fmtDatum(f.lead_limit_paused_at)}`}
          onClick={() => reaktivierenFragen(f, { was: 'lead_limit_reaktivieren', form_id: f.id }, 'Das Formular wurde wegen des erreichten Lead-Limits pausiert.')} />
      )}
      {f.spend_limit_reached && (
        <Pausiert text={`Ausgaben-Limit erreicht – pausiert seit ${fmtDatum(f.spend_limit_paused_at)}`}
          onClick={() => reaktivierenFragen(f, { was: 'ausgaben_limit_reaktivieren', form_id: f.id }, 'Das Formular wurde wegen des erreichten Ausgaben-Limits pausiert.')} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Lead-Limit (leer = kein Limit)</p>
          <div className="flex gap-2">
            <Input type="number" min={0} step={1} inputMode="numeric" value={lead} onChange={e => setLead(e.target.value)} className="h-9 tabular-nums" placeholder="kein Limit" />
            <Button size="sm" variant="outline" disabled={busy === `l${f.id}`} onClick={leadSpeichern}>{busy === `l${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Speichern'}</Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={leadReakt} onCheckedChange={v => setLeadReakt(!!v)} />auch reaktivieren</label>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Ausgaben-Limit in € (leer = kein Limit) · verbraucht: <span className="tabular-nums text-foreground">{fmtEur(f.spend_current)}</span></p>
          <div className="flex gap-2">
            <Input type="number" min={0} step="0.01" inputMode="decimal" value={spend} onChange={e => setSpend(e.target.value)} className="h-9 tabular-nums" placeholder="kein Limit" />
            <Button size="sm" variant="outline" disabled={busy === `s${f.id}`} onClick={spendSpeichern}>{busy === `s${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Speichern'}</Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={spendReakt} onCheckedChange={v => setSpendReakt(!!v)} />auch reaktivieren</label>
        </div>
      </div>
    </div>
  );
}

function Pausiert({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm">
      <span className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-warning shrink-0" />{text}</span>
      <Button size="sm" variant="outline" onClick={onClick}>Reaktivieren</Button>
    </div>
  );
}

function Kachel({ aktiv, onClick, titel, unter }: { aktiv: boolean; onClick: () => void; titel: string; unter?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('relative w-full text-left rounded-xl border p-4 min-h-[76px] transition-colors',
        aktiv ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50')}>
      {aktiv && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
      <p className="text-sm font-medium pr-6 break-words">{titel}</p>
      {unter && <p className="text-xs text-muted-foreground mt-1 break-all">{unter}</p>}
    </button>
  );
}

type Zustand = 'bearbeiten' | 'senden' | 'unklar';

function ZuweisenAssistent({ profileId, leadTypen, onClose, onErfolg }: {
  profileId: string; leadTypen: LeadTyp[]; onClose: () => void; onErfolg: (r: any) => void;
}) {
  // p_id einmal je Assistent – wird nie geändert, auch nicht bei Wiederholung.
  const [pId] = useState(() => crypto.randomUUID());
  const [eingefroren, setEingefroren] = useState<Record<string, unknown> | null>(null);
  const [zustand, setZustand] = useState<Zustand>('bearbeiten');
  const [meldung, setMeldung] = useState<string | null>(null);

  const [schritt, setSchritt] = useState(1);
  const [kLaden, setKLaden] = useState(false);
  const [kFehler, setKFehler] = useState<string | null>(null);
  const [konten, setKonten] = useState<any[]>([]);
  const [mKampagnen, setMKampagnen] = useState<any[]>([]);
  const [mFormulare, setMFormulare] = useState<any[]>([]);
  const [konto, setKonto] = useState<any | null>(null);
  const [kampagne, setKampagne] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [abrufAb, setAbrufAb] = useState('');
  const [auswahl, setAuswahl] = useState<Record<string, string>>({}); // meta_form_id -> lead_type_id
  const [ohneFormular, setOhneFormular] = useState(false);

  const katalog = useCallback(async (body: Record<string, unknown>, ziel: (r: any) => void) => {
    setKLaden(true); setKFehler(null);
    try {
      const r = await portalMeta('meta_katalog', { profile_id: profileId, ...body });
      if (!r?.ok) { setKFehler(fehlerMeldung(r)); return; }
      ziel(r);
    } catch (e: any) { setKFehler(fehlerMeldung({ error: e?.message })); }
    finally { setKLaden(false); }
  }, [profileId]);

  useEffect(() => { katalog({ schritt: 'konten' }, r => setKonten(r.konten || [])); }, [katalog]);

  const gesperrt = eingefroren !== null;

  function weiter() {
    if (schritt === 1 && konto) {
      setKampagne(null); setMKampagnen([]);
      katalog({ schritt: 'kampagnen', ad_account_id: konto.id }, r => setMKampagnen(r.kampagnen || []));
      setSchritt(2);
    } else if (schritt === 2 && kampagne) {
      setAuswahl({}); setOhneFormular(false); setMFormulare([]);
      katalog({ schritt: 'formulare', campaign_id: kampagne.id }, r => setMFormulare(r.formulare || []));
      setSchritt(3);
    }
  }

  const ausgewaehlt = Object.keys(auswahl);
  const spartenFehlen = ausgewaehlt.some(id => !auswahl[id]);
  const keineFormulare = !kLaden && !kFehler && mFormulare.length === 0;
  const kannAnlegen = schritt === 3 && !kLaden && !kFehler && name.trim().length > 0 && name.length <= 500 &&
    (keineFormulare ? ohneFormular : ausgewaehlt.length > 0 && !spartenFehlen);

  function datensatzBauen(): Record<string, unknown> {
    const p_forms = mFormulare.filter(f => auswahl[f.id]).map(f => {
      const typ = leadTypen.find(t => String(t.id) === auswahl[f.id])!;
      return { meta_form_id: f.id, meta_form_name: f.name, lead_type_label: typ.name, lead_type_id: typ.id, provided_fields: f.provided_fields };
    });
    return {
      profile_id: profileId, p_id: pId, p_name: name.trim(),
      p_account_id: konto.id, p_account_name: konto.name,
      p_campaign_id: kampagne.id, p_campaign_name: kampagne.name,
      p_polling_start: abrufAb ? new Date(abrufAb).toISOString() : null,
      p_forms, p_confirm_no_forms: p_forms.length === 0 && ohneFormular,
    };
  }

  async function absenden(datensatz: Record<string, unknown>) {
    setZustand('senden'); setMeldung(null);
    let r: any;
    try { r = await portalMeta('meta_anlegen', datensatz); }
    catch { r = { error: 'meta_unklar' }; } // Verbindungsabbruch: Zustand unbekannt
    if (r?.ok) { onErfolg(r); return; }
    if (r?.error === 'meta_abgelehnt') {
      setEingefroren(null); setZustand('bearbeiten');
      setMeldung(`Nicht angelegt. Bitte erneut versuchen.${r.detail ? ` (${r.detail})` : ''}`);
      return;
    }
    if (r?.error === 'meta_unklar' || !r || r?.error == null) {
      setZustand('unklar');
      setMeldung('Die Speicherbestätigung fehlt. Bitte den Abschluss erneut prüfen; es wird keine zweite Kampagne angelegt.');
      return;
    }
    // Sonstige Fehler: unklar behandeln, damit keine zweite Kampagne entstehen kann.
    setZustand('unklar');
    setMeldung('Die Speicherbestätigung fehlt. Bitte den Abschluss erneut prüfen; es wird keine zweite Kampagne angelegt.');
  }

  function anlegen() {
    const d = eingefroren ?? datensatzBauen();
    if (!eingefroren) setEingefroren(d);
    absenden(d);
  }

  const schliessbar = zustand === 'bearbeiten';

  return (
    <Dialog open onOpenChange={o => { if (!o && schliessbar) onClose(); }}>
      <DialogContent className={cn('max-w-2xl max-h-[90vh] overflow-y-auto', !schliessbar && '[&>button]:hidden')}
        onEscapeKeyDown={e => { if (!schliessbar) e.preventDefault(); }}
        onPointerDownOutside={e => { if (!schliessbar) e.preventDefault(); }}
        onInteractOutside={e => { if (!schliessbar) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Kampagne zuweisen</DialogTitle>
          <DialogDescription>Schritt {schritt} von 3 · {schritt === 1 ? 'Werbekonto' : schritt === 2 ? 'Kampagne' : 'Formulare'}</DialogDescription>
        </DialogHeader>

        {zustand === 'unklar' ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" /><span>{meldung}</span>
          </div>
        ) : (
          <div className={cn('space-y-4', gesperrt && 'pointer-events-none opacity-60')}>
            {kFehler && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{kFehler}</div>}
            {kLaden && <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[76px] rounded-xl" />)}</div>}

            {!kLaden && schritt === 1 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {konten.length === 0 && !kFehler && <p className="text-sm text-muted-foreground">Keine Werbekonten gefunden.</p>}
                {konten.map(k => <Kachel key={k.id} aktiv={konto?.id === k.id} onClick={() => setKonto(k)} titel={k.name || k.id} unter={k.id} />)}
              </div>
            )}

            {!kLaden && schritt === 2 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {mKampagnen.length === 0 && !kFehler && <p className="text-sm text-muted-foreground">Keine Kampagnen in diesem Werbekonto.</p>}
                  {mKampagnen.map(c => <Kachel key={c.id} aktiv={kampagne?.id === c.id} onClick={() => { setKampagne(c); setName(String(c.name || '').slice(0, 500)); }} titel={c.name || c.id} unter={c.status || c.effective_status || ''} />)}
                </div>
                {kampagne && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Kampagnenname</p>
                      <Input value={name} maxLength={500} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Lead-Abruf ab (optional, leer = ab jetzt)</p>
                      <Input type="datetime-local" value={abrufAb} onChange={e => setAbrufAb(e.target.value)} />
                    </div>
                  </div>
                )}
              </>
            )}

            {!kLaden && schritt === 3 && (
              <>
                {keineFormulare ? (
                  <button type="button" onClick={() => setOhneFormular(v => !v)}
                    className={cn('w-full text-left rounded-xl border p-4 transition-colors', ohneFormular ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-warning/40 bg-warning/10')}>
                    <p className="text-sm font-medium flex items-center gap-2">{ohneFormular ? <Check className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                      Meta liefert für diese Kampagne keine Formulare.</p>
                    <p className="text-xs text-muted-foreground mt-1">Trotzdem ohne Formular anlegen – es werden keine Leads abgerufen. (Zum Bestätigen anklicken)</p>
                  </button>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {mFormulare.map(f => {
                      const an = f.id in auswahl;
                      return (
                        <div key={f.id} className="space-y-2">
                          <Kachel aktiv={an} titel={f.name || f.id} unter={Array.isArray(f.provided_fields) ? `${f.provided_fields.length} Felder` : undefined}
                            onClick={() => setAuswahl(p => { const n = { ...p }; if (an) delete n[f.id]; else n[f.id] = ''; return n; })} />
                          {an && (
                            <Select value={auswahl[f.id] || undefined} onValueChange={v => setAuswahl(p => ({ ...p, [f.id]: v }))}>
                              <SelectTrigger className={cn('h-9', !auswahl[f.id] && 'border-destructive')}><SelectValue placeholder="Sparte wählen (Pflicht)" /></SelectTrigger>
                              <SelectContent>
                                {leadTypen.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {spartenFehlen && <p className="text-xs text-destructive">Jedes ausgewählte Formular braucht eine Sparte.</p>}
              </>
            )}
          </div>
        )}

        {meldung && zustand === 'bearbeiten' && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{meldung}</div>
        )}

        <DialogFooter className="gap-2">
          {zustand === 'unklar' || (zustand === 'senden' && eingefroren && meldung) ? (
            <Button onClick={() => eingefroren && absenden(eingefroren)} disabled={zustand === 'senden'}>
              {zustand === 'senden' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Abschluss erneut prüfen
            </Button>
          ) : (
            <>
              {schritt > 1 && <Button variant="outline" disabled={zustand !== 'bearbeiten'} onClick={() => setSchritt(s => s - 1)}>Zurück</Button>}
              <Button variant="ghost" disabled={zustand !== 'bearbeiten'} onClick={onClose}>Abbrechen</Button>
              {schritt < 3
                ? <Button disabled={kLaden || (schritt === 1 ? !konto : !kampagne || !name.trim())} onClick={weiter}>Weiter</Button>
                : <Button disabled={!kannAnlegen || zustand !== 'bearbeiten'} onClick={anlegen}>
                    {zustand === 'senden' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Anlegen
                  </Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
