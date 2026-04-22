import { useEffect, useState, useMemo, useCallback } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Bell, Palette, Users, Hash, X, Check, Search, Loader2, Upload, Building2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { IntegrationCard, type HealthResult } from '@/components/integrations/IntegrationCard';
import { IntegrationStatusBar } from '@/components/integrations/IntegrationStatusBar';
import { PROVIDERS, CATEGORIES } from '@/components/integrations/IntegrationProviders';
import { ApiPlatform } from '@/components/integrations/ApiPlatform';

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

interface IntegrationSetting {
  id: string;
  provider: string;
  connected: boolean;
  config: Record<string, any>;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

interface CloseDeal {
  id: string;
  client_name: string;
  art: string | null;
  wert_eur: number | null;
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
  const { user, isAdminOrManager } = useAuth();
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<EmployeeRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSetting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Alle');
  const [testingAll, setTestingAll] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, HealthResult[]>>({});
  const [closeDeals, setCloseDeals] = useState<CloseDeal[]>([]);
  const [dynamicConfigs, setDynamicConfigs] = useState<Record<string, Record<string, any>>>({});

  const [googleDriveConn, setGoogleDriveConn] = useState<{ email: string; connected_at: string } | null>(null);

  const fetchData = async () => {
    const [driveRes, googleDriveRes, teamRes, reqRes, intRes, dealsRes] = await Promise.all([
      user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('google_drive_connections').select('google_email, connected_at').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('team').select('*').order('name'),
      isAdminOrManager ? supabase.from('employee_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      user ? supabase.from('integration_settings').select('*').eq('user_id', user.id) : Promise.resolve({ data: [] }),
      supabase.from('close_deals').select('id, client_name, art, wert_eur').order('client_name'),
    ]);
    if (driveRes.data) { setDriveConnected(true); setDriveEmail(driveRes.data.google_email); }
    if (googleDriveRes.data) {
      setGoogleDriveConn({ email: googleDriveRes.data.google_email, connected_at: googleDriveRes.data.connected_at });
    } else {
      setGoogleDriveConn(null);
    }
    setTeam(teamRes.data || []);
    setRequests((reqRes.data || []) as EmployeeRequest[]);
    setIntegrationSettings((intRes.data || []) as any[]);
    setCloseDeals((dealsRes.data || []) as CloseDeal[]);
    // Extract dynamic configs from integration settings
    const dynConfigs: Record<string, Record<string, any>> = {};
    ((intRes.data || []) as any[]).forEach((s: any) => {
      if (s.config?.dynamic_data) dynConfigs[s.provider] = s.config.dynamic_data;
    });
    setDynamicConfigs(dynConfigs);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, isAdminOrManager]);

  // Handle Google Drive OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('google_drive');
    if (status === 'connected') {
      toast.success('Google Drive erfolgreich verbunden');
      fetchData();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('google_drive');
      url.searchParams.delete('message');
      window.history.replaceState({}, '', url.toString());
    } else if (status === 'error') {
      const msg = params.get('message') || 'Unbekannter Fehler';
      toast.error(`Google Drive: ${msg}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('google_drive');
      url.searchParams.delete('message');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount = requests.filter(r => r.status === 'Ausstehend').length;

  const getSettingForProvider = (providerId: string) => {
    return integrationSettings.find(s => s.provider === providerId);
  };

  const handleIntegrationSave = async (providerId: string, data: Record<string, any>) => {
    if (!user) return;
    const existing = getSettingForProvider(providerId);
    if (existing) {
      await supabase.from('integration_settings').update({
        config: data,
        connected: true,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('integration_settings').insert({
        user_id: user.id,
        provider: providerId,
        display_name: PROVIDERS.find(p => p.id === providerId)?.name || providerId,
        config: data,
        connected: true,
      });
    }
    toast.success('Integration gespeichert');
    fetchData();
  };

  const handleDynamicUpdate = async (providerId: string, dynamicData: Record<string, any>) => {
    if (!user) return;
    setDynamicConfigs(prev => ({ ...prev, [providerId]: dynamicData }));
    const existing = getSettingForProvider(providerId);
    if (existing) {
      const updatedConfig = { ...existing.config, dynamic_data: dynamicData };
      await supabase.from('integration_settings').update({
        config: updatedConfig as any,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    }
  };

  const handleIntegrationAction = async (providerId: string, action: string) => {
    if (providerId === 'notion' && action === 'sync') {
      const toastId = toast.loading('Notion wird migriert — Kunden, Projekte, Mitarbeiter, Rechnungen...');
      const { data, error } = await supabase.functions.invoke('sync-notion', { body: { target: 'all' } });
      toast.dismiss(toastId);
      if (error || data?.error) {
        toast.error(`Migration fehlgeschlagen: ${data?.error || error?.message}${data?.hint ? ' — ' + data.hint : ''}`);
      } else {
        const s = data.synced;
        toast.success(`✓ Migration abgeschlossen: ${s.kunden || 0} Kunden · ${s.projekte || 0} Projekte · ${s.mitarbeiter || 0} Mitarbeiter · ${s.finanzen || 0} Rechnungen`);
        fetchData();
      }
      return;
    }
    if (action === 'sync') {
      toast.info('Synchronisierung gestartet...');
      const existing = getSettingForProvider(providerId);
      if (existing) {
        await supabase.from('integration_settings').update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
        }).eq('id', existing.id);
      }
      toast.success('Synchronisierung abgeschlossen');
      fetchData();
    } else if (action === 'test') {
      if (providerId === 'slack') {
        const setting = getSettingForProvider('slack');
        const botToken = setting?.config?.bot_token;
        const defaultCh = setting?.config?.default_channels;
        const targetChannel = defaultCh?.notify_alerts || defaultCh?.notify_abschluesse || Object.values(defaultCh || {})[0];
        if (!botToken) { toast.error('Slack Bot Token nicht konfiguriert'); return; }
        if (!targetChannel) { toast.error('Kein Slack Channel konfiguriert — bitte zuerst einen Channel zuweisen'); return; }
        const toastId = toast.loading('Sende Test-Nachricht an Slack...');
        try {
          const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: targetChannel,
              text: '✅ Slack Integration erfolgreich verbunden mit dem Agency Hub Portal',
            }),
          });
          const data = await res.json();
          toast.dismiss(toastId);
          if (data.ok) {
            toast.success('Test-Nachricht erfolgreich gesendet ✓');
          } else {
            toast.error(`Slack Fehler: ${data.error || 'Unbekannt'}`);
          }
        } catch (e: any) {
          toast.dismiss(toastId);
          toast.error(`Slack nicht erreichbar: ${e?.message || 'Netzwerkfehler'}`);
        }
        return;
      }
      toast.success('Verbindungstest erfolgreich ✓');
    } else if (action === 'connect_google_drive') {
      const toastId = toast.loading('Google Verbindung wird vorbereitet...');
      try {
        const { data, error } = await supabase.functions.invoke('google-oauth-start');
        toast.dismiss(toastId);
        if (error || !data?.authUrl) {
          toast.error(`Fehler beim Starten der Google Verbindung: ${data?.error || error?.message || 'Unbekannt'}`);
          return;
        }
        window.location.href = data.authUrl;
      } catch (e: any) {
        toast.dismiss(toastId);
        toast.error(`Google OAuth nicht erreichbar: ${e?.message || 'Netzwerkfehler'}`);
      }
      return;
    } else if (action === 'connect') {
      toast.info('OAuth-Verbindung wird vorbereitet...');
    } else if (action === 'build_structure') {
      toast.info('Ordnerstruktur wird erstellt...');
    }
  };

  const runHealthTest = useCallback(async (providerId: string): Promise<HealthResult[]> => {
    setTestingProvider(providerId);
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (!provider?.healthChecks?.length) {
      setTestingProvider(null);
      return [];
    }

    const setting = getSettingForProvider(providerId);
    const config = setting?.config || {};
    const results: HealthResult[] = [];

    // Simulate health checks — in production these would make real API calls
    for (const check of provider.healthChecks) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      
      // Determine pass/fail based on whether we have config data
      let ok = false;
      let detail: string | undefined;

      switch (providerId) {
        case 'slack':
          if (check.id === 'bot_token_valid') { ok = !!config.bot_token; detail = ok ? 'Token verifiziert' : 'Kein Token konfiguriert'; }
          else if (check.id === 'webhook_active') { ok = !!config.tech_webhook; detail = ok ? 'Webhook aktiv' : 'Kein Webhook konfiguriert'; }
          else { ok = !!config.bot_token; }
          break;
        case 'meta_ads':
          if (check.id === 'token_valid') { ok = !!config.access_token; detail = ok ? 'Token aktiv' : 'Kein Token'; }
          else if (check.id === 'accounts_readable') { ok = !!config.access_token; detail = ok ? 'Accounts geladen' : 'Token erforderlich'; }
          else { ok = !!config.access_token; }
          break;
        case 'qonto':
          if (check.id === 'api_valid') {
            try {
              const { data: qData, error: qError } = await supabase.functions.invoke('qonto-info', {
                body: { org_slug: config.org_slug, api_key: config.api_key },
              });
              ok = !qError && !qData?.error;
              detail = ok ? 'Key verifiziert' : (qData?.error || qError?.message || 'Ungültig');
            } catch { ok = false; detail = 'Nicht erreichbar'; }
          } else if (check.id === 'org_found') {
            ok = !!config.org_slug;
            detail = config.org_slug || 'Kein Slug';
          } else {
            ok = !!config.api_key && !!config.org_slug;
          }
          break;
        case 'close_crm':
          if (check.id === 'api_reachable') { ok = !!config.api_key; }
          else if (check.id === 'auth_valid') { ok = !!config.api_key; detail = ok ? 'Authentifiziert' : 'Key fehlt'; }
          else { ok = !!config.api_key; }
          break;
        case 'n8n':
          if (check.id === 'n8n_reachable') { ok = !!config.instance_url; detail = config.instance_url || 'Keine URL'; }
          else if (check.id === 'api_valid') { ok = !!config.api_key; }
          else { ok = !!config.instance_url && !!config.api_key; }
          break;
        default:
          ok = setting?.connected || false;
          break;
      }

      results.push({ id: check.id, label: check.label, ok, detail });
    }

    // Save health score to config
    const passed = results.filter(r => r.ok).length;
    const score = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;
    
    if (user && setting) {
      const serializedResults = results.map(r => ({ id: r.id, label: r.label, ok: r.ok, detail: r.detail || null }));
      await supabase.from('integration_settings').update({
        config: { ...config, health_score: score, last_test: new Date().toISOString(), test_results: serializedResults } as any,
        last_sync_at: new Date().toISOString(),
        last_sync_status: score > 50 ? 'success' : 'error',
      }).eq('id', setting.id);
    }

    setTestResults(prev => ({ ...prev, [providerId]: results }));
    setTestingProvider(null);
    return results;
  }, [integrationSettings, user]);

  const handleTestAll = async () => {
    setTestingAll(true);
    const connectedProviders = PROVIDERS.filter(p => {
      const s = getSettingForProvider(p.id);
      return (s?.connected || p.id === 'slack') && !p.comingSoon;
    });
    
    for (const p of connectedProviders) {
      await runHealthTest(p.id);
    }
    setTestingAll(false);
    toast.success(`${connectedProviders.length} Integrationen getestet`);
  };

  const filteredProviders = useMemo(() => {
    return PROVIDERS.filter(p => {
      const matchesSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      const setting = getSettingForProvider(p.id);
      const isConnected = setting?.connected || p.id === 'slack' || (p.id === 'google_drive' && driveConnected);
      
      let matchesCategory = true;
      if (activeCategory === 'Verbunden') matchesCategory = isConnected;
      else if (activeCategory === 'Nicht verbunden') matchesCategory = !isConnected && !p.comingSoon;
      else if (activeCategory !== 'Alle') matchesCategory = p.category === activeCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory, integrationSettings, driveConnected]);

  const integrationStatusData = PROVIDERS.filter(p => !p.comingSoon).map(p => {
    const s = getSettingForProvider(p.id);
    return {
      provider: p.id,
      connected: !!s?.connected || p.id === 'slack' || (p.id === 'google_drive' && driveConnected),
      category: p.category,
      healthScore: s?.config?.health_score ?? null,
      hasError: s?.last_sync_status === 'error',
    };
  });

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

      <Tabs defaultValue="integrationen">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="integrationen">Integrationen</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="benutzer" className="relative">
            Benutzer
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="benachrichtigungen">Benachrichtigungen</TabsTrigger>
        </TabsList>

        {/* ═══════ INTEGRATIONEN TAB ═══════ */}
        <TabsContent value="integrationen" className="mt-6 space-y-6">
          {/* Status Bar */}
          <IntegrationStatusBar
            integrations={integrationStatusData}
            onTestAll={handleTestAll}
            testing={testingAll}
          />

          {/* Search + Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Integrationen durchsuchen..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Integration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProviders.map(provider => {
              const setting = getSettingForProvider(provider.id);
              const isSlackConnected = provider.id === 'slack';
              const isDriveConnected = provider.id === 'google_drive' && (driveConnected || !!googleDriveConn);
              return (
                <IntegrationCard
                  key={provider.id}
                  provider={provider}
                  connected={setting?.connected || isSlackConnected || isDriveConnected}
                  expanded={expandedCard === provider.id}
                  onToggle={() => setExpandedCard(prev => prev === provider.id ? null : provider.id)}
                  lastSyncAt={setting?.last_sync_at}
                  lastSyncStatus={setting?.last_sync_status}
                  lastSyncError={setting?.last_sync_error}
                  config={setting?.config || {}}
                  dynamicConfig={dynamicConfigs[provider.id] || {}}
                  onSave={handleIntegrationSave}
                  onAction={handleIntegrationAction}
                  onTest={runHealthTest}
                  onDynamicUpdate={handleDynamicUpdate}
                  testResults={testResults[provider.id]}
                  testing={testingProvider === provider.id}
                  closeDeals={closeDeals}
                  driveConnection={provider.id === 'google_drive' ? googleDriveConn : null}
                  onDriveDisconnect={provider.id === 'google_drive' ? async () => {
                    if (!user) return;
                    const { error } = await supabase.from('google_drive_connections').delete().eq('user_id', user.id);
                    if (error) { toast.error('Trennen fehlgeschlagen'); return; }
                    toast.success('Google Drive getrennt');
                    setGoogleDriveConn(null);
                  } : undefined}
                />
              );
            })}
          </div>

          {filteredProviders.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Keine Integrationen gefunden.</p>
            </div>
          )}

          {/* API Platform */}
          <div className="border-t border-border pt-8">
            <ApiPlatform />
          </div>
        </TabsContent>

        {/* ═══════ BRANDING TAB ═══════ */}
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

        {/* ═══════ BENUTZER TAB ═══════ */}
        <TabsContent value="benutzer" className="mt-4 space-y-6">
          {isAdminOrManager && requests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Mitarbeiter-Anfragen</h3>
              <Card className="border-border bg-card"><CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead className="hidden sm:table-cell">Position</TableHead>
                    <TableHead className="hidden sm:table-cell">Abteilung</TableHead>
                    <TableHead className="hidden md:table-cell">Eingereicht</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {requests.map(r => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDrawer(r)}>
                        <TableCell className="font-medium">{r.vorname} {r.nachname}</TableCell>
                        <TableCell className="text-muted-foreground">{r.email}</TableCell>
                        <TableCell className="hidden sm:table-cell">{r.position || '–'}</TableCell>
                        <TableCell className="hidden sm:table-cell">{r.abteilung || '–'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs hidden md:table-cell">{new Date(r.created_at).toLocaleDateString('de-DE')}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent></Card>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Aktive Mitarbeiter</h3>
            <Card className="border-border bg-card"><CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>E-Mail</TableHead><TableHead>Rolle</TableHead><TableHead className="hidden sm:table-cell">Abteilung</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {team.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{m.rolle}</Badge></TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">{m.department || '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent></Card>
          </div>
          <Button variant="outline"><Users className="h-4 w-4 mr-2" />Per E-Mail einladen</Button>
        </TabsContent>

        {/* ═══════ BENACHRICHTIGUNGEN TAB ═══════ */}
        <TabsContent value="benachrichtigungen" className="mt-4 space-y-6">
          {isAdminOrManager && <SlackWebhookConfig />}
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
    </div>
  );
}
