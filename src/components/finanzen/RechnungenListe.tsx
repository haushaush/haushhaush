import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { ladeRechnungen, QUELLE_LABEL, statusText, type Quelle, type Rechnung } from '@/lib/rechnungen';

const eur2 = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function StatusBadge({ r }: { r: Rechnung }) {
  const t = statusText(r);
  if (r.status === 'bezahlt') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{t}</Badge>;
  if (r.status === 'überfällig') return <Badge variant="destructive">{t}</Badge>;
  if (r.status === 'offen') return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{t}</Badge>;
  if (r.status === 'storniert') return <Badge variant="outline">{t}</Badge>;
  return <Badge variant="secondary" title="Unbekannter Status der Quelle, unverändert angezeigt">{t}</Badge>;
}

function Kachel({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return <Card><CardContent className="p-4 space-y-1">
    <p className="text-[11px] text-muted-foreground">{title}</p>
    <p className="text-xl font-semibold tabular-nums">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground tabular-nums">{sub}</p>}
  </CardContent></Card>;
}

export function RechnungenListe({ from, to, reloadKey, qontoSyncUnvollstaendig }: {
  from: string | null; to: string | null; reloadKey: number; qontoSyncUnvollstaendig: boolean;
}) {
  const [rows, setRows] = useState<Rechnung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [quelle, setQuelle] = useState<'all' | Quelle>('all');
  const [status, setStatus] = useState('all');
  const [kunde, setKunde] = useState('all');
  const [nurUeberfaellig, setNurUeberfaellig] = useState(false);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    setFehler(null);
    Promise.all([ladeRechnungen('qonto'), ladeRechnungen('lexoffice')])
      .then(([q, l]) => setRows([...q, ...l]))
      .catch(e => setFehler(e?.message || String(e)));
  }, [reloadKey]);

  useEffect(() => { setPageIdx(0); }, [quelle, status, kunde, nurUeberfaellig, search, from, to, pageSize]);

  const lexLeer = !!rows && !rows.some(r => r.quelle === 'lexoffice');
  const kunden = useMemo(() => [...new Set((rows || []).filter(r => quelle === 'all' || r.quelle === quelle).map(r => r.kunde).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)), [rows, quelle]);

  const gefiltert = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rows || []).filter(r =>
      (quelle === 'all' || r.quelle === quelle) &&
      (!from || (r.issue && r.issue >= from)) && (!to || (r.issue && r.issue <= to)) &&
      (status === 'all' || r.status === status) &&
      (!nurUeberfaellig || r.status === 'überfällig') &&
      (kunde === 'all' || r.kunde === kunde) &&
      (!s || (r.number || '').toLowerCase().includes(s) || (r.kunde || '').toLowerCase().includes(s)),
    ).sort((a, b) => (b.issue || '').localeCompare(a.issue || ''));
  }, [rows, quelle, from, to, status, nurUeberfaellig, kunde, search]);

  const sum = (k?: string) => gefiltert.filter(r => !k || r.status === k).reduce((s, r) => s + r.amount, 0);
  const sonstige = gefiltert.filter(r => r.status === 'sonstige').length;
  const seite = gefiltert.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize);
  const heute = Date.parse(new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kachel title="Offen" value={eur(sum('offen'))} />
        <Kachel title="Überfällig" value={eur(sum('überfällig'))} />
        <Kachel title="Bezahlt (Filter)" value={eur(sum('bezahlt'))} />
        <Kachel title="Summe gefiltert" value={eur(sum())} sub={`${gefiltert.length.toLocaleString('de-DE')} Einträge${sonstige ? ` · davon ${sonstige} sonstige` : ''}`} />
      </div>

      {qontoSyncUnvollstaendig && quelle !== 'lexoffice' && (
        <Card className="border-amber-200 bg-amber-50"><CardContent className="p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Qonto-Rechnungssync wirkt unvollständig. Starte als Admin einen vollständigen Backfill; die Tabelle zeigt nur Daten, die bereits in der Datenbank gespeichert sind.</span>
        </CardContent></Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="inline-flex rounded-md border p-0.5">
          {(['all', 'lexoffice', 'qonto'] as const).map(q => (
            <Button key={q} size="sm" variant={quelle === q ? 'default' : 'ghost'} className="h-8" onClick={() => { setQuelle(q); setKunde('all'); }}>
              {q === 'all' ? 'Alle' : QUELLE_LABEL[q]}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Kunde oder Nr. suchen" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="offen">Offen</SelectItem>
            <SelectItem value="überfällig">Überfällig</SelectItem>
            <SelectItem value="bezahlt">Bezahlt</SelectItem>
            <SelectItem value="storniert">Storniert</SelectItem>
            <SelectItem value="sonstige">Sonstige</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kunde} onValueChange={setKunde}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Kunde" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kunden</SelectItem>
            {kunden.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={nurUeberfaellig ? 'default' : 'outline'} size="sm" onClick={() => setNurUeberfaellig(!nurUeberfaellig)}>Nur überfällig</Button>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nr.</TableHead><TableHead>Quelle</TableHead><TableHead>Kunde</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Betrag</TableHead><TableHead>Ausgestellt</TableHead><TableHead>Fällig</TableHead>
            <TableHead>Bezahlt</TableHead><TableHead className="text-right">Überfällig (T)</TableHead><TableHead>Zuletzt aktual.</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {fehler && <TableRow><TableCell colSpan={11} className="text-center text-destructive py-8">Rechnungen konnten nicht geladen werden: {fehler}</TableCell></TableRow>}
            {!fehler && !rows && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Lade Rechnungen…</TableCell></TableRow>}
            {rows && seite.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                {quelle === 'lexoffice' && lexLeer ? 'lexoffice noch nicht synchronisiert' : 'Keine Rechnungen gefunden'}
              </TableCell></TableRow>
            )}
            {seite.map(r => {
              const tage = r.status === 'überfällig' && r.due ? Math.floor((heute - Date.parse(r.due)) / 86400000) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.number || '–'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{QUELLE_LABEL[r.quelle]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.kunde || '–'}</TableCell>
                  <TableCell><StatusBadge r={r} /></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{eur2(r.amount)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.issue || '–'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.due || '–'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.paid || '–'}</TableCell>
                  <TableCell className="text-right text-xs">{tage != null ? <span className="text-red-600 font-medium">{tage}</span> : '–'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.updated ? new Date(r.updated).toLocaleDateString('de-DE') : '–'}</TableCell>
                  <TableCell>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3 w-3" /></a>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
        <div className="text-muted-foreground tabular-nums">
          {gefiltert.length === 0 ? 'Keine Rechnungen' : `${pageIdx * pageSize + 1}–${Math.min(gefiltert.length, (pageIdx + 1) * pageSize)} von ${gefiltert.length.toLocaleString('de-DE')} Rechnungen`}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Pro Seite:</span>
          <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 px-2" disabled={pageIdx === 0} onClick={() => setPageIdx(p => Math.max(0, p - 1))}><ChevronLeft className="h-3 w-3" /></Button>
          <span className="tabular-nums">{pageIdx + 1} / {Math.max(1, Math.ceil(gefiltert.length / pageSize))}</span>
          <Button variant="outline" size="sm" className="h-7 px-2" disabled={(pageIdx + 1) * pageSize >= gefiltert.length} onClick={() => setPageIdx(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
        </div>
      </div>
      </CardContent></Card>
    </div>
  );
}
