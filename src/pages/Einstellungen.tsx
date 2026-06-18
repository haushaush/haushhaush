import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Bell, Palette, Users, Hash, X, Check, Loader2, Upload, Building2, ImageIcon, Trash2, AlertTriangle, UserPlus, ChevronDown, ChevronRight, GitMerge, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { CreateTeamMemberTab } from '@/components/settings/CreateTeamMemberTab';
import { ImportOrphanModal } from '@/components/settings/ImportOrphanModal';
import { SecuritySettingsTab } from '@/components/settings/SecuritySettingsTab';
import { SlackChannelsTab } from '@/components/settings/SlackChannelsTab';
import { SlackListsTab } from '@/components/settings/SlackListsTab';
import { usePreferences } from '@/hooks/usePreferences';

function AriaVisibilityCard() {
  const { showAria, setShowAria, loading } = usePreferences();
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />Darstellung
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">ARIA-Assistent anzeigen</p>
            <p className="text-xs text-muted-foreground">Blendet die schwebende ARIA-Hilfeleiste ein/aus.</p>
          </div>
          <Switch
            checked={showAria}
            disabled={loading}
            onCheckedChange={async (v) => {
              try {
                await setShowAria(v);
                toast.success(v ? 'ARIA-Assistent aktiviert' : 'ARIA-Assistent ausgeblendet');
              } catch (e: any) {
                toast.error('Speichern fehlgeschlagen: ' + (e?.message ?? 'unbekannt'));
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}


interface EmployeeRequest {
  id: string;
  user_id: string | null;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string | null;
  geburtsdatum: string | null;
  position: string | null;
  abteilung: string | null;
  vertragsart: string | null;
  startdatum: string | null;
  ueber_mich: string | null;
  notfall_name: string | null;
  notfall_telefon: string | null;
  adresse: string | null;
  iban: string | null;
  profilbild_url: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notiz: string | null;
  created_at: string;
}




function SlackWebhookConfig() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'slack_tech_support_webhook')
        .maybeSingle();
      if (data?.value) {
        setWebhookUrl(typeof data.value === 'string' ? data.value : (data.value as any)?.url || String(data.value));
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('app_settings').upsert(
      { key: 'slack_tech_support_webhook', value: webhookUrl.trim() as any, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    setSaving(false);
    if (error) { toast.error('Fehler beim Speichern'); return; }
    toast.success('Webhook URL gespeichert ✓');
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) { toast.error('Bitte zuerst eine URL eingeben'); return; }
    setTesting(true);
    try {
      const res = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '✅ Agency Hub Webhook-Verbindung erfolgreich!',
          blocks: [{
            type: 'section',
            text: { type: 'mrkdwn', text: '✅ *Webhook-Test erfolgreich!*\nDas Agency Hub Dashboard ist jetzt mit #tech-support verbunden.' }
          }]
        }),
      });
      if (res.ok) toast.success('✓ Webhook funktioniert!');
      else toast.error(`❌ Webhook fehlgeschlagen (${res.status})`);
    } catch {
      toast.error('❌ Webhook-URL ungültig oder nicht erreichbar');
    }
    setTesting(false);
  };

  if (loading) return <Skeleton className="h-40" />;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          Slack Tech Support Webhook
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bug-Reports und Support-Tickets werden an diesen Slack-Channel gesendet.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Webhook URL</Label>
          <Input
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="mt-1 font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Slack → Apps → Incoming WebHooks → Channel wählen → URL kopieren
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !webhookUrl.trim()} size="sm">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Speichern...</> : 'Speichern'}
          </Button>
          <Button onClick={handleTest} disabled={testing || !webhookUrl.trim()} variant="outline" size="sm">
            {testing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Testen...</> : 'Testen'}
          </Button>
        </div>
        {!webhookUrl.trim() && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive">
            ⚠️ Keine Webhook URL konfiguriert — Bug-Reports und Support-Tickets werden nicht an Slack gesendet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompanyLogoManager() {
  const [logos, setLogos] = useState<{ unternehmen: string; logo_url: string | null; bg_color: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchLogos = async () => {
    const { data } = await supabase.from('company_logos').select('*').order('unternehmen');
    setLogos((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogos(); }, []);

  const handleUpload = async (unternehmen: string, file: File) => {
    setUploading(unternehmen);
    const ext = file.name.split('.').pop() || 'png';
    const path = `${unternehmen.replace(/\s+/g, '_').toLowerCase()}.${ext}`;

    // Remove old file if exists
    await supabase.storage.from('company-logos').remove([path]);

    const { error: upErr } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
    if (upErr) { toast.error('Upload fehlgeschlagen'); setUploading(null); return; }

    const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
    const logoUrl = urlData.publicUrl + '?t=' + Date.now();

    await supabase.from('company_logos').update({ logo_url: logoUrl } as any).eq('unternehmen', unternehmen);
    toast.success(`Logo für ${unternehmen} gespeichert`);
    setUploading(null);
    fetchLogos();
  };

  if (loading) return <Skeleton className="h-40" />;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Unternehmens-Logos
        </CardTitle>
        <p className="text-xs text-muted-foreground">Logos werden in den Kunden-Karten angezeigt.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {logos.map(l => (
          <div key={l.unternehmen} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            {/* Preview */}
            <div
              className="h-10 w-16 rounded flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: l.bg_color || '#374151' }}
            >
              {l.logo_url ? (
                <img src={l.logo_url} alt={l.unternehmen} className="h-6 object-contain brightness-0 invert" />
              ) : (
                <ImageIcon className="h-4 w-4 text-white/40" />
              )}
            </div>

            {/* Name */}
            <span className="text-sm font-medium flex-1 min-w-0 truncate">{l.unternehmen}</span>

            {/* Upload */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(l.unternehmen, f);
                  e.target.value = '';
                }}
                disabled={uploading === l.unternehmen}
              />
              <Button variant="outline" size="sm" asChild disabled={uploading === l.unternehmen}>
                <span>
                  {uploading === l.unternehmen ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Lädt...</>
                  ) : (
                    <><Upload className="h-3 w-3 mr-1" /> Logo hochladen</>
                  )}
                </span>
              </Button>
            </label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Einstellungen() {
  const { user, isAdminOrManager, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const defaultTab = 'branding';
  const adminOnlyTabs = ['mitarbeiter-erstellen'];
  const allowedTabs = isAdmin
    ? ['branding', 'mitarbeiter-erstellen', 'benachrichtigungen', 'sicherheit', 'slack']
    : ['branding', 'benachrichtigungen', 'sicherheit', 'slack'];
  const activeTab = requestedTab && allowedTabs.includes(requestedTab) ? requestedTab : defaultTab;

  // Redirect non-admins away from admin-only tabs
  useEffect(() => {
    if (!isAdmin && requestedTab && adminOnlyTabs.includes(requestedTab)) {
      toast.error('Dieser Bereich ist nur für Administratoren');
      const params = new URLSearchParams(searchParams);
      params.set('tab', 'branding');
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, requestedTab]);

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params, { replace: true });
  };

  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<EmployeeRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    const [teamRes, reqRes] = await Promise.all([
      supabase.from('team').select('*').order('name'),
      isAdminOrManager ? supabase.from('employee_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    setTeam(teamRes.data || []);
    setRequests((reqRes.data || []) as EmployeeRequest[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, isAdminOrManager, isAdmin]);

  const showDeleteError = (raw: string, hint?: string) => {
    const isFkError =
      raw.includes('Database error deleting user') ||
      raw.includes('foreign key') ||
      raw.includes('violates') ||
      raw.includes('23503');
    if (isFkError) {
      toast.error('Löschung fehlgeschlagen', {
        description:
          hint ||
          'Der User hat noch verknüpfte Daten in der Datenbank. Bitte Admin kontaktieren.',
        duration: 8000,
      });
    } else {
      toast.error(raw, { description: hint, duration: 6000 });
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('delete-team-member', {
      body: { user_id: deleteTarget.id, confirm_name: deleteConfirmName },
    });
    setDeleting(false);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      showDeleteError(errMsg, (data as any)?.hint);
      return;
    }
    toast.success(`${deleteTarget.name} wurde gelöscht`);
    setDeleteTarget(null);
    setDeleteConfirmName('');
    fetchData();
  };



  const pendingCount = requests.filter(r => r.status === 'Ausstehend').length;

  // Employee request handlers
  const openDrawer = (req: EmployeeRequest) => {
    setSelectedReq(req);
    setAdminNote(req.admin_notiz || '');
    setDrawerOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedReq) return;
    await supabase.from('employee_requests').update({
      status: 'Genehmigt', reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(), admin_notiz: adminNote || null,
    }).eq('id', selectedReq.id);
    await supabase.from('team').insert({
      name: `${selectedReq.vorname} ${selectedReq.nachname}`,
      email: selectedReq.email, rolle: 'Setter' as any,
      department: selectedReq.abteilung || 'Sales',
      startdatum: selectedReq.startdatum || new Date().toISOString().split('T')[0],
    });
    toast.success('Mitarbeiter wurde freigeschaltet');
    setDrawerOpen(false);
    fetchData();
  };

  const handleReject = async () => {
    if (!selectedReq) return;
    await supabase.from('employee_requests').update({
      status: 'Abgelehnt', reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(), admin_notiz: rejectReason || adminNote || null,
    }).eq('id', selectedReq.id);
    toast.success('Anfrage wurde abgelehnt');
    setRejectOpen(false); setDrawerOpen(false); setRejectReason('');
    fetchData();
  };

  const maskIban = (iban: string | null) => {
    if (!iban || iban.length < 6) return iban || '–';
    return iban.slice(0, 4) + ' •••• ••••';
  };

  const statusBadge = (status: string) => {
    if (status === 'Ausstehend') return <Badge className="bg-warning/15 text-warning border-0 text-xs">Ausstehend</Badge>;
    if (status === 'Genehmigt') return <Badge className="bg-success/15 text-success border-0 text-xs">Genehmigt</Badge>;
    if (status === 'Abgelehnt') return <Badge className="bg-destructive/15 text-destructive border-0 text-xs">Abgelehnt</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Einstellungen</h1>

      {window.location.hostname.includes('lovableproject.com') && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
          <span className="text-warning text-lg shrink-0">⚠</span>
          <div className="min-w-0">
            <p className="font-medium text-foreground text-xs">Du befindest dich in der Lovable Preview</p>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Einstellungen und Verbindungen hier nicht speichern — nutze die{' '}
              <a
                href="https://haushhaush.lovable.app/einstellungen"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline font-medium"
              >
                Live-App
              </a>
              {' '}um Integrationen dauerhaft zu konfigurieren.
            </p>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="branding">Branding</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="mitarbeiter-erstellen">Mitarbeiter erstellen</TabsTrigger>
          )}
          <TabsTrigger value="benachrichtigungen">Benachrichtigungen</TabsTrigger>
          <TabsTrigger value="sicherheit">Sicherheit</TabsTrigger>
          <TabsTrigger value="slack" className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Slack
          </TabsTrigger>
        </TabsList>




        <TabsContent value="branding" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Logo & Branding</CardTitle></CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                <p className="text-sm">Logo hierher ziehen oder klicken</p>
                <p className="text-xs mt-1">PNG, SVG bis 2MB</p>
              </div>
            </CardContent>
          </Card>
          {[
            { name: 'Viral Connect GmbH', gf: 'Noah Mrosek', fmt: 'VC-2026-001' },
            { name: 'Haush Haush Digital UG', gf: 'Maximilian Büsse', fmt: 'HH-2026-001' },
          ].map(e => (
            <Card key={e.name} className="border-border bg-card">
              <CardHeader><CardTitle className="text-base">{e.name}</CardTitle><p className="text-xs text-muted-foreground">GF: {e.gf}</p></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Adresse</Label><Input placeholder="Musterstr. 1, 12345 Berlin" /></div>
                  <div><Label>USt-ID</Label><Input placeholder="DE123456789" /></div>
                  <div><Label>Steuernummer</Label><Input placeholder="12/345/67890" /></div>
                  <div><Label>IBAN</Label><Input placeholder="DE89 3704 0044 ..." /></div>
                  <div><Label>BIC</Label><Input placeholder="COBADEFFXXX" /></div>
                  <div><Label>Rechnungsnr.-Format</Label><Input value={e.fmt} readOnly className="bg-muted" /></div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Unternehmens-Logos */}
          <CompanyLogoManager />
        </TabsContent>


        {/* ═══════ MITARBEITER ERSTELLEN TAB ═══════ */}
        {isAdmin && (
          <TabsContent value="mitarbeiter-erstellen" className="mt-6">
            <CreateTeamMemberTab />
          </TabsContent>
        )}

        {/* ═══════ BENACHRICHTIGUNGEN TAB ═══════ */}
        <TabsContent value="benachrichtigungen" className="mt-4 space-y-6">
          {isAdminOrManager && <SlackWebhookConfig />}
          <AriaVisibilityCard />
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Benachrichtigungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Neuer Abschluss', desc: 'Admin + Customer Success', channels: ['In-App', 'Email'] },
                { label: 'Rechnung überfällig', desc: 'Nach 14 Tagen → Admin', channels: ['Email'] },
                { label: 'Laufzeit endet <14 Tage', desc: 'Zugewiesenes Teammitglied', channels: ['In-App', 'Email'] },
                { label: 'Setter KPI Alert', desc: 'Management', channels: ['Email'] },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-foreground">{n.label}</p><p className="text-xs text-muted-foreground">{n.desc}</p></div>
                  <div className="flex gap-3">
                    {n.channels.map(c => (
                      <div key={c} className="flex items-center gap-1.5"><Switch /><span className="text-xs text-muted-foreground">{c}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ SICHERHEIT TAB ═══════ */}
        <TabsContent value="sicherheit" className="mt-4 space-y-6">
          <SecuritySettingsTab />
        </TabsContent>

        {/* ═══════ SLACK TAB ═══════ */}
        <TabsContent value="slack" className="mt-6 space-y-6">
          <SlackChannelsTab />
          <SlackListsTab />
          <SlackWebhookConfig />
        </TabsContent>

      </Tabs>

      {/* Employee Request Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
          {selectedReq && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-4">
                  {selectedReq.profilbild_url ? (
                    <img src={selectedReq.profilbild_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-semibold text-lg">
                      {selectedReq.vorname[0]}{selectedReq.nachname[0]}
                    </div>
                  )}
                  <div>
                    <SheetTitle className="text-lg">{selectedReq.vorname} {selectedReq.nachname}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{selectedReq.position} · {selectedReq.abteilung}</p>
                    <div className="mt-1">{statusBadge(selectedReq.status)}</div>
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs">E-Mail</p><p className="font-medium">{selectedReq.email}</p></div>
                <div><p className="text-muted-foreground text-xs">Telefon</p><p className="font-medium">{selectedReq.telefon || '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Geburtsdatum</p><p className="font-medium">{selectedReq.geburtsdatum ? new Date(selectedReq.geburtsdatum).toLocaleDateString('de-DE') : '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Startdatum</p><p className="font-medium">{selectedReq.startdatum ? new Date(selectedReq.startdatum).toLocaleDateString('de-DE') : '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Vertragsart</p><p className="font-medium">{selectedReq.vertragsart || '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Adresse</p><p className="font-medium">{selectedReq.adresse || '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">IBAN</p><p className="font-medium">{maskIban(selectedReq.iban)}</p></div>
                <div><p className="text-muted-foreground text-xs">Notfall-Kontakt</p><p className="font-medium">{selectedReq.notfall_name ? `${selectedReq.notfall_name} (${selectedReq.notfall_telefon || '–'})` : '–'}</p></div>
              </div>

              {selectedReq.ueber_mich && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Über mich</p>
                  <p className="text-sm text-foreground bg-muted rounded-lg p-3">{selectedReq.ueber_mich}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Interne Anmerkung (nur für Admins)</Label>
                <Textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="z.B. Wurde im Interview überzeugt, Start Q2..."
                  className="mt-1 min-h-[60px]"
                  onBlur={async () => {
                    if (selectedReq.admin_notiz !== adminNote) {
                      await supabase.from('employee_requests').update({ admin_notiz: adminNote }).eq('id', selectedReq.id);
                    }
                  }}
                  disabled={selectedReq.status !== 'Ausstehend'}
                />
              </div>

              {selectedReq.status === 'Ausstehend' ? (
                <div className="space-y-2">
                  <Button className="w-full h-12 rounded-[10px] bg-success hover:bg-success/90 text-success-foreground" onClick={handleApprove}>
                    <Check className="h-4 w-4 mr-2" /> Genehmigen
                  </Button>
                  <Button variant="outline" className="w-full h-12 rounded-[10px] text-destructive hover:bg-destructive/10 border-destructive" onClick={() => setRejectOpen(true)}>
                    <X className="h-4 w-4 mr-2" /> Ablehnen
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
                  {selectedReq.status === 'Genehmigt' ? '✓ Genehmigt' : '✗ Abgelehnt'}
                  {selectedReq.reviewed_at && ` am ${new Date(selectedReq.reviewed_at).toLocaleDateString('de-DE')}`}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Anfrage ablehnen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Grund für Ablehnung</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Begründung eingeben..." className="min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleReject}>Ablehnen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmName(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Mitarbeiter löschen
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-foreground">
                  Diese Aktion ist <span className="text-destructive">unwiderruflich</span>.
                </p>
                <p className="text-muted-foreground mt-1">
                  Das Konto, alle Rollen und Berechtigungen von <span className="font-medium text-foreground">{deleteTarget.name}</span> werden permanent entfernt. Der Mitarbeiter verliert sofort den Zugriff auf das Portal.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{deleteTarget.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">E-Mail</span><span className="font-mono text-xs">{deleteTarget.email}</span></div>
                {deleteTarget.department && <div className="flex justify-between"><span className="text-muted-foreground">Abteilung</span><span>{deleteTarget.department}</span></div>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delete-confirm" className="text-xs">
                  Tippe <span className="font-mono font-semibold text-foreground">{deleteTarget.name}</span> zur Bestätigung
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={deleteTarget.name}
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); }} disabled={deleting}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteMember}
              disabled={
                deleting ||
                !deleteTarget ||
                deleteConfirmName.trim().toLowerCase() !== String(deleteTarget?.name || '').trim().toLowerCase()
              }
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lösche...</> : <><Trash2 className="h-4 w-4 mr-2" />Endgültig löschen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
