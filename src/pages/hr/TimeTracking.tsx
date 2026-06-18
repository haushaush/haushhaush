import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  ArrowUpDown, Download, Pencil, Trash2, Clock, Users as UsersIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Entry = {
  id: string;
  user_id: string;
  task_label: string | null;
  client_id: string | null;
  task_id: string | null;
  started_at: string | null;
  stopped_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
  user_email: string | null;
  team_id: string | null;
  team_name: string | null;
};

type SortKey = 'date' | 'user' | 'duration';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const isoDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const computeDuration = (e: Entry): number => {
  if (e.duration_seconds != null) return e.duration_seconds;
  if (e.started_at && e.stopped_at) {
    return Math.max(0, Math.floor((new Date(e.stopped_at).getTime() - new Date(e.started_at).getTime()) / 1000));
  }
  return 0;
};

const fmtDuration = (s: number) => {
  if (!s || s < 0) return '00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE');
};

const fmtTime = (iso: string | null) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

const toInputDT = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromInputDT = (v: string) => (v ? new Date(v).toISOString() : null);

const displayName = (e: { team_name: string | null; user_email: string | null }) =>
  e.team_name || e.user_email || 'Unbekannt';

const presetRange = (key: string): { from: string; to: string } => {
  const now = new Date();
  const today = isoDay(now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() - day);
    return { from: isoDay(d), to: today };
  }
  if (key === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: isoDay(d), to: today };
  }
  if (key === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: isoDay(from), to: isoDay(to) };
  }
  return { from: '', to: '' };
};

export default function TimeTracking() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(presetRange('month').from);
  const [dateTo, setDateTo] = useState<string>(presetRange('month').to);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [editTask, setEditTask] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editStop, setEditStop] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('admin_time_entries')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(5000);
    if (error) {
      toast.error('Konnte Zeiteinträge nicht laden', { description: error.message });
      setEntries([]);
    } else {
      setEntries((data as Entry[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (!map.has(e.user_id)) map.set(e.user_id, displayName(e));
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [entries]);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59.999').getTime() : null;
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (userFilter !== 'all' && e.user_id !== userFilter) return false;
      const ref = e.started_at ? new Date(e.started_at).getTime() : new Date(e.created_at).getTime();
      if (fromTs && ref < fromTs) return false;
      if (toTs && ref > toTs) return false;
      if (q) {
        const hay = `${e.task_label || ''} ${e.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, userFilter, dateFrom, dateTo, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        const av = a.started_at ? new Date(a.started_at).getTime() : 0;
        const bv = b.started_at ? new Date(b.started_at).getTime() : 0;
        cmp = av - bv;
      } else if (sortKey === 'user') {
        cmp = displayName(a).localeCompare(displayName(b), 'de');
      } else {
        cmp = computeDuration(a) - computeDuration(b);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalSeconds = useMemo(() => filtered.reduce((s, e) => s + computeDuration(e), 0), [filtered]);
  const perUser = useMemo(() => {
    const m = new Map<string, { name: string; seconds: number }>();
    for (const e of filtered) {
      const k = e.user_id;
      const cur = m.get(k) || { name: displayName(e), seconds: 0 };
      cur.seconds += computeDuration(e);
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.seconds - a.seconds);
  }, [filtered]);
  const maxUserSeconds = perUser[0]?.seconds || 1;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageEntries = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [userFilter, dateFrom, dateTo, search, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'date' ? 'desc' : 'asc'); }
  };

  const applyPreset = (k: string) => {
    const r = presetRange(k);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const openEdit = (e: Entry) => {
    setEditEntry(e);
    setEditTask(e.task_label || '');
    setEditStart(toInputDT(e.started_at));
    setEditStop(toInputDT(e.stopped_at));
    setEditNotes(e.notes || '');
  };

  const saveEdit = async () => {
    if (!editEntry) return;
    setSaving(true);
    const startIso = fromInputDT(editStart);
    const stopIso = fromInputDT(editStop);
    let duration: number | null = editEntry.duration_seconds;
    if (startIso && stopIso) {
      duration = Math.max(0, Math.floor((new Date(stopIso).getTime() - new Date(startIso).getTime()) / 1000));
    } else if (!stopIso) {
      duration = null;
    }
    const payload: any = {
      task_label: editTask || null,
      started_at: startIso,
      stopped_at: stopIso,
      duration_seconds: duration,
      notes: editNotes || null,
    };
    // optimistic
    setEntries(prev => prev.map(e => (e.id === editEntry.id ? { ...e, ...payload } : e)));
    const { error } = await supabase.from('time_entries').update(payload).eq('id', editEntry.id);
    setSaving(false);
    if (error) {
      toast.error('Speichern fehlgeschlagen', { description: error.message });
      load();
      return;
    }
    toast.success('Zeiteintrag aktualisiert');
    setEditEntry(null);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const prev = entries;
    setEntries(p => p.filter(e => e.id !== id));
    const { error } = await supabase.from('time_entries').delete().eq('id', id);
    if (error) {
      toast.error('Löschen fehlgeschlagen', { description: error.message });
      setEntries(prev);
    } else {
      toast.success('Zeiteintrag gelöscht');
    }
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const singleUser = userFilter !== 'all'
      ? userOptions.find(u => u.id === userFilter)?.name
      : null;
    doc.setFontSize(16);
    doc.text('Zeiterfassung', 40, 40);
    doc.setFontSize(10);
    const rangeTxt = `Zeitraum: ${dateFrom || '—'} bis ${dateTo || '—'}`;
    doc.text(rangeTxt, 40, 58);
    if (singleUser) doc.text(`Mitarbeiter: ${singleUser}`, 40, 72);
    doc.text(`Einträge: ${filtered.length}   |   Gesamtzeit: ${fmtDuration(totalSeconds)}`, 40, singleUser ? 86 : 72);

    autoTable(doc, {
      startY: singleUser ? 100 : 86,
      head: [['Mitarbeiter', 'Aufgabe', 'Datum', 'Start', 'Ende', 'Dauer', 'Notizen']],
      body: sorted.map(e => [
        displayName(e),
        e.task_label || '',
        fmtDate(e.started_at),
        fmtTime(e.started_at),
        e.stopped_at ? fmtTime(e.stopped_at) : 'läuft',
        fmtDuration(computeDuration(e)),
        e.notes || '',
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 30, 30] },
      columnStyles: {
        1: { cellWidth: 180 },
        6: { cellWidth: 180 },
      },
      didDrawPage: (data) => {
        const str = `Seite ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 16);
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(10);
    doc.text(`Gesamtzeit: ${fmtDuration(totalSeconds)} (${(totalSeconds / 3600).toFixed(2)} h)`, 40, finalY + 24);

    const fname = `zeiterfassung_${dateFrom || 'all'}_${dateTo || 'all'}${singleUser ? '_' + singleUser.replace(/\s+/g, '_') : ''}.pdf`;
    doc.save(fname);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time Tracking</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle Zeiteinträge aller Mitarbeiter. Filtern, bearbeiten und als PDF exportieren.
          </p>
        </div>
        <Button onClick={exportPdf} disabled={!sorted.length} className="gap-2">
          <Download className="h-4 w-4" /> Als PDF exportieren
        </Button>
      </div>

      {/* Filterleiste */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Mitarbeiter</label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Mitarbeiter</SelectItem>
                  {userOptions.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Von</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Bis</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Suche (Aufgabe/Notiz)</label>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="z.B. Meeting" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => applyPreset('today')}>Heute</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset('week')}>Diese Woche</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset('month')}>Dieser Monat</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset('last_month')}>Letzter Monat</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(''); setDateTo(''); setUserFilter('all'); setSearch(''); }}
            >
              Filter zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Gesamtzeit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{fmtDuration(totalSeconds)}</div>
            <div className="text-xs text-muted-foreground mt-1">{(totalSeconds / 3600).toFixed(2)} h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Einträge</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{filtered.length}</div>
            <div className="text-xs text-muted-foreground mt-1">im aktuellen Filter</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Aktive Mitarbeiter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{perUser.length}</div>
            <div className="text-xs text-muted-foreground mt-1">mit Einträgen im Zeitraum</div>
          </CardContent>
        </Card>
      </div>

      {/* Pro Mitarbeiter */}
      {perUser.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stunden pro Mitarbeiter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {perUser.map(u => (
              <div key={u.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{u.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmtDuration(u.seconds)} · {(u.seconds / 3600).toFixed(1)} h
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(u.seconds / maxUserSeconds) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabelle */}
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button onClick={() => toggleSort('user')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Mitarbeiter <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Aufgabe</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Datum <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Ende</TableHead>
                  <TableHead className="text-right">
                    <button onClick={() => toggleSort('duration')} className="inline-flex items-center gap-1 hover:text-foreground">
                      Dauer <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Notizen</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Lade …</TableCell></TableRow>
                ) : pageEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Keine Einträge</TableCell></TableRow>
                ) : pageEntries.map(e => {
                  const running = !e.stopped_at;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{displayName(e)}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{e.task_label || <span className="text-muted-foreground italic">—</span>}</TableCell>
                      <TableCell className="tabular-nums">{fmtDate(e.started_at)}</TableCell>
                      <TableCell className="tabular-nums">{fmtTime(e.started_at)}</TableCell>
                      <TableCell className="tabular-nums">
                        {running
                          ? <Badge variant="outline" className="text-amber-600 border-amber-600/40">läuft</Badge>
                          : fmtTime(e.stopped_at)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtDuration(computeDuration(e))}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-muted-foreground">{e.notes || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label="Bearbeiten">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(e.id)} aria-label="Löschen">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <div className="text-muted-foreground">
                Seite {page} von {totalPages} · {sorted.length} Einträge
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Zurück</Button>
                <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Weiter</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zeiteintrag bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Mitarbeiter: <span className="text-foreground font-medium">{editEntry ? displayName(editEntry) : ''}</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Aufgabe</label>
              <Input value={editTask} onChange={e => setEditTask(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Start</label>
                <Input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Ende</label>
                <Input type="datetime-local" value={editStop} onChange={e => setEditStop(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Notizen</label>
              <Textarea rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Abbrechen</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Speichere …' : 'Speichern'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zeiteintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Eintrag wird unwiderruflich entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
