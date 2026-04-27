import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { extractLead } from '@/lib/onepage-lead-extractor';
import {
  ArrowLeft, ExternalLink, Copy, Upload, Download, Search,
  RefreshCw, Trash2, AlertTriangle, CheckCircle2, Clock, Send, Inbox,
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
import { useAuth } from '@/contexts/AuthContext';

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
  const [tab, setTab] = useState<'leads' | 'webhook' | 'logs' | 'settings'>('leads');

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

  async function sendTestWebhook() {
    if (!project) return;
    const testPayload = {
      first_name: 'Test',
      last_name: 'Webhook',
      email: `test+${Date.now()}@beispiel.de`,
      phone: '+491234567890',
      message: 'Dies ist ein Test-Webhook aus dem Portal',
      utm_source: 'manual_test',
      utm_medium: 'portal',
      utm_campaign: 'webhook_test',
      date: new Date().toISOString(),
    };
    try {
      toast.info('Test-Webhook wird gesendet…');
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Test-Webhook erfolgreich – siehe Tab „Webhook Logs"');
        setTab('logs');
        setTimeout(() => loadAll(), 1500);
      } else {
        toast.error(`Test fehlgeschlagen: ${json.error || json.detail || res.statusText}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Netzwerkfehler: ${msg}`);
    }
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'leads' | 'webhook' | 'logs' | 'settings')}>
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="webhook">Webhook-Einrichtung</TabsTrigger>
          <TabsTrigger value="logs">Webhook Logs</TabsTrigger>
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

              <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
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
                <Button variant="outline" size="sm" onClick={sendTestWebhook}>
                  <Send className="h-3.5 w-3.5 mr-2" /> Test-Webhook senden
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === WEBHOOK LOGS === */}
        <TabsContent value="logs" className="mt-6">
          <WebhookLogsTab projectId={project.id} webhookToken={project.webhook_secret} />
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

  function isMeaningful(val: string | undefined): boolean {
    if (!val) return false;
    const t = val.trim();
    if (!t) return false;
    if (t === '+' || t === '-' || t === '–') return false;
    return true;
  }

  // Convert a CSV row into a flat key/value object that extractLead understands.
  // Duplicate header names are preserved by appending an index suffix so no data is lost.
  function rowToObject(row: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (!isMeaningful(v)) return;
      const key = obj[h] !== undefined ? `${h}__${idx}` : h;
      obj[key] = v.trim();
    });
    return obj;
  }

  const leads: ParsedLead[] = [];
  let skippedEmpty = 0;
  const fieldCounts: Record<string, number> = {
    email: 0, vorname: 0, nachname: 0, telefon: 0, unternehmen: 0,
    nachricht: 0, utm_source: 0, utm_medium: 0, utm_campaign: 0,
    utm_content: 0, utm_term: 0, date_parsed: 0,
  };

  for (const row of rows) {
    if (!row || row.length === 0) { skippedEmpty++; continue; }

    const rowObj = rowToObject(row);
    if (Object.keys(rowObj).length === 0) { skippedEmpty++; continue; }

    const extracted = extractLead(rowObj);

    if (!extracted.email && !extracted.vorname && !extracted.nachname && !extracted.telefon) {
      skippedEmpty++;
      continue;
    }

    if (extracted.email) fieldCounts.email++;
    if (extracted.vorname) fieldCounts.vorname++;
    if (extracted.nachname) fieldCounts.nachname++;
    if (extracted.telefon) fieldCounts.telefon++;
    if (extracted.unternehmen) fieldCounts.unternehmen++;
    if (extracted.nachricht) fieldCounts.nachricht++;
    if (extracted.utm_source) fieldCounts.utm_source++;
    if (extracted.utm_medium) fieldCounts.utm_medium++;
    if (extracted.utm_campaign) fieldCounts.utm_campaign++;
    if (extracted.utm_content) fieldCounts.utm_content++;
    if (extracted.utm_term) fieldCounts.utm_term++;

    leads.push({
      vorname: extracted.vorname,
      nachname: extracted.nachname,
      email: extracted.email,
      telefon: extracted.telefon,
      unternehmen: extracted.unternehmen,
      nachricht: extracted.nachricht,
      utm_source: extracted.utm_source,
      utm_medium: extracted.utm_medium,
      utm_campaign: extracted.utm_campaign,
      utm_content: extracted.utm_content,
      utm_term: extracted.utm_term,
      received_at: extracted.created_at,
      raw_data: rowObj,
    });
  }

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
  const { isTestMode } = useAuth();
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

    try {
      const payload = leads.map((lead) => ({
        vorname: lead.vorname,
        nachname: lead.nachname,
        email: lead.email,
        telefon: lead.telefon,
        nachricht: lead.nachricht,
        unternehmen: lead.unternehmen,
        utm_source: lead.utm_source,
        utm_medium: lead.utm_medium,
        utm_campaign: lead.utm_campaign,
        utm_content: lead.utm_content,
        utm_term: lead.utm_term,
        received_at: lead.received_at,
        raw_data: {
          ...lead.raw_data,
          _parsed_unternehmen: lead.unternehmen,
          _parsed_utm_content: lead.utm_content,
          _parsed_utm_term: lead.utm_term,
        },
      }));

      const { data, error } = await supabase.functions.invoke('import-onepage-leads', {
        body: { projectId, leads: payload, testMode: isTestMode },
        headers: isTestMode ? { 'x-test-mode': 'true' } : undefined,
      });

      if (error) throw new Error(error.message || 'Import-Funktion nicht erreichbar');
      if (data?.error) throw new Error(data.error);

      const res = {
        inserted: data?.inserted ?? 0,
        skipped: data?.skipped ?? 0,
        errors: (data?.errors ?? []) as string[],
      };
      setProgress({ done: leads.length, total: leads.length });
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
    } catch (e: any) {
      setImporting(false);
      setResult({ inserted: 0, skipped: 0, errors: [e.message || String(e)] });
      toast.error(`Import fehlgeschlagen: ${e.message || e}`);
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

// ─── Webhook Logs Tab ───
interface WebhookLog {
  id: string;
  project_id: string | null;
  token: string | null;
  content_type: string | null;
  payload: Record<string, unknown> | null;
  raw_body: string | null;
  user_agent: string | null;
  status: string;
  error: string | null;
  received_at: string;
}

function WebhookStatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    success: { className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', label: '✅ Erfolg' },
    received: { className: 'bg-sky-500/10 text-sky-600 border-sky-500/30', label: '⏳ Empfangen' },
    duplicate: { className: 'bg-slate-500/10 text-slate-600 border-slate-500/30', label: '↩︎ Duplikat' },
    insert_failed: { className: 'bg-red-500/10 text-red-600 border-red-500/30', label: '❌ DB-Fehler' },
    lookup_failed: { className: 'bg-red-500/10 text-red-600 border-red-500/30', label: '❌ Lookup' },
    unknown_token: { className: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: '⚠️ Token unbekannt' },
    missing_token: { className: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: '⚠️ Token fehlt' },
  };
  const cfg = map[status] || { className: 'bg-muted text-muted-foreground border-border', label: status };
  return (
    <Badge variant="outline" className={cn('rounded text-[10px] font-medium', cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

function WebhookLogsTab({ projectId, webhookToken }: { projectId: string; webhookToken: string }) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [selected, setSelected] = useState<WebhookLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('onepage_webhook_logs')
      .select('*')
      .or(`project_id.eq.${projectId},token.eq.${webhookToken}`)
      .order('received_at', { ascending: false })
      .limit(100);
    if (error) {
      // RLS may block non-admins
      if (!error.message.toLowerCase().includes('row-level')) {
        toast.error(`Logs konnten nicht geladen werden: ${error.message}`);
      }
    }
    setLogs((data || []) as WebhookLog[]);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, webhookToken]);

  const filtered = logs.filter((l) => {
    if (filter === 'success') return l.status === 'success';
    if (filter === 'failed') return l.status !== 'success' && l.status !== 'received' && l.status !== 'duplicate';
    return true;
  });

  const successCount = logs.filter((l) => l.status === 'success').length;
  const failedCount = logs.filter((l) => l.status !== 'success' && l.status !== 'received' && l.status !== 'duplicate').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          Alle ({logs.length})
        </Button>
        <Button
          variant={filter === 'success' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('success')}
        >
          ✅ Erfolgreich ({successCount})
        </Button>
        <Button
          variant={filter === 'failed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('failed')}
        >
          ❌ Fehler ({failedCount})
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={refreshing}
          className="ml-auto"
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
          Aktualisieren
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Auto-Refresh alle 5 Sekunden · zeigt bis zu 100 Events
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Lade Logs…</div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Noch keine Webhook-Events empfangen</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Sobald OnePage einen Lead an deinen Webhook sendet, erscheint er hier in Echtzeit.
              Nutze den Button „Test-Webhook senden" auf dem Tab „Webhook-Einrichtung", um die Pipeline zu prüfen.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Keine Treffer für diesen Filter.
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Zeitpunkt</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">E-Mail</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const email =
                  (log.payload as Record<string, unknown> | null)?.email ??
                  (log.payload as Record<string, unknown> | null)?.Email ??
                  null;
                return (
                  <tr
                    key={log.id}
                    onClick={() => setSelected(log)}
                    className="border-t hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {relativeTime(log.received_at)}
                    </td>
                    <td className="px-3 py-2"><WebhookStatusBadge status={log.status} /></td>
                    <td className="px-3 py-2 truncate max-w-[260px]">
                      {email ? String(email) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[280px]">
                      {log.error || (log.status === 'success' ? 'Lead erstellt' : log.status === 'duplicate' ? 'Bereits vorhanden' : '–')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Webhook-Event Details</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="space-y-2">
                <Field label="Zeitpunkt" value={new Date(selected.received_at).toLocaleString('de-DE')} />
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="col-span-2"><WebhookStatusBadge status={selected.status} /></div>
                </div>
                <Field label="Content-Type" value={selected.content_type} />
                <Field label="User-Agent" value={selected.user_agent} />
                <Field label="Token" value={selected.token ? `${selected.token.substring(0, 12)}…` : null} />
              </div>

              {selected.error && (
                <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-xs">
                  <div className="font-medium text-red-600 mb-1">Fehler</div>
                  <div className="break-words">{selected.error}</div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Payload</div>
                <pre className="bg-muted/50 border rounded p-2 text-[10px] overflow-auto max-h-72">
                  {JSON.stringify(selected.payload || {}, null, 2)}
                </pre>
              </div>

              {selected.raw_body && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Raw Body</div>
                  <pre className="bg-muted/50 border rounded p-2 text-[10px] overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {selected.raw_body}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
