import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertTriangle, Loader2, MoreHorizontal, RotateCw, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type AktionRow = {
  client_id: string; kunde: string | null; close_opportunity_id: string | null;
  startdatum: string | null; laufzeit_monate: number | null; upsell_startdatum: string | null; upsell_laufzeit: number | null;
  vertragsende: string | null; rest: number;
};
type Opp = { id: string; name: string; status: string | null; startdatum: string | null; laufzeit: number | null; wert: number | null };

const ABGANG = [
  ['stat_PRdhsPNJcgb2ZZ13rFEkaMldqH2gvwQHWnDXnZ32qo1', 'Abgang: Laufzeit regulär beendet'],
  ['stat_lw0C84V0kcTzRAyOFc9SNgpCq4l1mJLyea5fFEcW4Hg', 'Abgang: Laufzeit abgebrochen'],
  ['stat_4fldj1q89q9hJnOCwQd7wKyPLkUS9JtVkLw5t8je9Yx', 'Abgang: Vorzeitig entlassen (durch uns)'],
  ['stat_9Oxmm9S77UPZgEnwepIlXZr30CP4ncY3OTdzyOEmfZT', 'Abgang: Insolvenz / Geschäftsaufgabe'],
  ['stat_L1fkxQFOSGFrXGY9DVdB784etCE38HyLZqMVf94ZF8m', 'Abgang: Sonderfall (außerhalb Verantwortung)'],
] as const;
export const dtDe = (d: string | null) => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '–';
export function plusMonate(iso: string, m: number) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); }
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const eur = (v: number | null) => v == null ? 'ohne Wert' : v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

async function rufen(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('close-abschluss-schreiben', { body });
  if (error) { let m: string | null = null; try { m = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignore */ } return { error: m || error.message }; }
  if (data?.error) return { error: data.error as string };
  return data as { ok?: boolean; teilfehler?: string | null; einlesen_fehler?: string | null; opps?: Opp[] };
}

export function LaufzeitAktionen({ r, onDone }: { r: AktionRow; onDone: () => Promise<void> | void }) {
  const [art, setArt] = useState<null | 'v' | 'b'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Verlängern
  const [monate, setMonate] = useState('');
  const [start, setStart] = useState('');
  const [notiz, setNotiz] = useState('');
  const [ok2, setOk2] = useState(false);
  // Beenden
  const [opps, setOpps] = useState<Opp[] | null>(null);
  const [opp, setOpp] = useState('');
  const [status, setStatus] = useState('');
  const [kd, setKd] = useState('');
  const [lv, setLv] = useState('');
  const [grund, setGrund] = useState('');

  const hatVerl = !!(r.upsell_startdatum && r.upsell_laufzeit);
  const hervor = r.rest < 30;

  const openV = async () => {
    setErr(null); setMonate(''); setStart(r.vertragsende || ''); setNotiz(''); setOk2(false); setOpp(r.close_opportunity_id || ''); setOpps(null); setArt('v');
    if (r.close_opportunity_id) return;
    const d = await rufen({ aktion: 'opps', client_id: r.client_id });
    if ('error' in d && d.error) { setErr(`Opportunities aus Close nicht geladen: ${d.error}`); setOpps([]); return; }
    const l = (d as { opps?: Opp[] }).opps || []; setOpps(l);
    if (l.length === 1) setOpp(l[0].id);
  };
  const openB = async () => {
    setErr(null); setStatus(''); setKd(heute()); setLv(r.vertragsende || ''); setGrund(''); setOpps(null); setOpp(''); setArt('b');
    const d = await rufen({ aktion: 'opps', client_id: r.client_id });
    if ('error' in d && d.error) { setErr(`Opportunities aus Close nicht geladen: ${d.error}`); setOpps([]); return; }
    const l = (d as { opps?: Opp[] }).opps || []; setOpps(l);
    if (l.length === 1) setOpp(l[0].id); else if (r.close_opportunity_id && l.some(o => o.id === r.close_opportunity_id)) setOpp(r.close_opportunity_id);
  };

  const m = Number(monate); const mOk = Number.isInteger(m) && m >= 1 && m <= 120;
  const ende = mOk && start ? plusMonate(start, m) : null;
  const vOk = mOk && !!start && (!hatVerl || ok2);
  const bOk = !!opp && !!status && !!kd && !!lv && grund.trim().length > 0;

  async function speichern() {
    setBusy(true); setErr(null);
    const d = art === 'v'
      ? await rufen({ aktion: 'verlaengern', client_id: r.client_id, close_opportunity_id: r.close_opportunity_id, startdatum: start, monate: m, notiz: notiz || null, ueberschreiben_bestaetigt: hatVerl && ok2 })
      : await rufen({ aktion: 'beenden', client_id: r.client_id, close_opportunity_id: opp, status_id: status, kuendigungsdatum: kd, letzter_vertragstag: lv, begruendung: grund.trim() });
    setBusy(false);
    if ('error' in d && d.error) { setErr(`Close hat nicht gespeichert: ${d.error}`); return; } // dialog stays open with inputs
    const res = d as { teilfehler?: string | null; einlesen_fehler?: string | null };
    if (res.teilfehler) { setErr(res.teilfehler); await onDone(); return; } // partial success: name it, no retry
    toast.success(art === 'v' ? `${r.kunde}: Verlängerung in Close gespeichert.` : `${r.kunde} wurde ausgebucht.`);
    if (res.einlesen_fehler) toast.warning(res.einlesen_fehler);
    setArt(null); await onDone();
  }
  const teilErfolg = !!err && err.startsWith('Opportunity wurde') || !!err && err.startsWith('Verlängerung wurde');

  return <>
    <span className="hidden md:inline-flex gap-1.5 shrink-0 whitespace-nowrap">
      <Button size="sm" variant={hervor ? 'default' : 'outline'} className="h-8 px-2.5 gap-1.5" disabled={busy} onClick={openV}><RotateCw className="h-3.5 w-3.5" />Verlängern</Button>
      <Button size="sm" variant="outline" className="h-8 px-2.5 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={openB}><LogOut className="h-3.5 w-3.5" />Beenden</Button>
    </span>
    <span className="md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant={hervor ? 'default' : 'ghost'} className="h-8 w-8" aria-label="Weitere Aktionen"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={busy} onClick={openV}><RotateCw className="h-3 w-3 mr-2" />Verlängern</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={openB}><LogOut className="h-3 w-3 mr-2" />Beenden</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>

    <Dialog open={art !== null} onOpenChange={o => { if (!o && !busy) setArt(null); }}>
      <DialogContent className="max-w-lg text-left">
        {art === 'v' && <>
          <DialogHeader><DialogTitle>{r.kunde}: Laufzeit verlängern</DialogTitle>
            <DialogDescription>Bisher: {dtDe(hatVerl ? r.upsell_startdatum : r.startdatum)} – {dtDe(r.vertragsende)} ({hatVerl ? r.upsell_laufzeit : r.laufzeit_monate} Mon.)</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs text-muted-foreground">Neue Laufzeit in Monaten
              <div className="flex gap-2 mt-1">
                <Input type="number" min={1} max={120} step={1} className="h-9 w-24" value={monate} onChange={e => setMonate(e.target.value)} />
                {[1, 3, 6, 12].map(n => <Button key={n} type="button" size="sm" variant={m === n ? 'default' : 'outline'} className="h-9" onClick={() => setMonate(String(n))}>{n}</Button>)}
              </div></label>
            <label className="block text-xs text-muted-foreground">Neues Startdatum<Input type="date" className="h-9 w-44 mt-1" value={start} onChange={e => setStart(e.target.value)} /></label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm tabular-nums">
              {ende ? <>Neue Laufzeit: <span className="font-semibold">{dtDe(start)} – {dtDe(ende)}</span> ({m} {m === 1 ? 'Monat' : 'Monate'})</> : <span className="text-muted-foreground">Startdatum und Monate eintragen, dann erscheint hier die neue Laufzeit.</span>}
            </div>
            <label className="block text-xs text-muted-foreground">Notiz (optional)<Textarea className="mt-1" rows={2} value={notiz} onChange={e => setNotiz(e.target.value)} /></label>
            {hatVerl && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
              <p className="flex gap-2"><AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />Für diesen Kunden ist bereits eine Verlängerung hinterlegt ({dtDe(r.upsell_startdatum)}, {r.upsell_laufzeit} Mon.). Diese Felder werden überschrieben — die bisherige Verlängerung bleibt nur als Notiz in Close erhalten.</p>
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={ok2} onCheckedChange={c => setOk2(!!c)} />Verstanden, überschreiben</label>
            </div>}
          </div>
        </>}
        {art === 'b' && <>
          <DialogHeader><DialogTitle>{r.kunde}: Kunde ausbuchen</DialogTitle><DialogDescription>Alle Felder sind Pflicht. Geschrieben wird direkt in Close.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Opportunity
              {opps === null ? <p className="text-sm mt-1 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />lädt aus Close …</p> :
                <Select value={opp} onValueChange={setOpp} disabled={opps.length <= 1}>
                  <SelectTrigger className="mt-1 h-auto min-h-9"><SelectValue placeholder={opps.length ? 'auswählen' : 'keine offene Opportunity'} /></SelectTrigger>
                  <SelectContent>{opps.map(o => <SelectItem key={o.id} value={o.id}><span className="tabular-nums">{o.name} · Start {dtDe(o.startdatum)} · {eur(o.wert)}</span></SelectItem>)}</SelectContent>
                </Select>}</label>
            <label className="block text-xs text-muted-foreground">Grund des Ausbuchens
              <Select value={status} onValueChange={setStatus}><SelectTrigger className="mt-1 h-9"><SelectValue placeholder="auswählen" /></SelectTrigger>
                <SelectContent>{ABGANG.map(([id, l]) => <SelectItem key={id} value={id}>{l}</SelectItem>)}</SelectContent></Select></label>
            <div className="flex flex-wrap gap-3">
              <label className="text-xs text-muted-foreground">Kündigungsdatum<Input type="date" className="h-9 w-44 mt-1" value={kd} onChange={e => setKd(e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Letzter Vertragstag<Input type="date" className="h-9 w-44 mt-1" value={lv} onChange={e => setLv(e.target.value)} /></label>
            </div>
            <label className="block text-xs text-muted-foreground">Abgangs-Begründung<Textarea className="mt-1" rows={3} placeholder="Was war der konkrete Anlass? Ein, zwei Sätze." value={grund} onChange={e => setGrund(e.target.value)} /></label>
            <p className="text-sm">Der Kunde verschwindet damit aus den aktiven Laufzeiten.</p>
          </div>
        </>}
        {err && <p className={cn('text-sm', teilErfolg ? 'text-foreground rounded-md border border-destructive/40 p-2' : 'text-destructive')}>{err}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setArt(null)}>{teilErfolg ? 'Schließen' : 'Abbrechen'}</Button>
          {!teilErfolg && (art === 'v'
            ? <Button disabled={busy || !vOk} onClick={speichern}>{busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Verlängerung speichern</Button>
            : <Button variant="destructive" disabled={busy || !bOk} onClick={speichern}>{busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Kunde ausbuchen</Button>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
