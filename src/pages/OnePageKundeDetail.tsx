import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import {
  ArrowLeft, ExternalLink, Copy, Upload, Download, Search,
  RefreshCw, Trash2, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  page_url: string | null;
  status: string;
  notes: string | null;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

interface Lead {
  id: string;
  project_id: string;
  vorname: string | null;
  nachname: string | null;
  name: string | null;
  email: string | null;
  telefon: string | null;
  phone: string | null;
  nachricht: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  source: string | null;
  imported_via: string | null;
  payload: Record<string, unknown> | null;
  received_at: string;
  created_at: string;
}

const PROJECT_REF = 'fqcueblsinjiclolubwv';

function relativeTime(iso: string | null) {
  if (!iso) return '–';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `vor ${d} T.`;
  return new Date(iso).toLocaleDateString('de-DE');
}



function csvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function OnePageKundeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'leads' | 'webhook' | 'settings'>('leads');

  // Leads tab state
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'7' | '30' | 'all'>('all');
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Settings state
  const [editForm, setEditForm] = useState<{ name: string; page_url: string; status: string; notes: string }>({
    name: '', page_url: '', status: 'active', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    const [pr, lr] = await Promise.all([
      supabase.from('onepage_projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('onepage_project_leads').select('*').eq('project_id', id)
        .order('received_at', { ascending: false }).limit(2000),
    ]);
    if (pr.error || !pr.data) {
      toast.error('Projekt nicht gefunden');
      setLoading(false);
      return;
    }
    const p = pr.data as Project;
    setProject(p);
    setEditForm({
      name: p.name,
      page_url: p.page_url || '',
      status: p.status,
      notes: p.notes || '',
    });
    setLeads((lr.data || []) as Lead[]);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [id]);

  const filteredLeads = useMemo(() => {
    const now = Date.now();
    return leads.filter((l) => {
      if (dateFilter !== 'all') {
        const days = dateFilter === '7' ? 7 : 30;
        if (now - new Date(l.received_at).getTime() > days * 86400_000) return false;
      }
      if (search) {
        const hay = [
          l.vorname, l.nachname, l.name, l.email, l.telefon, l.phone,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [leads, search, dateFilter]);

  const webhookUrl = project
    ? `https://${PROJECT_REF}.supabase.co/functions/v1/onepage-webhook?token=${project.webhook_secret}`
    : '';

  function copy(t: string) {
    navigator.clipboard.writeText(t);
    toast.success('Kopiert');
  }

  async function saveSettings() {
    if (!project) return;
    if (!editForm.name.trim()) { toast.error('Name darf nicht leer sein'); return; }
    setSaving(true);
    const { error } = await supabase.from('onepage_projects').update({
      name: editForm.name.trim(),
      page_url: editForm.page_url.trim() || null,
      status: editForm.status,
      notes: editForm.notes.trim() || null,
    }).eq('id', project.id);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes('row-level')
        ? 'Keine Berechtigung – nur Admins/Manager können speichern.'
        : 'Speichern fehlgeschlagen');
      return;
    }
    toast.success('Gespeichert');
    loadAll();
  }

  async function regenerateToken() {
    if (!project) return;
    const newSecret = crypto.getRandomValues(new Uint8Array(16))
      .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    const { error } = await supabase.from('onepage_projects')
      .update({ webhook_secret: newSecret }).eq('id', project.id);
    if (error) {
      toast.error('Konnte Token nicht erneuern');
      return;
    }
    toast.success('Neuer Webhook-Token erzeugt');
    setRegenOpen(false);
    loadAll();
  }

  async function deleteProject() {
    if (!project) return;
    const { error } = await supabase.from('onepage_projects').delete().eq('id', project.id);
    if (error) {
      toast.error('Löschen fehlgeschlagen – nur Admins dürfen Projekte löschen.');
      return;
    }
    toast.success('Projekt gelöscht');
    navigate('/onepage-leads/kunden');
  }

  function exportCsv() {
    if (filteredLeads.length === 0) { toast.error('Keine Leads zum Exportieren'); return; }
    const headers = ['vorname', 'nachname', 'email', 'telefon', 'nachricht', 'utm_source', 'utm_medium', 'utm_campaign', 'received_at'];
    const lines = [headers.join(',')];
    filteredLeads.forEach((l) => {
      lines.push([
        l.vorname ?? '', l.nachname ?? l.name ?? '', l.email ?? '',
        l.telefon ?? l.phone ?? '', l.nachricht ?? '',
        l.utm_source ?? '', l.utm_medium ?? '', l.utm_campaign ?? '',
        l.received_at,
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'leads'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Lade Projekt…</div>;
  }
  if (!project) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground mb-4">Projekt nicht gefunden.</p>
        <Button variant="outline" asChild>
          <Link to="/onepage-leads/kunden"><ArrowLeft className="h-4 w-4 mr-2" /> Zurück</Link>
        </Button>
      </div>
    );
  }

  const lastLead = leads[0]?.received_at || null;
  const STATUS_LABEL: Record<string, string> = { active: 'Aktiv', paused: 'Pausiert', archived: 'Archiviert' };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
          <Link to="/onepage-leads/kunden"><ArrowLeft className="h-4 w-4 mr-2" /> Alle Projekte</Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{project.name}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {project.page_url && (
                <a href={project.page_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  {project.page_url.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Badge variant="outline" className="rounded text-[10px]">
                {STATUS_LABEL[project.status] || project.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {leads.length} Leads · Letzter Lead {relativeTime(lastLead)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'leads' | 'webhook' | 'settings')}>
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="webhook">Webhook-Einrichtung</TabsTrigger>
          <TabsTrigger value="settings">Einstellungen</TabsTrigger>
        </TabsList>

        {/* === LEADS === */}
        <TabsContent value="leads" className="mt-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name oder E-Mail…" className="pl-9 h-9" />
            </div>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as '7' | '30' | 'all')}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
                <SelectItem value="all">Alle</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Leads importieren
              </Button>
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <p className="font-medium">
                  {leads.length === 0 ? 'Noch keine Leads.' : 'Keine Treffer für diesen Filter.'}
                </p>
                {leads.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Richte den Webhook ein um Leads zu empfangen, oder importiere bestehende Leads als CSV.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Vorname</th>
                    <th className="px-3 py-2 font-medium">Nachname</th>
                    <th className="px-3 py-2 font-medium">E-Mail</th>
                    <th className="px-3 py-2 font-medium">Telefon</th>
                    <th className="px-3 py-2 font-medium">Empfangen</th>
                    <th className="px-3 py-2 font-medium">UTM</th>
                    <th className="px-3 py-2 font-medium">Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((l) => (
                    <tr key={l.id} onClick={() => setOpenLead(l)}
                      className="border-t hover:bg-muted/40 cursor-pointer">
                      <td className="px-3 py-2">{l.vorname || '–'}</td>
                      <td className="px-3 py-2">{l.nachname || l.name || '–'}</td>
                      <td className="px-3 py-2">{l.email || '–'}</td>
                      <td className="px-3 py-2">{l.telefon || l.phone || '–'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(l.received_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{l.utm_source || '–'}</td>
                      <td className="px-3 py-2 text-xs">
                        <Badge variant="outline" className="rounded text-[10px]">
                          {l.imported_via === 'csv' ? 'CSV' : (l.source || 'webhook')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* === WEBHOOK === */}
        <TabsContent value="webhook" className="mt-6 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-1">So richtest du den Webhook ein</h3>
                <p className="text-sm text-muted-foreground">
                  Schicke Leads direkt aus deinem OnePage-Dashboard an dieses Projekt.
                </p>
              </div>
              <ol className="space-y-3 text-sm list-decimal list-inside marker:text-muted-foreground">
                <li>Öffne dein OnePage Dashboard</li>
                <li>Gehe zu deinem Projekt „{project.name}"</li>
                <li>Klicke auf <strong>CRM</strong> → <strong>Integration hinzufügen</strong> → <strong>Webhook</strong></li>
                <li>
                  Füge folgende URL ein:
                  <div className="mt-2 flex items-center gap-2 bg-muted/50 border rounded px-3 py-2">
                    <code className="text-xs flex-1 break-all">{webhookUrl}</code>
                    <Button variant="ghost" size="sm" onClick={() => copy(webhookUrl)} className="shrink-0">
                      <Copy className="h-3.5 w-3.5 mr-1" /> Kopieren
                    </Button>
                  </div>
                </li>
                <li>Speichern in OnePage</li>
              </ol>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                {lastLead ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">Zuletzt empfangen: <strong>{relativeTime(lastLead)}</strong></span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-muted-foreground">Noch nicht eingerichtet – warte auf ersten Lead.</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === SETTINGS === */}
        <TabsContent value="settings" className="mt-6 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-name">Name</Label>
                <Input id="s-name" value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-url">Page URL</Label>
                <Input id="s-url" value={editForm.page_url}
                  onChange={(e) => setEditForm((f) => ({ ...f, page_url: e.target.value }))}
                  placeholder="https://landing.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="paused">Pausiert</SelectItem>
                    <SelectItem value="archived">Archiviert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-notes">Notizen</Label>
                <Textarea id="s-notes" value={editForm.notes} rows={3}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Webhook-Token</Label>
                <div className="flex items-center gap-2">
                  <Input value={project.webhook_secret} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={() => copy(project.webhook_secret)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRegenOpen(true)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Neu generieren
                  </Button>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving ? 'Speichern…' : 'Speichern'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardContent className="p-6 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Gefahrenzone
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Projekt und alle zugehörigen Leads dauerhaft löschen.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Projekt löschen
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead detail panel */}
      <Sheet open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Lead Details</SheetTitle>
          </SheetHeader>
          {openLead && (
            <div className="mt-4 space-y-3 text-sm">
              <Field label="Vorname" value={openLead.vorname} />
              <Field label="Nachname" value={openLead.nachname || openLead.name} />
              <Field label="E-Mail" value={openLead.email} />
              <Field label="Telefon" value={openLead.telefon || openLead.phone} />
              <Field label="Nachricht" value={openLead.nachricht} />
              <Field label="UTM Source" value={openLead.utm_source} />
              <Field label="UTM Medium" value={openLead.utm_medium} />
              <Field label="UTM Campaign" value={openLead.utm_campaign} />
              <Field label="Quelle" value={openLead.imported_via === 'csv' ? 'CSV-Import' : (openLead.source || 'Webhook')} />
              <Field label="Empfangen" value={new Date(openLead.received_at).toLocaleString('de-DE')} />
              <div>
                <div className="text-xs text-muted-foreground mb-1">Raw payload</div>
                <pre className="bg-muted/50 border rounded p-2 text-[10px] overflow-auto max-h-64">
                  {JSON.stringify(openLead.payload || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Import modal */}
      <CsvImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={project.id}
        onDone={() => loadAll()}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle {leads.length} Leads werden ebenfalls gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProject} className="bg-destructive hover:bg-destructive/90">
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate confirm */}
      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Webhook-Token neu generieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Die alte Webhook-URL wird sofort ungültig. Du musst sie in OnePage neu eintragen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={regenerateToken}>Neu generieren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="col-span-2 break-words">{value || <span className="text-muted-foreground">–</span>}</div>
    </div>
  );
}

// ─── CSV Import Modal ───
function CsvImportModal({
  open, onOpenChange, projectId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  function reset() {
    setRows([]); setHeaders([]); setMapping({});
    if (fileRef.current) fileRef.current.value = '';
  }

  useEffect(() => { if (!open) reset(); }, [open]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ''));
      if (parsed.length === 0) { toast.error('Leere CSV-Datei'); return; }
      const hdr = parsed[0].map((h) => h.trim());
      setHeaders(hdr);
      setRows(parsed.slice(1));
      const map: Record<string, string> = {};
      hdr.forEach((h) => {
        const norm = h.toLowerCase().trim();
        const target = HEADER_ALIAS_MAP[norm];
        if (target) map[h] = target;
        else map[h] = '__raw__';
      });
      setMapping(map);
    };
    reader.readAsText(f);
  }

  const TARGETS = [
    { v: '__skip__', l: 'Ignorieren' },
    { v: '__raw__', l: '→ raw payload' },
    { v: 'vorname', l: 'Vorname' },
    { v: 'nachname', l: 'Nachname' },
    { v: 'email', l: 'E-Mail' },
    { v: 'telefon', l: 'Telefon' },
    { v: 'nachricht', l: 'Nachricht' },
    { v: 'utm_source', l: 'UTM Source' },
    { v: 'utm_medium', l: 'UTM Medium' },
    { v: 'utm_campaign', l: 'UTM Campaign' },
    { v: 'source', l: 'Quelle' },
    { v: 'received_at', l: 'Empfangen am' },
  ];

  async function doImport() {
    setImporting(true);
    const records = rows.map((r) => {
      const rec: Record<string, unknown> = {
        project_id: projectId, imported_via: 'csv',
      };
      const raw: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        const target = mapping[h] || '__raw__';
        const v = (r[idx] ?? '').trim();
        if (target === '__skip__' || !v) return;
        if (target === '__raw__') { raw[h] = v; return; }
        if (target === 'received_at') {
          const d = new Date(v);
          if (!isNaN(d.getTime())) rec.received_at = d.toISOString();
          else raw[h] = v;
          return;
        }
        rec[target] = v;
      });
      if (Object.keys(raw).length) rec.payload = raw;
      if (!rec.received_at) rec.received_at = new Date().toISOString();
      return rec;
    });

    let imported = 0, dupes = 0;
    const chunkSize = 100;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { data, error } = await supabase.from('onepage_project_leads')
        .insert(chunk as never)
        .select('id');
      if (error) {
        // Insert one-by-one to count duplicates
        for (const rec of chunk) {
          const { error: e2 } = await supabase.from('onepage_project_leads').insert(rec as never);
          if (!e2) imported++;
          else if (e2.code === '23505') dupes++;
        }
      } else {
        imported += data?.length || 0;
      }
    }
    setImporting(false);
    toast.success(`${imported} Leads importiert${dupes ? `, ${dupes} Duplikate übersprungen` : ''}`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leads aus CSV importieren</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {rows.length === 0 ? (
            <div>
              <Label>CSV-Datei wählen</Label>
              <Input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="mt-1.5" />
              <p className="text-xs text-muted-foreground mt-2">
                Erste Zeile muss Spaltennamen enthalten (z. B. Vorname, Nachname, E-Mail, Telefon).
                Trennzeichen Komma oder Semikolon.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm mb-2">
                  <strong>{rows.length}</strong> Zeilen gefunden. Spalten zuordnen:
                </p>
                <div className="border rounded divide-y">
                  {headers.map((h) => (
                    <div key={h} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-sm font-medium flex-1 truncate">{h}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Select value={mapping[h] || '__raw__'}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                        <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TARGETS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vorschau (erste 5 Zeilen)</Label>
                <div className="border rounded mt-1.5 overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-muted/40">
                      <tr>{headers.map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t">
                          {r.map((c, j) => <td key={j} className="px-2 py-1.5 truncate max-w-[160px]">{c}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          {rows.length > 0 && <Button variant="ghost" onClick={reset}>Andere Datei wählen</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button disabled={rows.length === 0 || importing} onClick={doImport}>
            {importing ? 'Importiere…' : `${rows.length} Leads importieren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
