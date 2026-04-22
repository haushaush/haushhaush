import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Copy, ExternalLink, Play, RotateCw, Plus, Trash2, RefreshCw } from 'lucide-react';
import { ARIAIcon } from '@/components/aria/ARIAIcon';
import { toast } from 'sonner';
import { useARIA } from '@/contexts/ARIAContext';

export interface HealthCheckDef {
  id: string;
  label: string;
}

export interface IntegrationProvider {
  id: string;
  name: string;
  category: string;
  iconLetter: string;
  iconBg: string;
  iconColor?: string;
  description: string;
  comingSoon?: boolean;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'readonly';
    placeholder?: string;
    defaultValue?: string;
  }>;
  toggles?: Array<{ key: string; label: string }>;
  webhookUrl?: string;
  docUrl?: string;
  actions: Array<{ label: string; variant?: 'default' | 'outline'; action: string }>;
  ariaGuide?: string[];
  healthChecks?: HealthCheckDef[];
  hasAccountMapping?: boolean;
}

export interface HealthResult {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

interface SlackChannel {
  id: string;
  name: string;
}

interface SlackWebhookRow {
  label: string;
  channel_id: string;
  channel_name: string;
  url: string;
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  amount_spent?: string;
}

interface IntegrationCardProps {
  provider: IntegrationProvider;
  connected: boolean;
  expanded: boolean;
  onToggle: () => void;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  config?: Record<string, any>;
  dynamicConfig?: Record<string, any>;
  onSave: (providerId: string, data: Record<string, any>) => Promise<void>;
  onAction: (providerId: string, action: string) => void;
  onTest: (providerId: string) => Promise<HealthResult[]>;
  onDynamicUpdate?: (providerId: string, dynamicData: Record<string, any>) => void;
  syncing?: boolean;
  testResults?: HealthResult[];
  testing?: boolean;
  closeDeals?: Array<{ id: string; client_name: string; art?: string; wert_eur?: number }>;
  driveConnection?: { email: string; connected_at: string } | null;
  onDriveDisconnect?: () => Promise<void>;
}

export function IntegrationCard({
  provider, connected, expanded, onToggle, lastSyncAt, lastSyncStatus, lastSyncError,
  config = {}, dynamicConfig = {}, onSave, onAction, onTest,
  onDynamicUpdate, syncing, testResults, testing, closeDeals = [],
  driveConnection, onDriveDisconnect,
}: IntegrationCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    provider.fields.forEach(f => {
      // For readonly fields, always use defaultValue (single source of truth)
      // — ignore stored config so updates to defaultValue propagate immediately.
      init[f.key] = f.type === 'readonly' ? (f.defaultValue || '') : (config[f.key] || f.defaultValue || '');
    });
    provider.toggles?.forEach(t => { init[t.key] = config[t.key] || false; });
    return init;
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const updated: Record<string, any> = {};
    provider.fields.forEach(f => {
      updated[f.key] = f.type === 'readonly' ? (f.defaultValue || '') : (config[f.key] || f.defaultValue || '');
    });
    provider.toggles?.forEach(t => { updated[t.key] = config[t.key] || false; });
    setFormData(updated);
  }, [config]);

  // Dynamic state
  const [loadingDynamic, setLoadingDynamic] = useState(false);
  const [aiMatching, setAiMatching] = useState(false);
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>(dynamicConfig?.channels || []);
  const [slackWebhooks, setSlackWebhooks] = useState<SlackWebhookRow[]>(config?.webhooks || []);
  const [defaultChannels, setDefaultChannels] = useState<Record<string, string>>(config?.default_channels || {});
  const [metaAccounts, setMetaAccounts] = useState<MetaAdAccount[]>(dynamicConfig?.ad_accounts || []);
  const [accountMappings, setAccountMappings] = useState<Record<string, string>>(config?.account_mappings || {});
  const [qontoInfo, setQontoInfo] = useState<any>(dynamicConfig?.qonto_info || null);
  const [n8nWorkflows, setN8nWorkflows] = useState<any[]>(dynamicConfig?.workflows || []);
  const [closePipelines, setClosePipelines] = useState<any[]>(dynamicConfig?.pipelines || []);

  let ariaContext: ReturnType<typeof useARIA> | null = null;
  try { ariaContext = useARIA(); } catch { /* not in provider */ }

  const healthScore = testResults
    ? Math.round((testResults.filter(r => r.ok).length / testResults.length) * 100)
    : config?.health_score ?? null;

  const statusDot = () => {
    if (provider.comingSoon) return <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />;
    if (syncing || testing || loadingDynamic) return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    if (lastSyncStatus === 'error') return <span className="w-2.5 h-2.5 rounded-full bg-destructive" />;
    if (connected) return <span className="w-2.5 h-2.5 rounded-full bg-success" />;
    return <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />;
  };

  const statusText = () => {
    if (provider.comingSoon) return <span className="text-muted-foreground italic">Demnächst verfügbar</span>;
    if (loadingDynamic) return <span className="text-primary">Lade Daten...</span>;
    if (syncing) return <span className="text-primary">Synchronisiert...</span>;
    if (testing) return <span className="text-primary">Wird getestet...</span>;
    if (lastSyncStatus === 'error') return <span className="text-destructive">Fehler: {lastSyncError || 'Unbekannt'}</span>;
    if (connected && lastSyncAt) {
      const ago = getRelativeTime(lastSyncAt);
      return <span className="text-success">Verbunden · Zuletzt {ago}</span>;
    }
    if (connected) return <span className="text-success">Verbunden</span>;
    return <span className="text-muted-foreground">Nicht verbunden</span>;
  };

  const copyWebhook = () => {
    if (provider.webhookUrl) {
      navigator.clipboard.writeText(provider.webhookUrl);
      toast.success('Webhook URL kopiert');
    }
  };

  const healthScoreColor = (score: number) => {
    if (score >= 100) return 'bg-success/15 text-success border-success/30';
    if (score >= 70) return 'bg-warning/15 text-warning border-warning/30';
    return 'bg-destructive/15 text-destructive border-destructive/30';
  };

  const borderClass = provider.comingSoon
    ? 'border-border opacity-60'
    : connected
      ? lastSyncStatus === 'error'
        ? 'border-l-[3px] border-l-destructive border-border'
        : 'border-l-[3px] border-l-success border-border'
      : 'border-border hover:border-primary/30';

  // ══ Dynamic data loaders ══
  const loadSlackChannels = async () => {
    const token = formData.bot_token || config?.bot_token;
    if (!token) { toast.error('Bot Token erforderlich'); return; }
    setLoadingDynamic(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-channels', {
        body: { bot_token: token },
      });
      if (error || data?.error) {
        toast.error(`Slack: ${data?.error || error?.message}`);
        setLoadingDynamic(false);
        return;
      }
      const channels = data.channels || [];
      setSlackChannels(channels);
      onDynamicUpdate?.(provider.id, { channels, loaded_at: new Date().toISOString() });
      toast.success(`${channels.length} Channels geladen`);
    } catch {
      toast.error('Slack API nicht erreichbar');
    }
    setLoadingDynamic(false);
  };

  const loadMetaAccounts = async () => {
    const token = formData.access_token || config?.access_token;
    const businessId = formData.business_manager_id || config?.business_manager_id || formData.business_id || config?.business_id;
    if (!token) { toast.error('Access Token erforderlich'); return; }
    setLoadingDynamic(true);
    try {
      const allAccounts: any[] = [];
      const seenIds = new Set<string>();
      const fetchAllPages = async (startUrl: string) => {
        let url: string | null = startUrl;
        while (url) {
          const res = await fetch(url);
          const data = await res.json();
          if (data.error) {
            toast.error(`Meta: ${data.error.message}`);
            return false;
          }
          for (const acc of (data.data || [])) {
            const id = acc.account_id || acc.id;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              allAccounts.push(acc);
            }
          }
          url = data.paging?.next || null;
        }
        return true;
      };
      const fields = 'id,name,account_id,account_status,currency,amount_spent';
      if (businessId) {
        const ownedOk = await fetchAllPages(
          `https://graph.facebook.com/v19.0/${businessId}/owned_ad_accounts?fields=${fields}&limit=200&access_token=${token}`
        );
        if (!ownedOk) { setLoadingDynamic(false); return; }
        const clientOk = await fetchAllPages(
          `https://graph.facebook.com/v19.0/${businessId}/client_ad_accounts?fields=${fields}&limit=200&access_token=${token}`
        );
        if (!clientOk) { setLoadingDynamic(false); return; }
      } else {
        const ok = await fetchAllPages(
          `https://graph.facebook.com/v19.0/me/adaccounts?fields=${fields}&limit=200&access_token=${token}`
        );
        if (!ok) { setLoadingDynamic(false); return; }
      }
      setMetaAccounts(allAccounts);
      onDynamicUpdate?.(provider.id, { ad_accounts: allAccounts, loaded_at: new Date().toISOString() });
      toast.success(`${allAccounts.length} Ad Accounts geladen`);
    } catch (e) {
      toast.error('Meta API nicht erreichbar');
    }
    setLoadingDynamic(false);
  };

  const loadQontoInfo = async () => {
    const slug = formData.org_slug || config?.org_slug;
    const key = formData.api_key || config?.api_key;
    if (!slug || !key) { toast.error('Slug und API Key erforderlich'); return; }
    setLoadingDynamic(true);
    try {
      const { data, error } = await supabase.functions.invoke('qonto-info', {
        body: { org_slug: slug, api_key: key },
      });
      if (error || data?.error) {
        const errMsg = data?.error || error?.message || 'Unbekannter Fehler';
        toast.error(`Qonto: ${errMsg}`, { duration: 8000 });
        console.error('Qonto error details:', { error, data });
        setLoadingDynamic(false);
        return;
      }
      const info = data.info;
      setQontoInfo(info);
      onDynamicUpdate?.(provider.id, { qonto_info: info, loaded_at: new Date().toISOString() });
      toast.success('Qonto verbunden');
    } catch { 
      toast.error('Qonto nicht erreichbar'); 
    }
    setLoadingDynamic(false);
  };

  const loadClosePipelines = async () => {
    const key = formData.api_key || config?.api_key;
    if (!key) { toast.error('API Key erforderlich'); return; }
    setLoadingDynamic(true);
    try {
      const res = await fetch('https://api.close.com/api/v1/pipeline/', {
        headers: { Authorization: `Basic ${btoa(key + ':')}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error('Close CRM: API Key ungültig'); setLoadingDynamic(false); return; }
      const pipelines = data.data || [];
      setClosePipelines(pipelines);
      onDynamicUpdate?.(provider.id, { pipelines, loaded_at: new Date().toISOString() });
      toast.success(`${pipelines.length} Pipelines geladen`);
    } catch { toast.error('Close CRM API nicht erreichbar'); }
    setLoadingDynamic(false);
  };

  const loadN8nWorkflows = async () => {
    const url = formData.instance_url || config?.instance_url;
    const key = formData.api_key || config?.api_key;
    if (!url || !key) { toast.error('URL und API Key erforderlich'); return; }
    setLoadingDynamic(true);
    try {
      const res = await fetch(`${url}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': key },
      });
      const data = await res.json();
      const workflows = data.data || data || [];
      setN8nWorkflows(Array.isArray(workflows) ? workflows : []);
      onDynamicUpdate?.(provider.id, { workflows: Array.isArray(workflows) ? workflows : [], loaded_at: new Date().toISOString() });
      toast.success(`${Array.isArray(workflows) ? workflows.length : 0} Workflows geladen`);
    } catch { toast.error('n8n nicht erreichbar'); }
    setLoadingDynamic(false);
  };

  // Slack webhook management
  const addWebhookRow = () => {
    setSlackWebhooks(prev => [...prev, { label: '', channel_id: '', channel_name: '', url: '' }]);
  };

  const updateWebhookRow = (index: number, field: keyof SlackWebhookRow, value: string) => {
    setSlackWebhooks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'channel_id') {
        const ch = slackChannels.find(c => c.id === value);
        if (ch) updated[index].channel_name = ch.name;
      }
      return updated;
    });
  };

  const removeWebhookRow = (index: number) => {
    setSlackWebhooks(prev => prev.filter((_, i) => i !== index));
  };

  // Enhanced save that includes dynamic data
  const handleSave = async () => {
    setSaving(true);
    const saveData = { ...formData };
    if (provider.id === 'slack') {
      saveData.webhooks = slackWebhooks;
      saveData.default_channels = defaultChannels;
    }
    if (provider.id === 'meta_ads') {
      saveData.account_mappings = accountMappings;
    }
    try {
      await onSave(provider.id, saveData);
    } finally {
      setSaving(false);
    }
  };

  const metaAccountStatus = (status: number) => {
    if (status === 1) return <Badge className="bg-success/15 text-success border-0 text-[10px]">Aktiv</Badge>;
    if (status === 2) return <Badge className="bg-destructive/15 text-destructive border-0 text-[10px]">Deaktiviert</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Unbekannt</Badge>;
  };

  const runAiMatch = async () => {
    if (!metaAccounts.length || !closeDeals.length) return;
    setAiMatching(true);
    toast.info('KI analysiert alle Accounts...');

    try {
      const unmatchedAccounts = metaAccounts.filter(acc => {
        const id = acc.account_id || acc.id;
        return !accountMappings[id] || accountMappings[id] === '__rejected__';
      });

      const newMappings = { ...accountMappings };
      let totalMatched = 0;
      const BATCH_SIZE = 60;

      for (let i = 0; i < unmatchedAccounts.length; i += BATCH_SIZE) {
        const batch = unmatchedAccounts.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase.functions.invoke('match-meta-accounts', {
          body: { adAccounts: batch, deals: closeDeals },
        });

        if (error || data?.error) {
          console.error('AI match error:', error || data?.error);
          continue;
        }

        // mappings is now keyed by account_id — no index confusion
        const mappings = data.mappings as Record<string, string | null>;
        Object.entries(mappings).forEach(([accountId, dealId]) => {
          if (dealId && dealId !== 'null') {
            newMappings[accountId] = dealId;
            totalMatched++;
          }
        });
      }

      setAccountMappings(newMappings);
      toast.success(`KI hat ${totalMatched} von ${unmatchedAccounts.length} Accounts zugeordnet`);
    } catch (e) {
      toast.error('KI-Matching fehlgeschlagen');
    }

    setAiMatching(false);
  };

  const autoMatch = (accName: string): string | null => {
    if (!closeDeals.length) return null;
    const STOP_WORDS = new Set([
      'alexander', 'thomas', 'michael', 'christian', 'stefan', 'andreas', 'martin',
      'markus', 'daniel', 'peter', 'jan', 'max', 'felix', 'julian', 'simon', 'david',
      'pkv', 'bu', 'tkv', 'kv', 'versicherung', 'versicherungen', 'versicherungsmakler',
      'beihilfe', 'tierkrankenversicherung', 'tierversicherung', 'krankenversicherung',
      'unfallversicherung', 'lebensversicherung', 'sterbegeld', 'rechtsschutz',
      'gmbh', 'ug', 'ag', 'kg', 'inc', 'ltd', 'digital', 'media', 'marketing',
      'recruiting', 'gruppe', 'partner', 'service', 'solutions', 'consulting',
      'und', 'der', 'die', 'das', 'von', 'van', 'de',
    ]);
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const getSignificantWords = (s: string) =>
      normalize(s).split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const accWords = getSignificantWords(accName);
    const accSearchWords = accWords.length > 0
      ? accWords
      : normalize(accName).split(' ').filter(w => w.length > 3);
    if (accSearchWords.length === 0) return null;
    let bestMatch: { id: string; score: number } | null = null;
    for (const deal of closeDeals) {
      const dealWords = getSignificantWords(deal.client_name);
      const dealSearchWords = dealWords.length > 0
        ? dealWords
        : normalize(deal.client_name).split(' ').filter(w => w.length > 3);
      if (dealSearchWords.length === 0) continue;
      const exactMatches = accSearchWords.filter(w => dealSearchWords.includes(w));
      const partialMatches = accSearchWords.filter(w =>
        w.length >= 4 && dealSearchWords.some(dw => dw.length >= 4 && (dw.includes(w) || w.includes(dw)))
      );
      const matchCount = exactMatches.length + partialMatches.length * 0.5;
      const totalWords = Math.max(accSearchWords.length, dealSearchWords.length);
      const score = matchCount / totalWords;
      if (exactMatches.length === 0) continue;
      if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: deal.id, score };
      }
    }
    return bestMatch ? bestMatch.id : null;
  };

  const [mappingSearch, setMappingSearch] = useState('');

  return (
    <div
      className={`rounded-[14px] border bg-card transition-all duration-200 ${borderClass}`}
      style={{ overflow: 'visible' }}
    >
      {/* Collapsed header */}
      <button
        className="w-full text-left p-[18px] flex items-center gap-3.5 focus:outline-none"
        onClick={() => !provider.comingSoon && onToggle()}
        disabled={provider.comingSoon}
      >
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center font-bold text-[15px] flex-shrink-0"
          style={{
            background: provider.iconBg,
            color: provider.iconColor || '#fff',
            border: provider.iconBg.includes('100%') ? '1px solid hsl(var(--border))' : 'none',
          }}
        >
          {provider.iconLetter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-foreground">{provider.name}</span>
            <Badge variant="secondary" className="text-[10px] font-medium h-5">{provider.category}</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {statusDot()}
            <span className="text-xs truncate">{statusText()}</span>
          </div>
        </div>
        {connected && healthScore !== null && !provider.comingSoon && (
          <Badge className={`text-xs font-bold px-2 py-0.5 border ${healthScoreColor(healthScore)}`}>
            {healthScore}%
          </Badge>
        )}
        {!provider.comingSoon && (
          <div className="flex-shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </button>

      {/* Expanded content — never clipped */}
      {expanded && !provider.comingSoon && (
        <div className="border-t border-border p-5" style={{ overflow: 'visible' }}>
          <div className="flex flex-col xl:flex-row gap-5">
            {/* LEFT — Config */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Credential fields */}
              {provider.fields.map(f => (
                <div key={f.key} className="w-full">
                  <Label className="text-xs text-muted-foreground">{f.label}</Label>
                  <Input
                    type={f.type === 'password' ? 'password' : 'text'}
                    placeholder={f.placeholder}
                    value={formData[f.key] || ''}
                    readOnly={f.type === 'readonly'}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className={`mt-1 w-full ${f.type === 'readonly' ? 'bg-muted cursor-default' : ''}`}
                  />
                </div>
              ))}

              {/* Toggles */}
              {provider.toggles?.map(t => (
                <div key={t.key} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{t.label}</span>
                  <Switch
                    checked={!!formData[t.key]}
                    onCheckedChange={val => setFormData(prev => ({ ...prev, [t.key]: val }))}
                  />
                </div>
              ))}

              {/* Webhook endpoint */}
              {provider.webhookUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">Webhook Endpoint</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={provider.webhookUrl} readOnly className="bg-muted font-mono text-xs w-full" />
                    <Button variant="outline" size="icon" onClick={copyWebhook} className="flex-shrink-0">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ══ SLACK DYNAMIC ══ */}
              {provider.id === 'slack' && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Channels & Webhooks</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={loadSlackChannels}
                      disabled={loadingDynamic}
                    >
                      {loadingDynamic
                        ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Laden...</>
                        : <><RefreshCw className="h-3 w-3 mr-1" />{slackChannels.length > 0 ? `${slackChannels.length} Channels` : 'Channels laden'}</>
                      }
                    </Button>
                  </div>

                  {slackChannels.length > 0 && (
                    <>
                      {/* Notification channels */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-medium text-foreground">Benachrichtigungen</h5>
                        <p className="text-[10px] text-muted-foreground">Wähle für jede Benachrichtigungsart den Ziel-Channel.</p>
                        {[
                          { key: 'notify_abschluesse', label: '🏆 Neue Abschlüsse' },
                          { key: 'notify_laufzeiten', label: '📅 Laufzeit-Erinnerungen' },
                          { key: 'notify_buchhaltung', label: '💶 Buchhaltung & Rechnungen' },
                          { key: 'notify_kpi', label: '📊 Sales KPI Updates' },
                          { key: 'notify_alerts', label: '🚨 System Alerts' },
                          { key: 'notify_fulfillment', label: '🎯 Fulfillment Updates' },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex items-center gap-3">
                            <Switch
                              checked={!!formData[key]}
                              onCheckedChange={v => setFormData(prev => ({ ...prev, [key]: v }))}
                              className="shrink-0"
                            />
                            <span className="text-xs text-foreground min-w-[160px]">{label}</span>
                            {formData[key] && (
                              <Select
                                value={defaultChannels[key] || undefined}
                                onValueChange={v => setDefaultChannels(prev => ({ ...prev, [key]: v }))}
                              >
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="Channel wählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {slackChannels.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs">#{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Webhook URLs */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-medium text-foreground">Incoming Webhooks</h5>
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={addWebhookRow}>
                            <Plus className="h-3 w-3 mr-1" /> Hinzufügen
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Erstelle in Slack unter Apps → Incoming Webhooks einen Webhook pro Channel.</p>
                        {slackWebhooks.length === 0 && (
                          <p className="text-[10px] text-muted-foreground/60 italic">Noch keine Webhooks hinzugefügt.</p>
                        )}
                        {slackWebhooks.map((wh, i) => (
                          <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                            <div className="flex items-center gap-2">
                              <Input
                                value={wh.label}
                                onChange={e => updateWebhookRow(i, 'label', e.target.value)}
                                placeholder="Name (z.B. Allgemein, Tech Support)"
                                className="h-7 text-xs flex-1"
                              />
                              <Select
                                value={wh.channel_id || undefined}
                                onValueChange={v => updateWebhookRow(i, 'channel_id', v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-40">
                                  <SelectValue placeholder="Channel" />
                                </SelectTrigger>
                                <SelectContent>
                                  {slackChannels.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs">#{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeWebhookRow(i)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                            <Input
                              value={wh.url}
                              onChange={e => updateWebhookRow(i, 'url', e.target.value)}
                              placeholder="https://hooks.slack.com/services/..."
                              className="h-7 text-xs font-mono w-full"
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ══ META ADS DYNAMIC ══ */}
              {provider.id === 'meta_ads' && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Ad Accounts</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={loadMetaAccounts}
                      disabled={loadingDynamic}
                    >
                      {loadingDynamic ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Accounts laden
                    </Button>
                  </div>

                  {metaAccounts.length > 0 && (() => {
                    const withSuggestions = metaAccounts.map(acc => {
                      const accountId = acc.account_id || acc.id;
                      const currentMapping = accountMappings[accountId];
                      const suggestion = !currentMapping ? autoMatch(acc.name) : null;
                      const isMatched = !!currentMapping && currentMapping !== '__rejected__';
                      const isAutoSuggested = !currentMapping && !!suggestion;
                      return { acc, accountId, currentMapping, suggestion, isMatched, isAutoSuggested };
                    });
                    const sorted = [...withSuggestions].sort((a, b) => {
                      const scoreA = a.isMatched ? 2 : a.isAutoSuggested ? 1 : 0;
                      const scoreB = b.isMatched ? 2 : b.isAutoSuggested ? 1 : 0;
                      return scoreA - scoreB;
                    });
                    const unmatchedCount = sorted.filter(x => !x.isMatched && !x.isAutoSuggested).length;
                    const autoSuggestedCount = sorted.filter(x => x.isAutoSuggested).length;
                    const matchedCount = sorted.filter(x => x.isMatched).length;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-xs font-medium text-foreground">📊 Kundenkonten zuordnen</p>
                          <div className="flex items-center gap-2">
                            <button
                              className="text-[10px] px-2 py-1 rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors font-medium"
                              onClick={() => {
                                const newMappings = { ...accountMappings };
                                let matched = 0;
                                metaAccounts.forEach(acc => {
                                  const accountId = acc.account_id || acc.id;
                                  if (!newMappings[accountId] || newMappings[accountId] === '__rejected__') {
                                    const suggestion = autoMatch(acc.name);
                                    if (suggestion) {
                                      newMappings[accountId] = suggestion;
                                      matched++;
                                    }
                                  }
                                });
                                setAccountMappings(newMappings);
                                toast.success(`${matched} Accounts automatisch zugeordnet`);
                              }}
                            >
                              🤖 Auto-Match alle
                            </button>
                            <button
                              className="text-[10px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-1 disabled:opacity-50"
                              onClick={runAiMatch}
                              disabled={aiMatching}
                            >
                              {aiMatching
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> KI läuft...</>
                                : <>✨ KI-Match alle</>
                              }
                            </button>
                            {autoSuggestedCount > 0 && (
                              <button
                                className="text-[10px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                                onClick={() => {
                                  const newMappings = { ...accountMappings };
                                  sorted.filter(x => x.isAutoSuggested).forEach(({ accountId, suggestion }) => {
                                    if (suggestion) newMappings[accountId] = suggestion;
                                  });
                                  setAccountMappings(newMappings);
                                }}
                              >
                                ✓ {autoSuggestedCount} Vorschläge übernehmen
                              </button>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {matchedCount}/{metaAccounts.length} zugeordnet
                            </span>
                          </div>
                        </div>
                        {unmatchedCount > 0 && (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-warning/10 border border-warning/20">
                            <span className="text-[10px] text-warning font-medium">⚠ {unmatchedCount} Account{unmatchedCount > 1 ? 's' : ''} ohne Zuordnung</span>
                          </div>
                        )}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Accounts durchsuchen..."
                            value={mappingSearch}
                            onChange={e => setMappingSearch(e.target.value)}
                            className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <div className="space-y-1.5">
                          {(() => {
                            const visibleAccounts = mappingSearch.trim()
                              ? sorted.filter(({ acc }) =>
                                  acc.name.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                                  (acc.account_id || acc.id).includes(mappingSearch)
                                )
                              : sorted;
                            return visibleAccounts.map(({ acc, accountId, currentMapping, suggestion, isMatched, isAutoSuggested }) => {
                              const effectiveValue = currentMapping ?? undefined;
                              const suggestedDeal = suggestion ? closeDeals.find(d => d.id === suggestion) : null;
                              return (
                                <div
                                  key={acc.id}
                                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                                    isMatched
                                      ? 'border-border bg-card'
                                      : isAutoSuggested
                                      ? 'border-primary/25 bg-primary/5'
                                      : 'border-warning/40 bg-warning/5'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        {!isMatched && !isAutoSuggested && (
                                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-warning/20 text-warning">OFFEN</span>
                                        )}
                                        {isAutoSuggested && (
                                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/15 text-primary">VORSCHLAG</span>
                                        )}
                                        {isMatched && (
                                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-success/15 text-success">✓</span>
                                        )}
                                        <p className="text-xs font-medium text-foreground truncate">{acc.name}</p>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{accountId}</p>
                                    </div>
                                    {metaAccountStatus(acc.account_status)}
                                  </div>
                                  {isAutoSuggested && suggestedDeal && (
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 text-[11px] text-primary bg-primary/10 rounded-md px-2.5 py-1.5">
                                        🤖 Vorschlag: <span className="font-medium">{suggestedDeal.client_name}{suggestedDeal.art ? ` · ${suggestedDeal.art}` : ''}</span>
                                      </div>
                                      <button
                                        className="shrink-0 text-[10px] px-2 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                                        onClick={() => setAccountMappings(prev => ({ ...prev, [accountId]: suggestion! }))}
                                      >
                                        ✓
                                      </button>
                                      <button
                                        className="shrink-0 text-[10px] px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => setAccountMappings(prev => ({ ...prev, [accountId]: '__rejected__' }))}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                  <Select
                                    value={effectiveValue === '__rejected__' ? undefined : effectiveValue}
                                    onValueChange={v => setAccountMappings(prev => ({ ...prev, [accountId]: v }))}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-full">
                                      <SelectValue placeholder={isAutoSuggested ? 'Vorschlag ablehnen & manuell wählen...' : 'Kunde zuordnen...'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <div className="px-2 pb-1 pt-1">
                                        <input
                                          type="text"
                                          placeholder="Kunde suchen..."
                                          className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                          onClick={e => e.stopPropagation()}
                                          onChange={e => {
                                            const val = e.target.value.toLowerCase();
                                            const items = e.currentTarget.closest('[role="listbox"]')?.querySelectorAll('[role="option"]');
                                            items?.forEach((item: any) => {
                                              item.style.display = item.textContent.toLowerCase().includes(val) ? '' : 'none';
                                            });
                                          }}
                                        />
                                      </div>
                                      {closeDeals.map(d => (
                                        <SelectItem key={d.id} value={d.id} className="text-xs">
                                          {d.client_name}{d.art ? ` · ${d.art}` : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Meta Test & Sync button */}
                  <div className="pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8 gap-1.5"
                      disabled={loadingDynamic || !formData.access_token}
                      onClick={async () => {
                        setLoadingDynamic(true);
                        toast.info('Syncing Meta data...');
                        try {
                          const { data: result, error } = await supabase.functions.invoke('sync-meta', {
                            body: { date_preset: 'last_7d' },
                          });
                          if (error) throw error;
                          if (result?.error) throw new Error(result.error);
                          toast.success(`✓ ${result?.synced || 0} Kampagnen synchronisiert`);
                          onTest(provider.id);
                        } catch (e: any) {
                          toast.error(`Meta Sync fehlgeschlagen: ${e?.message || 'Unbekannter Fehler'}`);
                        }
                        setLoadingDynamic(false);
                      }}
                    >
                      {loadingDynamic ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Test & Sync (letzte 7 Tage)
                    </Button>
                  </div>
                </div>
              )}

              {/* ══ CLOSE CRM DYNAMIC ══ */}
              {provider.id === 'close_crm' && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Pipelines & Felder</h4>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={loadClosePipelines} disabled={loadingDynamic}>
                      {loadingDynamic ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Laden
                    </Button>
                  </div>
                  {closePipelines.length > 0 && (
                    <div className="space-y-2">
                      {closePipelines.map((p: any) => (
                        <div key={p.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30 border border-border">
                          <span className="font-medium text-foreground">{p.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{p.statuses?.length || 0} Status</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ══ QONTO DYNAMIC ══ */}
              {provider.id === 'qonto' && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Kontoinformationen</h4>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={loadQontoInfo} disabled={loadingDynamic}>
                      {loadingDynamic ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Laden
                    </Button>
                  </div>
                  {qontoInfo && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-foreground">{qontoInfo.org_name}</p>
                        <p className="text-sm font-bold text-primary">
                          Gesamt: €{qontoInfo.total_balance?.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {(qontoInfo.accounts || []).map((acc: any, i: number) => (
                          <div key={i} className="flex items-center justify-between py-2 border-t border-border first:border-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {acc.main && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">HAUPT</span>}
                                <p className="text-xs font-medium text-foreground">{acc.name}</p>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{acc.iban}</p>
                            </div>
                            <p className={`text-sm font-semibold shrink-0 ml-3 ${acc.balance < 100 ? 'text-warning' : 'text-foreground'}`}>
                              €{acc.balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ n8n: link to workflow command center ══ */}
              {provider.id === 'n8n' && (
                <div className="pt-2 border-t border-border">
                  <a
                    href="/automationen/n8n"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                  >
                    Alle Workflows anzeigen <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* ══ GOOGLE DRIVE STATUS ══ */}
              {provider.id === 'google_drive' && driveConnection && (
                <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-xs font-semibold text-success uppercase tracking-wide">Aktiv</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{driveConnection.email}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Verbunden seit {new Date(driveConnection.connected_at).toLocaleDateString('de-DE', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={disconnecting}
                    onClick={async () => {
                      if (!onDriveDisconnect) return;
                      setDisconnecting(true);
                      try { await onDriveDisconnect(); } finally { setDisconnecting(false); }
                    }}
                  >
                    {disconnecting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Trenne...</> : 'Trennen'}
                  </Button>
                </div>
              )}


              {lastSyncAt && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  Zuletzt synchronisiert: {new Date(lastSyncAt).toLocaleString('de-DE')}
                </p>
              )}
              {dynamicConfig?.loaded_at && (
                <p className="text-[11px] text-muted-foreground">
                  Daten geladen: {getRelativeTime(dynamicConfig.loaded_at)}
                </p>
              )}

              {/* Actions row */}
              <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  {provider.docUrl && (
                    <a href={provider.docUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs h-8 text-primary"
                    onClick={() => onTest(provider.id)} disabled={testing}>
                    {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                    Testen
                  </Button>
                </div>
                <div className="flex gap-2">
                  {provider.actions.map(a => (
                    <Button
                      key={a.label}
                      variant={a.variant || 'default'}
                      size="sm"
                      className="text-xs h-8"
                      disabled={a.action === 'save' && saving}
                      onClick={() => {
                        if (a.action === 'save') handleSave();
                        else onAction(provider.id, a.action);
                      }}
                    >
                      {a.action === 'save' && saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Speichern...</> : a.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Health test results */}
              {testResults && testResults.length > 0 && (
                <div className="mt-3 rounded-[10px] border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Health Score</span>
                    <span className={`text-lg font-bold ${
                      healthScore !== null && healthScore >= 100 ? 'text-success' :
                      healthScore !== null && healthScore >= 70 ? 'text-warning' : 'text-destructive'
                    }`}>
                      {healthScore}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    {testResults.map(r => (
                      <div key={r.id} className="flex items-center gap-2 text-xs">
                        {r.ok
                          ? <CheckCircle className="h-3.5 w-3.5 text-success flex-shrink-0" />
                          : <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                        }
                        <span className={r.ok ? 'text-foreground' : 'text-destructive'}>
                          {r.label}
                          {r.detail && <span className="text-muted-foreground ml-1">— {r.detail}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs h-7 w-full mt-1"
                    onClick={() => onTest(provider.id)} disabled={testing}>
                    <RotateCw className="h-3 w-3 mr-1" /> Nochmal testen
                  </Button>
                </div>
              )}
            </div>

            {/* RIGHT — ARIA Guide */}
            {provider.ariaGuide && provider.ariaGuide.length > 0 && (
              <div className="xl:w-[260px] flex-shrink-0 rounded-[10px] border border-border bg-muted/40 p-4 h-fit space-y-3">
                <div className="flex items-center gap-2">
                  <ARIAIcon size={14} />
                  <span className="text-xs font-semibold text-primary">ARIA Einrichtungshilfe</span>
                </div>
                <ol className="space-y-2 text-xs text-muted-foreground leading-relaxed list-decimal list-inside">
                  {provider.ariaGuide.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {ariaContext && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => {
                      ariaContext?.addMessage({ role: 'user', content: `Hilf mir ${provider.name} einzurichten — wo finde ich die API Keys?` });
                      ariaContext?.openARIA();
                    }}
                  >
                    <ARIAIcon size={12} />
                    <span className="ml-1.5">ARIA fragen</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tagen`;
}
