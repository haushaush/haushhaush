import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ExternalLink, Pencil, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  client_id: string; kunde: string | null; close_lead_id: string | null; close_status_label: string | null; close_opportunity_id: string | null;
  startdatum: string | null; laufzeit_monate: number | null; vertragsende: string | null; fehlt: string[];
};
type Log = { id: string; created_at: string; user_email: string | null; kunde: string | null; aktion: string; werte: Record<string, unknown>; fehler: string | null; close_opportunity_id: string | null };
type Form = { startdatum: string; laufzeit_monate: string; abschlusswert: string; retainer_monat: string };
const dt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const empty: Form = { startdatum: '', laufzeit_monate: '', abschlusswert: '', retainer_monat: '' };
// Same formula as the server (startdatum + months), only a preview — the saved value always comes back from Close.
function vorschau(f: Form, r: Row) {
  const s = f.startdatum || r.startdatum; const m = f.laufzeit_monate ? Number(f.laufzeit_monate) : r.laufzeit_monate;
  if (!s || !m || !Number.isInteger(m) || m < 1) return null;
  const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10);
}
const toNum = (v: string) => v.trim() === '' ? null : Number(v.replace(',', '.'));

export default function KundenLaufzeiten() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [rows, setRows] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: l }] = await Promise.all([
      supabase.from('kunden_laufzeit_stand').select('client_id, kunde, close_lead_id, close_status_label, close_opportunity_id, startdatum, laufzeit_monate, vertragsende, fehlt'),
      supabase.from('close_abschluss_schreiblog').select('id, created_at, user_email, kunde, aktion, werte, fehler, close_opportunity_id').order('created_at', { ascending: false }).limit(20),
    ]);
    setRows((data as Row[]) || []); setLogs((l as Log[]) || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const klar = useMemo(() => rows.filter(r => r.vertragsende)
    .map(r => ({ ...r, rest: Math.ceil((new Date(r.vertragsende!).getTime() - today.getTime()) / 86400000) }))
    .sort((a, b) => a.rest - b.rest), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const unklar = rows.filter(r => !r.vertragsende).sort((a, b) => (a.kunde || '').localeCompare(b.kunde || ''));

  const form = (id: string) => forms[id] || empty;
  const setF = (id: string, k: keyof Form, v: string) => setForms(p => ({ ...p, [id]: { ...form(id), [k]: v } }));

  async function save(r: Row, bestaetigt = false) {
    const f = form(r.client_id);
    const body = {
      client_id: r.client_id, close_opportunity_id: r.close_opportunity_id,
      startdatum: f.startdatum || null, laufzeit_monate: toNum(f.laufzeit_monate),
      abschlusswert: toNum(f.abschlusswert), retainer_monat: toNum(f.retainer_monat), anlegen_bestaetigt: bestaetigt,
    };
    if (!body.startdatum && body.laufzeit_monate == null && body.abschlusswert == null && body.retainer_monat == null) {
      setErrors(p => ({ ...p, [r.client_id]: 'Bitte mindestens ein Feld ausfüllen.' })); return;
    }
    if (!r.close_opportunity_id && !bestaetigt) { setConfirm(r); return; }
    setSaving(r.client_id); setErrors(p => ({ ...p, [r.client_id]: '' }));
    const { data, error } = await supabase.functions.invoke('close-abschluss-schreiben', { body });
    let msg: string | null = null;
    if (error) { try { msg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignore */ } msg = msg || error.message; }
    else if (data?.error) msg = data.error;
    setSaving(null);
    if (msg) { setErrors(p => ({ ...p, [r.client_id]: `Close hat nicht gespeichert: ${msg}` })); await load(); return; }
    toast.success(`${r.kunde}: Abschluss in Close ${data.aktion}, Werte neu aus Close eingelesen.`);
    setForms(p => { const n = { ...p }; delete n[r.client_id]; return n; }); setEditing(null);
    await load();
  }

  const fields = (r: Row) => {
    const f = form(r.client_id); const end = vorschau(f, r); const busy = saving === r.client_id;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-muted-foreground">Startdatum<Input type="date" className="h-8 w-36" value={f.startdatum} placeholder={r.startdatum || ''} onChange={e => setF(r.client_id, 'startdatum', e.target.value)} /></label>
          <label className="text-[11px] text-muted-foreground">Laufzeit (Mon.)<Input type="number" min={1} max={120} step={1} className="h-8 w-24" value={f.laufzeit_monate} placeholder={r.laufzeit_monate?.toString() || ''} onChange={e => setF(r.client_id, 'laufzeit_monate', e.target.value)} /></label>
          <label className="text-[11px] text-muted-foreground">Abschlusswert €<Input type="number" min={0} className="h-8 w-28" value={f.abschlusswert} placeholder="optional" onChange={e => setF(r.client_id, 'abschlusswert', e.target.value)} /></label>
          <label className="text-[11px] text-muted-foreground">Retainer/Monat €<Input type="number" min={0} className="h-8 w-28" value={f.retainer_monat} placeholder="optional" onChange={e => setF(r.client_id, 'retainer_monat', e.target.value)} /></label>
          <Button size="sm" className="h-8" disabled={busy} onClick={() => save(r)}>{busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Speichern</Button>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">Vertragsende: {end ? dt(end) : 'Startdatum und Laufzeit nötig'}{!r.close_opportunity_id && ' · legt in Close einen gewonnenen Abschluss an'}</p>
        {errors[r.client_id] && <p className="text-xs text-destructive">{errors[r.client_id]}</p>}
      </div>
    );
  };
  const closeLink = (r: Row) => r.close_lead_id && <a href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">Close <ExternalLink className="h-3 w-3" /></a>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Laufzeiten</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Aktive Kunden laut Close („Aktueller Klient“, „Pausiert“). Eingaben werden direkt in Close gespeichert und danach neu aus Close eingelesen.</p>
      </div>
      {loading ? <Skeleton className="h-40" /> : <>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Aktive Kunden mit Laufzeit ({klar.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Kunde</TableHead><TableHead>Start</TableHead><TableHead>Laufzeit</TableHead><TableHead>Vertragsende</TableHead><TableHead className="text-right">Restlaufzeit</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {klar.map(r => editing === r.client_id ? (
                  <TableRow key={r.client_id}><TableCell className="font-medium align-top pt-4">{r.kunde}</TableCell><TableCell colSpan={4}>{fields(r)}</TableCell>
                    <TableCell className="align-top"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></TableCell></TableRow>
                ) : (
                  <TableRow key={r.client_id}>
                    <TableCell className="font-medium">{r.kunde}</TableCell>
                    <TableCell className="tabular-nums">{dt(r.startdatum)}</TableCell>
                    <TableCell className="tabular-nums">{r.laufzeit_monate} Mon.</TableCell>
                    <TableCell className="tabular-nums">{dt(r.vertragsende)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rest} Tage {r.rest < 30 && <Badge variant="destructive" className="ml-2">unter 30 Tage</Badge>}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{isAdmin && <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(r.client_id)}><Pencil className="h-3 w-3 mr-1" />Bearbeiten</Button>}{closeLink(r)}</TableCell>
                  </TableRow>
                ))}
                {!klar.length && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Noch kein aktiver Kunde mit vollständiger Laufzeit.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Laufzeit unklar ({unklar.length})</CardTitle>
            <p className="text-xs text-muted-foreground">Hier wird nichts geschätzt. {isAdmin ? 'Werte eintragen und je Zeile speichern – geschrieben wird nach Close.' : 'Nachtragen können Admins.'}</p></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Kunde</TableHead><TableHead>Was fehlt</TableHead>{isAdmin && <TableHead>Nachtragen</TableHead>}<TableHead /></TableRow></TableHeader>
              <TableBody>
                {unklar.map(r => (
                  <TableRow key={r.client_id}>
                    <TableCell className="font-medium align-top pt-4">{r.kunde}</TableCell>
                    <TableCell className="text-sm text-muted-foreground align-top pt-4">{r.fehlt.join(', ')}</TableCell>
                    {isAdmin && <TableCell>{fields(r)}</TableCell>}
                    <TableCell className="align-top pt-4">{closeLink(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {isAdmin && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Schreibprotokoll Close (letzte 20)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Zeitpunkt</TableHead><TableHead>Wer</TableHead><TableHead>Kunde</TableHead><TableHead>Aktion</TableHead><TableHead>Werte</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="tabular-nums text-xs">{new Date(l.created_at).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="text-xs">{l.user_email}</TableCell>
                    <TableCell className="text-xs">{l.kunde}</TableCell>
                    <TableCell><Badge variant={l.aktion === 'fehlgeschlagen' ? 'destructive' : 'outline'}>{l.aktion}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{Object.entries(l.werte || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}{l.fehler && <span className="block text-destructive">{l.fehler}</span>}</TableCell>
                  </TableRow>
                ))}
                {!logs.length && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Noch keine Schreibaktion.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}
      </>}
      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abschluss in Close anlegen?</AlertDialogTitle>
            <AlertDialogDescription>Für {confirm?.kunde} wird in Close ein gewonnener Abschluss angelegt (Pipeline „Sales“, Status „Won“, Deal-Typ „Neukunde“) mit den eingegebenen Werten.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const r = confirm!; setConfirm(null); save(r, true); }}>Anlegen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
