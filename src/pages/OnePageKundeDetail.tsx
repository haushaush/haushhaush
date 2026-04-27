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
interface ParsedLead {
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  unternehmen: string | null;
  nachricht: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  received_at: string;
  raw_data: Record<string, string>;
}

interface ParseStats {
  totalRows: number;
  skippedEmpty: number;
  fieldCounts: Record<string, number>;
}

function stripBOM(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function parseDateStr(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // German DD.MM.YYYY [HH:MM]
  const de = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[\sT]+(\d{1,2}):(\d{2}))?$/);
  if (de) {
    const [, d, m, y, h = '0', min = '0'] = de;
    const dt = new Date(+y, +m - 1, +d, +h, +min);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();
  return null;
}

function parseOnePageCSV(csvText: string): { leads: ParsedLead[]; stats: ParseStats } {
  const cleanText = stripBOM(csvText);

  // Detect delimiter (comma or semicolon)
  const firstLine = cleanText.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

  const result = Papa.parse<string[]>(cleanText, {
    header: false,
    skipEmptyLines: true,
    delimiter,
    transform: (value: string) => (typeof value === 'string' ? value.trim() : value),
  });

  if (!result.data || result.data.length < 2) {
    return { leads: [], stats: { totalRows: 0, skippedEmpty: 0, fieldCounts: {} } };
  }

  const headers = result.data[0].map((h) => (h || '').toString());
  const rows = result.data.slice(1);

  const fieldToIndexes: Record<string, number[]> = {
    vorname: [], nachname: [], email: [], telefon: [], unternehmen: [],
    nachricht: [], utm_source: [], utm_medium: [], utm_campaign: [],
    utm_content: [], utm_term: [], date: [],
  };

  headers.forEach((rawHeader, idx) => {
    const h = (rawHeader || '').toLowerCase().trim();
    if (!h) return;
    if (h === 'vorname' || h === 'first name' || h === 'name (first name)' || h === 'vor- & nachname' || h === 'firstname') {
      fieldToIndexes.vorname.push(idx);
    }
    if (h === 'nachname' || h === 'last name' || h === 'name (last name)' || h === 'lastname') {
      fieldToIndexes.nachname.push(idx);
    }
    if (h === 'email' || h === 'e-mail' || h === '📧 e-mail' || h === 'e-mail adresse' || h === 'mail' || h.startsWith('email ') || h.startsWith('e-mail ')) {
      fieldToIndexes.email.push(idx);
    }
    if (h === 'phone' || h === 'telefon' || h === 'phone number' || h === 'tel' || h === 'mobil' || h === 'mobile' || h === 'handy') {
      fieldToIndexes.telefon.push(idx);
    }
    if (h === 'unternehmen' || h === 'company' || h === 'firma') {
      fieldToIndexes.unternehmen.push(idx);
    }
    if (h === 'nachricht' || h === 'message' || h === 'textarea' || h === 'anmerkungen' || h === 'kommentar' || h === 'comment' || h.includes('besondere wünsche')) {
      fieldToIndexes.nachricht.push(idx);
    }
    if (h === 'utm source' || h === 'utm_source') fieldToIndexes.utm_source.push(idx);
    if (h === 'utm medium' || h === 'utm_medium') fieldToIndexes.utm_medium.push(idx);
    if (h === 'utm campaign' || h === 'utm_campaign') fieldToIndexes.utm_campaign.push(idx);
    if (h === 'utm content' || h === 'utm_content') fieldToIndexes.utm_content.push(idx);
    if (h === 'utm term' || h === 'utm_term') fieldToIndexes.utm_term.push(idx);
    if (h === 'date' || h === 'datum' || h === 'erstellt am' || h === 'created at' || h === 'created_at' || h === 'submitted at') {
      fieldToIndexes.date.push(idx);
    }
  });

  function isMeaningful(val: string | undefined): boolean {
    if (!val) return false;
    const t = val.trim();
    if (!t) return false;
    if (t === '+' || t === '-' || t === '–') return false;
    return true;
  }

  function firstNonEmpty(row: string[], indexes: number[]): string | null {
    for (const idx of indexes) {
      const v = row[idx];
      if (isMeaningful(v)) return v.trim();
    }
    return null;
  }

  const leads: ParsedLead[] = [];
  let skippedEmpty = 0;

  for (const row of rows) {
    if (!row || row.length === 0) { skippedEmpty++; continue; }

    const email = firstNonEmpty(row, fieldToIndexes.email);
    const vorname = firstNonEmpty(row, fieldToIndexes.vorname);
    const nachname = firstNonEmpty(row, fieldToIndexes.nachname);
    const telefon = firstNonEmpty(row, fieldToIndexes.telefon);

    if (!email && !vorname && !nachname && !telefon) {
      skippedEmpty++;
      continue;
    }

    const dateRaw = firstNonEmpty(row, fieldToIndexes.date);
    const received_at = parseDateStr(dateRaw) || new Date().toISOString();

    const raw_data: Record<string, string> = {};
    headers.forEach((header, idx) => {
      const v = row[idx];
      if (!isMeaningful(v)) return;
      const key = raw_data[header] !== undefined ? `${header}__${idx}` : header;
      raw_data[key] = v.trim();
    });

    leads.push({
      vorname, nachname, email, telefon,
      unternehmen: firstNonEmpty(row, fieldToIndexes.unternehmen),
      nachricht: firstNonEmpty(row, fieldToIndexes.nachricht),
      utm_source: firstNonEmpty(row, fieldToIndexes.utm_source),
      utm_medium: firstNonEmpty(row, fieldToIndexes.utm_medium),
      utm_campaign: firstNonEmpty(row, fieldToIndexes.utm_campaign),
      utm_content: firstNonEmpty(row, fieldToIndexes.utm_content),
      utm_term: firstNonEmpty(row, fieldToIndexes.utm_term),
      received_at,
      raw_data,
    });
  }

  const fieldCounts: Record<string, number> = {};
  Object.entries(fieldToIndexes).forEach(([k, arr]) => { fieldCounts[k] = arr.length; });

  return {
    leads,
    stats: { totalRows: rows.length, skippedEmpty, fieldCounts },
  };
}

function CsvImportModal({
  open, onOpenChange, projectId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<ParsedLead[]>([]);
  const [stats, setStats] = useState<ParseStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  function reset() {
    setLeads([]); setStats(null); setProgress(null); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  useEffect(() => { if (!open) reset(); }, [open]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { leads: parsedLeads, stats: parsedStats } = parseOnePageCSV(String(reader.result || ''));
        setLeads(parsedLeads);
        setStats(parsedStats);
        if (parsedLeads.length === 0) {
          toast.error(`Keine Leads gefunden (${parsedStats.totalRows} Zeilen analysiert)`);
        }
      } catch (err: any) {
        toast.error(`CSV-Fehler: ${err.message}`);
      }
    };
    reader.readAsText(f);
  }

  async function doImport() {
    setImporting(true);
    setProgress({ done: 0, total: leads.length });
    const res = { inserted: 0, skipped: 0, errors: [] as string[] };

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      try {
        // Dedupe check on (project, lower(email), received_at)
        if (lead.email) {
          const { data: existing } = await supabase
            .from('onepage_project_leads')
            .select('id')
            .eq('project_id', projectId)
            .ilike('email', lead.email)
            .eq('received_at', lead.received_at)
            .maybeSingle();
          if (existing) {
            res.skipped++;
            setProgress({ done: i + 1, total: leads.length });
            continue;
          }
        }

        const payload: Record<string, unknown> = {
          ...lead.raw_data,
          _parsed_unternehmen: lead.unternehmen,
          _parsed_utm_content: lead.utm_content,
          _parsed_utm_term: lead.utm_term,
        };

        const { error } = await supabase.from('onepage_project_leads').insert({
          project_id: projectId,
          vorname: lead.vorname,
          nachname: lead.nachname,
          email: lead.email,
          telefon: lead.telefon,
          nachricht: lead.nachricht,
          utm_source: lead.utm_source,
          utm_medium: lead.utm_medium,
          utm_campaign: lead.utm_campaign,
          utm_content: lead.utm_content,
          utm_term: lead.utm_term,
          unternehmen: lead.unternehmen,
          received_at: lead.received_at,
          imported_via: 'csv',
          payload,
        } as never);

        if (error) {
          if (error.code === '23505') res.skipped++;
          else res.errors.push(`${lead.email || lead.vorname || 'Zeile ' + (i + 1)}: ${error.message}`);
        } else {
          res.inserted++;
        }
      } catch (e: any) {
        res.errors.push(`${lead.email || 'Zeile ' + (i + 1)}: ${e.message}`);
      }
      setProgress({ done: i + 1, total: leads.length });
    }

    setImporting(false);
    setResult(res);

    if (res.inserted > 0) {
      toast.success(
        `${res.inserted} Leads importiert${res.skipped ? `, ${res.skipped} Duplikate übersprungen` : ''}`
      );
      onDone();
    } else if (res.skipped > 0 && res.errors.length === 0) {
      toast.info(`Alle ${res.skipped} Leads waren bereits vorhanden`);
      onDone();
    } else {
      toast.error('Keine Leads importiert');
    }
  }

  const previewLeads = leads.slice(0, 5);
  const hasData = leads.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leads aus CSV importieren</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!hasData && !stats ? (
            <div>
              <Label>CSV-Datei wählen</Label>
              <Input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="mt-1.5" />
              <p className="text-xs text-muted-foreground mt-2">
                Unterstützt OnePage-Exports mit beliebig vielen Spalten und doppelten Spaltennamen.
                BOM, ISO- und deutsche Datumsformate werden automatisch erkannt.
              </p>
            </div>
          ) : null}

          {stats && !hasData && (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
              <div className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Keine Leads importiert
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.totalRows} Zeilen analysiert, {stats.skippedEmpty} übersprungen (leer).
              </div>
              <div className="text-xs space-y-0.5">
                <div>Erkannte Spalten: Email ({stats.fieldCounts.email ?? 0}), Vorname ({stats.fieldCounts.vorname ?? 0}), Telefon ({stats.fieldCounts.telefon ?? 0})</div>
                <div className="text-muted-foreground">
                  Mögliche Ursachen: CSV ist leer, unbekanntes Format oder geänderte Spaltennamen.
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Andere Datei wählen</Button>
            </div>
          )}

          {hasData && !result && (
            <>
              <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  CSV erkannt: OnePage Export
                </div>
                <div className="text-xs text-muted-foreground">
                  📊 {leads.length} Leads gefunden
                  {stats && stats.skippedEmpty > 0 && <> · ⚠️ {stats.skippedEmpty} Zeilen ohne Daten übersprungen</>}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Vorschau (erste 5 Leads)</Label>
                <div className="border rounded mt-1.5 overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Vorname</th>
                        <th className="px-2 py-1.5 text-left font-medium">Nachname</th>
                        <th className="px-2 py-1.5 text-left font-medium">Email</th>
                        <th className="px-2 py-1.5 text-left font-medium">Telefon</th>
                        <th className="px-2 py-1.5 text-left font-medium">Unternehmen</th>
                        <th className="px-2 py-1.5 text-left font-medium">UTM Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewLeads.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{l.vorname || '–'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{l.nachname || '–'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[180px]">{l.email || '–'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[140px]">{l.telefon || '–'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[140px]">{l.unternehmen || '–'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{l.utm_source || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {importing && progress && (
                <div className="text-xs text-muted-foreground">
                  Verarbeite {progress.done} / {progress.total} Leads…
                </div>
              )}
            </>
          )}

          {result && (
            <div className="rounded border bg-muted/30 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Import abgeschlossen
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• {result.inserted} Leads importiert</li>
                <li>• {result.skipped} Duplikate übersprungen</li>
                <li>• {result.errors.length} Fehler</li>
              </ul>
              {result.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Fehlerdetails anzeigen</summary>
                  <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <li key={i} className="text-destructive break-words">{e}</li>
                    ))}
                    {result.errors.length > 5 && <li className="text-muted-foreground">… und {result.errors.length - 5} weitere</li>}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {hasData && !importing && !result && (
            <Button variant="ghost" onClick={reset}>Andere Datei wählen</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Schließen' : 'Abbrechen'}
          </Button>
          {hasData && !result && (
            <Button disabled={importing} onClick={doImport}>
              {importing
                ? `Importiere ${progress?.done ?? 0}/${progress?.total ?? leads.length}…`
                : `${leads.length} Leads importieren`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
