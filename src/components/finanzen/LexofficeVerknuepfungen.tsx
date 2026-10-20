import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { ExternalLink, Link2Off, RefreshCw, Search } from 'lucide-react';
import { namensTreffer } from '@/lib/kundenVerknuepfungen';
import { rechnungsStatus } from '@/lib/rechnungen';

/** Gleiche Normalisierung wie public.nkey() – Schlüssel für buchhaltung_intern. */
export const nkey = (t: string | null | undefined) => (t || '').toLowerCase()
  .replace(/[äöüßáéíóúàèìòùâêîôûç]/g, c => ({ ä: 'a', ö: 'o', ü: 'u', ß: 's', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u', â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u', ç: 'c' } as Record<string, string>)[c])
  .replace(/[^a-z0-9]/g, '');
const k = (s: string | null | undefined) => (s || '').trim().toLowerCase();
const eur = (n: number) => '€' + n.toLocaleString('de-DE', { maximumFractionDigits: 0 });
const GRUENDE = ['Ehemaliger Kunde', 'Kein Betreuungskunde', 'Zahlungsdienstleister', 'Sonstiges'];

type Row = { id: string; name: string; client_id: string | null; client_name: string | null; match_type: string | null; confidence: number | null; is_confirmed: boolean; anzahl: number; summe: number; offen: number };
type Kunde = { id: string; name: string | null };
type Filter = 'all' | 'linked' | 'unlinked' | 'suggested' | 'ambiguous';
type Art = 'intern' | 'vorlage';
const ART_TEXT: Record<Art, string> = { intern: 'intern', vorlage: 'als Vorlage' };
const ART_GRUND: Record<Art, string> = { intern: 'Intern', vorlage: 'Vorlage- oder Testrechnung' };

function MatchBadge({ r }: { r: Row }) {
  if (r.client_id && r.is_confirmed) return <Badge variant="secondary">{r.match_type === 'auto_exact' ? 'Automatisch' : 'Manuell'}</Badge>;
  if (!r.client_id && r.is_confirmed) return <Badge variant="outline" className="text-muted-foreground">Nicht zuordnen</Badge>;
  if (r.match_type === 'suggested') return <Badge variant="outline" className="border-primary/40 text-primary">Vorschlag</Badge>;
  if (r.match_type === 'ambiguous') return <Badge variant="outline" className="border-warning/40 text-warning">Mehrdeutig</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Nicht verknüpft</Badge>;
}

export function LexofficeVerknuepfungen() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const [canManage, setCanManage] = useState(hasRole('admin'));
  const [rows, setRows] = useState<Row[]>([]);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Row | null>(null);
  const [nicht, setNicht] = useState<Row | null>(null);

  useEffect(() => {
    if (hasRole('admin')) { setCanManage(true); return; }
    (async () => {
      const { data } = await (supabase.rpc as any)('user_has_permission', { target_user_id: (await supabase.auth.getUser()).data.user?.id, requested_permission_key: 'finanzen.manage' });
      setCanManage(!!data);
    })();
  }, [hasRole]);

  const load = useCallback(async () => {
    setLoading(true);
    const seiten = async (t: string, sel: string, f?: (q: any) => any) => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        let q = (supabase.from as any)(t).select(sel).range(from, from + 999);
        if (f) q = f(q);
        const { data, error } = await q;
        if (error) { toast({ title: `${t} nicht lesbar`, description: error.message, variant: 'destructive' }); break; }
        out.push(...(data || [])); if (!data || data.length < 1000) break;
      }
      return out;
    };
    const [links, inv, ks] = await Promise.all([
      seiten('lexoffice_client_links', 'id, lexoffice_contact_name, client_id, match_type, confidence, is_confirmed'),
      seiten('lexoffice_invoices', 'contact_name, total_amount, status, due_date'),
      seiten('clients', 'id, name', q => q.is('deleted_at', null).order('name')),
    ]);
    const heute = new Date().toISOString().slice(0, 10);
    const agg = new Map<string, { anzahl: number; summe: number; offen: number }>();
    for (const i of inv) {
      const a = agg.get(k(i.contact_name)) || { anzahl: 0, summe: 0, offen: 0 };
      a.anzahl++; a.summe += Number(i.total_amount || 0);
      const st = rechnungsStatus('lexoffice', i.status, i.due_date, heute);
      if (st === 'offen' || st === 'überfällig') a.offen++;
      agg.set(k(i.contact_name), a);
    }
    const kn = new Map(ks.map((c: Kunde) => [c.id, c.name]));
    setKunden(ks);
    setRows(links.map((l: any) => ({
      id: l.id, name: l.lexoffice_contact_name || '—', client_id: l.client_id, client_name: l.client_id ? kn.get(l.client_id) ?? null : null,
      match_type: l.match_type, confidence: l.confidence, is_confirmed: !!l.is_confirmed, ...(agg.get(k(l.lexoffice_contact_name)) || { anzahl: 0, summe: 0, offen: 0 }),
    })).sort((a: Row, b: Row) => b.summe - a.summe));
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const upd = async (id: string, patch: Record<string, unknown>, ok: string) => {
    const { error } = await (supabase.from as any)('lexoffice_client_links').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: ok }); load(); return true;
  };

  const runAutoLink = async () => {
    setRunning(true);
    try {
      const { data, error } = await (supabase.rpc as any)('lexoffice_auto_link_clients');
      if (error) throw error;
      const errs = data?.errors ?? 0;
      toast({
        title: errs > 0 ? `Abgleich abgeschlossen mit ${errs} Fehlern` : 'Automatischer Abgleich abgeschlossen',
        description: `${data?.auto_exact ?? 0} auto · ${data?.suggested ?? 0} Vorschläge · ${data?.ambiguous ?? 0} mehrdeutig · ${data?.unlinked ?? 0} offen · ${data?.uebersprungen_intern ?? 0} interne · ${data?.uebersprungen_vorlagen ?? 0} Vorlagen-Rechnungen übersprungen`,
        variant: errs > 0 ? 'destructive' : undefined,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Abgleich fehlgeschlagen', description: e?.message || String(e), variant: 'destructive' });
    } finally { setRunning(false); }
  };

  /** Empfänger als intern oder als Vorlage ausnehmen; bestehender Eintrag behält seinen Grund. */
  const alsAusnehmen = async (r: Row, art: Art) => {
    const name_norm = nkey(r.name);
    const { data: alt } = await (supabase.from as any)('buchhaltung_intern').select('art').eq('name_norm', name_norm).limit(1);
    const a = alt?.length
      ? await (supabase.from as any)('buchhaltung_intern').update({ art, name_anzeige: r.name }).eq('name_norm', name_norm)
      : await (supabase.from as any)('buchhaltung_intern').insert({ name_norm, name_anzeige: r.name, art, grund: ART_GRUND[art] });
    if (a.error) { toast({ title: 'Fehler', description: a.error.message, variant: 'destructive' }); return; }
    const d = await (supabase.from as any)('lexoffice_client_links').delete().eq('id', r.id);
    if (d.error) { toast({ title: `${art === 'intern' ? 'Als intern' : 'Als Vorlage'} markiert, Verknüpfungszeile blieb`, description: d.error.message, variant: 'destructive' }); return; }
    toast({ title: `„${r.name}" ist ${ART_TEXT[art]} markiert` }); load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'linked' && !r.client_id) return false;
      if (filter === 'unlinked' && r.client_id) return false;
      if (filter === 'suggested' && r.match_type !== 'suggested') return false;
      if (filter === 'ambiguous' && r.match_type !== 'ambiguous') return false;
      return !q || `${r.name} ${r.client_name || ''}`.toLowerCase().includes(q);
    });
  }, [rows, filter, search]);

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold mr-2">lexoffice-Empfänger</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length} Empfänger · {rows.filter(r => r.client_id && r.is_confirmed).length} verknüpft</span>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="lexoffice-Empfänger oder Kunde suchen…" className="pl-8" />
        </div>
        <Select value={filter} onValueChange={v => setFilter(v as Filter)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="linked">Verknüpft</SelectItem>
            <SelectItem value="unlinked">Nicht verknüpft</SelectItem>
            <SelectItem value="suggested">Vorschläge</SelectItem>
            <SelectItem value="ambiguous">Mehrdeutig</SelectItem>
          </SelectContent>
        </Select>
        {canManage && <Button variant="outline" size="sm" onClick={runAutoLink} disabled={running}>
          <RefreshCw className={`h-4 w-4 mr-1 ${running ? 'animate-spin' : ''}`} />Automatisch abgleichen</Button>}
      </div>
      {loading ? <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Empfänger (lexoffice)</TableHead><TableHead>Kunde</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Rechnungen</TableHead><TableHead className="text-right">Summe</TableHead><TableHead className="text-right">Offen</TableHead>
              <TableHead className="text-right w-[440px]">Aktionen</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Keine Einträge.</TableCell></TableRow>}
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.client_id ? <Link to={`/kunden/${r.client_id}`} className="text-primary hover:underline inline-flex items-center gap-1">{r.client_name || 'Kunde öffnen'}<ExternalLink className="h-3 w-3" /></Link> : <span className="text-muted-foreground">–</span>}</TableCell>
                  <TableCell><MatchBadge r={r} /></TableCell>
                  <TableCell className="text-right tabular-nums">{r.anzahl}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(r.summe)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.offen}</TableCell>
                  <TableCell className="text-right">
                    {canManage && <div className="flex justify-end gap-1 flex-wrap">
                      {r.client_id && !r.is_confirmed && <Button size="sm" variant="secondary" onClick={() => upd(r.id, { is_confirmed: true, match_type: 'manual' }, 'Vorschlag bestätigt')}>Bestätigen</Button>}
                      <Button size="sm" variant="outline" onClick={() => setDialog(r)}>{r.client_id ? 'Ändern' : 'Verknüpfen'}</Button>
                      {!r.client_id && !r.is_confirmed && <Button size="sm" variant="ghost" onClick={() => setNicht(r)}>Nicht zuordnen</Button>}
                      <Button size="sm" variant="ghost" onClick={() => alsAusnehmen(r, 'intern')}>Als intern markieren</Button>
                      <Button size="sm" variant="ghost" onClick={() => alsAusnehmen(r, 'vorlage')}>Als Vorlage markieren</Button>
                      {(r.client_id || r.is_confirmed) && <Button size="sm" variant="ghost" title="Verknüpfung lösen" onClick={() => upd(r.id, { client_id: null, match_type: 'unlinked', is_confirmed: false, confidence: null }, 'Verknüpfung gelöst')}><Link2Off className="h-4 w-4" /></Button>}
                    </div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <LinkDialog row={dialog} kunden={kunden} onClose={() => setDialog(null)}
        onPick={async c => { if (dialog && await upd(dialog.id, { client_id: c, match_type: 'manual', is_confirmed: true, confidence: 1 }, 'Verknüpft')) setDialog(null); }} />
      <NichtDialog row={nicht} onClose={() => setNicht(null)} onSaved={() => { setNicht(null); load(); }} />
    </CardContent></Card>
  );
}

function LinkDialog({ row, kunden, onClose, onPick }: { row: Row | null; kunden: Kunde[]; onClose: () => void; onPick: (clientId: string) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { setQ(''); }, [row]);
  const vorschlaege = useMemo(() => !row ? [] : kunden.map(c => ({ c, s: namensTreffer(row.name, c.name) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 5), [row, kunden]);
  const treffer = useMemo(() => q.trim().length < 2 ? [] : kunden.filter(c => (c.name || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 20), [q, kunden]);
  return (
    <Dialog open={!!row} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>lexoffice-Empfänger verknüpfen</DialogTitle></DialogHeader>
        {row && <div className="space-y-4">
          <div className="text-sm"><div className="text-muted-foreground">Empfänger</div><div className="font-medium">{row.name}</div></div>
          {vorschlaege.length > 0 && <div>
            <div className="text-xs text-muted-foreground mb-1">Vorschläge</div>
            <div className="space-y-1">{vorschlaege.map(({ c, s }) => (
              <button key={c.id} onClick={() => onPick(c.id)} className="w-full text-left px-3 py-2 rounded border hover:bg-accent flex items-center justify-between">
                <span>{c.name}</span><Badge variant="outline">{Math.round(s * 100)} %</Badge></button>))}</div>
          </div>}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Kunden suchen</div>
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Name eingeben…" />
            {treffer.length > 0 && <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">{treffer.map(c => (
              <button key={c.id} onClick={() => onPick(c.id)} className="w-full text-left px-3 py-2 rounded border hover:bg-accent">{c.name}</button>))}</div>}
          </div>
        </div>}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Schließen</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** „Nicht zuordnen" wie bei Qonto: Pflichtgrund, Empfänger zählt nie im Cash Collect. */
function NichtDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [grund, setGrund] = useState('');
  const [frei, setFrei] = useState('');
  useEffect(() => { setGrund(''); setFrei(''); }, [row]);
  const text = grund === 'Sonstiges' ? frei.trim() : grund;
  const speichern = async () => {
    if (!row || !text) return;
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const a = await (supabase.from as any)('bonus_cash_ignorierte_empfaenger').upsert({ qonto_client_name: row.name, grund: text, angelegt_von: uid }, { onConflict: 'qonto_client_name' });
    if (a.error) { toast({ title: 'Fehler', description: a.error.message, variant: 'destructive' }); return; }
    const b = await (supabase.from as any)('lexoffice_client_links').update({ client_id: null, match_type: 'unlinked', is_confirmed: true, confidence: null, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (b.error) { toast({ title: 'Fehler', description: b.error.message, variant: 'destructive' }); return; }
    toast({ title: `„${row.name}" wird nicht zugeordnet` }); onSaved();
  };
  return (
    <Dialog open={!!row} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nicht zuordnen: {row?.name}</DialogTitle></DialogHeader>
        <Select value={grund} onValueChange={setGrund}>
          <SelectTrigger><SelectValue placeholder="Grund wählen…" /></SelectTrigger>
          <SelectContent>{GRUENDE.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
        </Select>
        {grund === 'Sonstiges' && <Input value={frei} onChange={e => setFrei(e.target.value)} placeholder="Grund eintragen…" />}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={!text} onClick={speichern}>Speichern</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
