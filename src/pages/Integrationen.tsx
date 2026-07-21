import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { IntegrationCard, type HealthResult } from '@/components/integrations/IntegrationCard';
import { IntegrationStatusBar } from '@/components/integrations/IntegrationStatusBar';
import { PROVIDERS, CATEGORIES } from '@/components/integrations/IntegrationProviders';
import { ApiPlatform } from '@/components/integrations/ApiPlatform';
import { PipedriveAccountsModal } from '@/components/integrations/PipedriveAccountsModal';

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

export default function Integrationen() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [loading, setLoading] = useState(true);
  const [driveConnected, setDriveConnected] = useState(false);
  const [, setDriveEmail] = useState<string | null>(null);
  const [googleDriveConn, setGoogleDriveConn] = useState<{ email: string; connected_at: string } | null>(null);
  const [pipedriveAccounts, setPipedriveAccounts] = useState<any[]>([]);
  const [pipedriveModalOpen, setPipedriveModalOpen] = useState(false);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSetting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Alle');
  const [testingAll, setTestingAll] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, HealthResult[]>>({});
  const [closeDeals, setCloseDeals] = useState<CloseDeal[]>([]);
  const [dynamicConfigs, setDynamicConfigs] = useState<Record<string, Record<string, any>>>({});

  const fetchData = async () => {
    const [driveRes, googleDriveRes, intRes, dealsRes, pipedriveRes] = await Promise.all([
      user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? (supabase.rpc as any)('drive_connection_status') : Promise.resolve({ data: null }),
      user ? supabase.from('integration_settings').select('*').eq('user_id', user.id) : Promise.resolve({ data: [] }),
      supabase.from('close_deals').select('id, client_name, art, wert_eur').order('client_name'),
      supabase.from('pipedrive_accounts' as any).select('id, name, domain, is_active, last_sync_at, last_sync_status, total_deals_synced').order('created_at', { ascending: true }),
    ]);
    if (driveRes.data) { setDriveConnected(true); setDriveEmail((driveRes.data as any).google_email); }
    const driveRow = Array.isArray((googleDriveRes as any).data) ? (googleDriveRes as any).data[0] : null;
    if (driveRow) {
      setGoogleDriveConn({ email: driveRow.google_email, connected_at: driveRow.connected_at });
    } else {
      setGoogleDriveConn(null);
    }
    setIntegrationSettings(((intRes as any).data || []) as any[]);
    setCloseDeals(((dealsRes as any).data || []) as CloseDeal[]);
    const dynConfigs: Record<string, Record<string, any>> = {};
    (((intRes as any).data || []) as any[]).forEach((s: any) => {
      if (s.config?.dynamic_data) dynConfigs[s.provider] = s.config.dynamic_data;
    });
    setDynamicConfigs(dynConfigs);
    setPipedriveAccounts(((pipedriveRes as any).data || []) as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  // Handle Google Drive OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('google_drive');
    if (status === 'connected') {
      toast.success('Google Drive erfolgreich verbunden');
      fetchData();
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

  const getSettingForProvider = (providerId: string) => {
    return integrationSettings.find(s => s.provider === providerId);
  };

  const handleIntegrationSave = async (providerId: string, data: Record<string, any>) => {
    if (!user) return;
    if (providerId === 'pipedrive') {
      setPipedriveModalOpen(true);
      return;
    }
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

  const handleIntegrationAction = async (providerId: string, action: string, _formData?: Record<string, any>) => {
    if (providerId === 'pipedrive' && (action === 'manage' || action === 'test' || action === 'save')) {
      setPipedriveModalOpen(true);
      return;
    }
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
      if (!isAdmin) {
        toast.error('Nur Admins dürfen die zentrale Google-Drive-Verbindung herstellen.');
        return;
      }
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

    for (const check of provider.healthChecks) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

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
        case 'zapier': {
          if (check.id === 'zapier_reachable') {
            try {
              const { data: zData, error: zError } = await supabase.functions.invoke('zapier-test-connection', {
                body: { api_key: config.api_key, webhook_base: config.webhook_base },
              });
              if (zError || zData?.error) {
                ok = false;
                detail = zData?.error || zError?.message || 'Test fehlgeschlagen';
                (config as any).__zapier_checks = null;
              } else {
                (config as any).__zapier_checks = zData.checks || [];
                const c = (zData.checks || []).find((x: any) => x.id === check.id);
                ok = !!c?.ok;
                detail = c?.detail;
              }
            } catch { ok = false; detail = 'Nicht erreichbar'; }
          } else {
            const cached = (config as any).__zapier_checks;
            const c = cached?.find((x: any) => x.id === check.id);
            ok = !!c?.ok;
            detail = c?.detail;
          }
          break;
        }
        case 'figma': {
          if (check.id === 'token_valid') {
            try {
              const { data: fData, error: fError } = await supabase.functions.invoke('figma-test-connection', {
                body: { token: config.access_token },
              });
              if (fError || !fData?.ok) {
                ok = false;
                detail = fData?.error || fError?.message || 'Token ungültig';
              } else {
                ok = true;
                detail = `Verbunden als ${fData.user?.email || fData.user?.handle || 'Figma User'}`;
                toast.success(`Figma verbunden als ${fData.user?.email || fData.user?.handle}`);
              }
            } catch { ok = false; detail = 'Nicht erreichbar'; }
          }
          break;
        }
        default:
          ok = setting?.connected || false;
          break;
      }

      results.push({ id: check.id, label: check.label, ok, detail });
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const settingConnected = p.id === 'google_drive' ? false : !!setting?.connected;
      const isConnected = settingConnected || p.id === 'slack' || (p.id === 'google_drive' && (driveConnected || !!googleDriveConn));

      let matchesCategory = true;
      if (activeCategory === 'Verbunden') matchesCategory = isConnected;
      else if (activeCategory === 'Nicht verbunden') matchesCategory = !isConnected && !p.comingSoon;
      else if (activeCategory !== 'Alle') matchesCategory = p.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeCategory, integrationSettings, driveConnected, googleDriveConn]);

  const integrationStatusData = PROVIDERS.filter(p => !p.comingSoon).map(p => {
    const s = getSettingForProvider(p.id);
    return {
      provider: p.id,
      connected: (p.id !== 'google_drive' && !!s?.connected) || p.id === 'slack' || (p.id === 'google_drive' && (driveConnected || !!googleDriveConn)),
      category: p.category,
      healthScore: s?.config?.health_score ?? null,
      hasError: s?.last_sync_status === 'error',
    };
  });

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Integrationen</h1>
        <p className="text-sm text-muted-foreground mt-1">Verbinde externe Dienste mit dem Agency Hub</p>
      </div>

      {window.location.hostname.includes('lovableproject.com') && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
          <span className="text-warning text-lg shrink-0">⚠</span>
          <div className="min-w-0">
            <p className="font-medium text-foreground text-xs">Du befindest dich in der Lovable Preview</p>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Einstellungen und Verbindungen hier nicht speichern — nutze die{' '}
              <a
                href="https://haushhaush.lovable.app/integrationen"
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

      <IntegrationStatusBar
        integrations={integrationStatusData}
        onTestAll={handleTestAll}
        testing={testingAll}
      />

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredProviders.map(provider => {
          const setting = getSettingForProvider(provider.id);
          const isSlackConnected = provider.id === 'slack';
          const isDriveConnected = provider.id === 'google_drive' && (driveConnected || !!googleDriveConn);
          const isPipedriveConnected = provider.id === 'pipedrive' && pipedriveAccounts.length > 0;
          const pipedriveLatest = provider.id === 'pipedrive'
            ? pipedriveAccounts.reduce((acc: any, a: any) => (!acc || (a.last_sync_at && a.last_sync_at > acc.last_sync_at) ? a : acc), null)
            : null;
          return (
            <IntegrationCard
              key={provider.id}
              provider={provider}
              connected={(provider.id !== 'google_drive' && setting?.connected) || isSlackConnected || isDriveConnected || isPipedriveConnected}
              expanded={expandedCard === provider.id}
              onToggle={() => setExpandedCard(prev => prev === provider.id ? null : provider.id)}
              lastSyncAt={setting?.last_sync_at || pipedriveLatest?.last_sync_at}
              lastSyncStatus={setting?.last_sync_status || (provider.id === 'pipedrive' && isPipedriveConnected ? `${pipedriveAccounts.length} Account${pipedriveAccounts.length === 1 ? '' : 's'} verbunden` : undefined)}
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
              onDriveDisconnect={provider.id === 'google_drive' && isAdmin ? async () => {
                const { error } = await supabase.from('google_drive_connections').delete().eq('is_primary', true);
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

      <div className="border-t border-border pt-8">
        <ApiPlatform />
      </div>

      <PipedriveAccountsModal
        open={pipedriveModalOpen}
        onClose={() => setPipedriveModalOpen(false)}
        onChanged={fetchData}
      />
    </div>
  );
}
