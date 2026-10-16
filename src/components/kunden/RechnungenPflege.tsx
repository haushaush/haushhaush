import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ExternalLink, Info, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { portalRechnung } from '@/lib/kundenVerknuepfungen';

const STATUS = [
  { v: 'offen', l: 'Offen' }, { v: 'bezahlt', l: 'Bezahlt' }, { v: 'ueberfaellig', l: 'Überfällig' }, { v: 'storniert', l: 'Storniert' },
] as const;
const statusLabel = (s: unknown) => STATUS.find(x => x.v === s)?.l ?? (s ? String(s) : '—');
const fmtDatum = (v?: string | null) => (v ? new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const fmtEur = (v: unknown) => (v == null || v === '' ? '—' : Number(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));

function rechnungFehler(r: any): string {
  const c = String(r?.error || r?.message || '');
  const m: Record<string, string> = {
    nummer_vergeben: 'Für diesen Kunden gibt es bereits eine Rechnung mit dieser Nummer.',
    fremder_kunde: 'Diese Rechnung gehört nicht zu diesem Kunden.',
    rechnung_nicht_gefunden: 'Diese Rechnung existiert im Portal nicht mehr.',
    invalid_betrag: 'Der Betrag muss eine Zahl sein.',
    invalid_datum: 'Das Datum ist ungültig.',
    profile_not_found: 'Das verknüpfte Portalkonto existiert nicht mehr.',
    invalid_action: 'Diese Aktion wird von der Portal-Schnittstelle nicht unterstützt.',
  };
  if (m[c]) return m[c];
  if (c.startsWith('invalid_')) return 'Die Angaben wurden in einer unerwarteten Form übermittelt.';
  if (/fetch|network/i.test(c)) return 'Das Portal ist gerade nicht erreichbar. Bitte später erneut versuchen.';
  return 'Das Portal hat einen Fehler gemeldet. Bitte später erneut versuchen.';
}

type Form = { nummer: string; datum: string; betrag: string; status: string; file_url: string };
const leer: Form = { nummer: '', datum: '', betrag: '', status: 'offen', file_url: '' };
const ausZeile = (r: any): Form => ({
  nummer: r.nummer ?? '', datum: r.datum ? String(r.datum).slice(0, 10) : '',
  betrag: r.betrag == null ? '' : String(r.betrag).replace('.', ','), status: r.status ?? 'offen', file_url: r.file_url ?? '',
});

/** Prüft und wandelt in die Sende-Form. Betrag als Zahl, leere Adresse als null. */
function pruefe(f: Form): { fehler: string } | { werte: { nummer: string; datum: string | null; betrag: number; status: string; file_url: string | null } } {
  const nummer = f.nummer.trim();
  if (!nummer) return { fehler: 'Bitte eine Rechnungsnummer angeben.' };
  if (nummer.length > 100) return { fehler: 'Die Nummer darf höchstens 100 Zeichen lang sein.' };
  if (f.datum && !/^\d{4}-\d{2}-\d{2}$/.test(f.datum)) return { fehler: 'Das Datum ist ungültig.' };
  const roh = f.betrag.trim().replace(',', '.');
  const betrag = Number(roh);
  if (!roh || !Number.isFinite(betrag)) return { fehler: 'Der Betrag muss eine Zahl sein.' };
  if (betrag < 0) return { fehler: 'Der Betrag darf nicht negativ sein.' };
  if (!STATUS.some(s => s.v === f.status)) return { fehler: 'Bitte einen Status auswählen.' };
  const url = f.file_url.trim();
  if (url && !url.startsWith('https://')) return { fehler: 'Die Dokument-Adresse muss mit https:// beginnen.' };
  return { werte: { nummer, datum: f.datum || null, betrag, status: f.status, file_url: url || null } };
}

export function RechnungenPflege({ profileId, rechnungen, neuLaden }: { profileId: string; rechnungen: any[]; neuLaden: () => Promise<void> | void }) {
  const [edit, setEdit] = useState<{ zeile: any | null } | null>(null);
  const [form, setForm] = useState<Form>(leer);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loeschen, setLoeschen] = useState<any | null>(null);

  const oeffnen = (zeile: any | null) => { setForm(zeile ? ausZeile(zeile) : leer); setFehler(null); setEdit({ zeile }); };

  const speichern = async () => {
    const p = pruefe(form);
    if ('fehler' in p) { setFehler(p.fehler); return; }
    const z = edit?.zeile;
    let body: Record<string, unknown>;
    if (z) {
      const alt = ausZeile(z); const a = pruefe(alt);
      const altW = 'werte' in a ? a.werte : null;
      body = { id: z.id };
      (Object.keys(p.werte) as (keyof typeof p.werte)[]).forEach(k => { if (!altW || altW[k] !== p.werte[k]) body[k] = p.werte[k]; });
      if (Object.keys(body).length === 1) { setEdit(null); return; }
    } else body = p.werte;
    setBusy(true); setFehler(null);
    try {
      const r = await portalRechnung(z ? 'rechnung_aendern' : 'rechnung_anlegen', profileId, body);
      if (!r?.ok) { setFehler(rechnungFehler(r)); return; }
      toast.success(z ? 'Rechnung geändert' : 'Rechnung angelegt');
      setEdit(null); await neuLaden();
    } catch (e: any) { setFehler(rechnungFehler({ error: e?.message })); }
    finally { setBusy(false); }
  };

  const loeschenAusfuehren = async () => {
    const z = loeschen; if (!z) return;
    setBusy(true);
    try {
      const r = await portalRechnung('rechnung_loeschen', profileId, { id: z.id });
      if (!r?.ok) { toast.error(rechnungFehler(r)); return; }
      toast.success('Rechnung gelöscht');
      setLoeschen(null); await neuLaden();
    } catch (e: any) { toast.error(rechnungFehler({ error: e?.message })); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Rechnungen</CardTitle>
        <Button size="sm" onClick={() => oeffnen(null)}><Plus className="h-4 w-4 mr-1" />Rechnung anlegen</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />Diese Rechnungen sieht der Kunde im LeadSharks-Portal.</p>
        {rechnungen.length === 0 ? <p className="text-sm text-muted-foreground">Keine Rechnungen.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Nummer</TableHead><TableHead>Datum</TableHead><TableHead className="text-right">Betrag</TableHead><TableHead>Status</TableHead><TableHead>Dokument</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rechnungen.map((r, i) => (
                <TableRow key={r.id || i}>
                  <TableCell>{r.nummer || '—'}</TableCell>
                  <TableCell className="tabular-nums">{fmtDatum(r.datum)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtEur(r.betrag)}</TableCell>
                  <TableCell>{statusLabel(r.status)}</TableCell>
                  <TableCell>{r.file_url && <a href={r.file_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-sm">Öffnen<ExternalLink className="h-3 w-3" /></a>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!r.id} onClick={() => oeffnen(r)} aria-label="Ändern"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!r.id} onClick={() => setLoeschen(r)} aria-label="Löschen"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!edit} onOpenChange={o => { if (!o && !busy) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.zeile ? 'Rechnung ändern' : 'Rechnung anlegen'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nummer</Label><Input maxLength={100} value={form.nummer} onChange={e => setForm({ ...form, nummer: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Datum</Label><Input type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} /></div>
              <div className="space-y-1"><Label>Betrag (€)</Label><Input inputMode="decimal" value={form.betrag} onChange={e => setForm({ ...form, betrag: e.target.value })} placeholder="0,00" /></div>
            </div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Dokument (optional)</Label><Input value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} placeholder="https://…" /></div>
            {fehler && <p className="text-sm text-destructive">{fehler}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEdit(null)}>Abbrechen</Button>
            <Button disabled={busy} onClick={speichern}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!loeschen} onOpenChange={o => { if (!o && !busy) setLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>Rechnung {loeschen?.nummer || '—'} über {fmtEur(loeschen?.betrag)} wird im LeadSharks-Portal gelöscht. Der Kunde sieht sie danach nicht mehr.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); loeschenAusfuehren(); }}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
