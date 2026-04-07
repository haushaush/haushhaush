import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, Copy, ExternalLink, Play, RotateCw } from 'lucide-react';
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

interface IntegrationCardProps {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  config?: Record<string, any>;
  onSave: (providerId: string, data: Record<string, any>) => void;
  onAction: (providerId: string, action: string) => void;
  onTest: (providerId: string) => Promise<HealthResult[]>;
  syncing?: boolean;
  testResults?: HealthResult[];
  testing?: boolean;
}

export function IntegrationCard({
  provider, connected, lastSyncAt, lastSyncStatus, lastSyncError,
  config = {}, onSave, onAction, onTest, syncing, testResults, testing,
}: IntegrationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    provider.fields.forEach(f => { init[f.key] = config[f.key] || f.defaultValue || ''; });
    provider.toggles?.forEach(t => { init[t.key] = config[t.key] || false; });
    return init;
  });

  let ariaContext: ReturnType<typeof useARIA> | null = null;
  try { ariaContext = useARIA(); } catch { /* not in provider */ }

  const healthScore = testResults
    ? Math.round((testResults.filter(r => r.ok).length / testResults.length) * 100)
    : config?.health_score ?? null;

  const statusDot = () => {
    if (provider.comingSoon) return <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />;
    if (syncing || testing) return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    if (lastSyncStatus === 'error') return <span className="w-2.5 h-2.5 rounded-full bg-destructive" />;
    if (connected) return <span className="w-2.5 h-2.5 rounded-full bg-success" />;
    return <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />;
  };

  const statusText = () => {
    if (provider.comingSoon) return <span className="text-muted-foreground italic">Demnächst verfügbar</span>;
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

  return (
    <div className={`rounded-[14px] border bg-card overflow-hidden transition-all duration-200 ${borderClass}`}>
      {/* Collapsed header */}
      <button
        className="w-full text-left p-[18px] flex items-center gap-3.5 focus:outline-none"
        onClick={() => !provider.comingSoon && setExpanded(!expanded)}
        disabled={provider.comingSoon}
      >
        {/* Icon */}
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

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-foreground">{provider.name}</span>
            <Badge variant="secondary" className="text-[10px] font-medium h-5">{provider.category}</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {statusDot()}
            <span className="text-xs">{statusText()}</span>
          </div>
        </div>

        {/* Health score badge */}
        {connected && healthScore !== null && !provider.comingSoon && (
          <Badge className={`text-xs font-bold px-2 py-0.5 border ${healthScoreColor(healthScore)}`}>
            {healthScore}%
          </Badge>
        )}

        {/* Chevron */}
        {!provider.comingSoon && (
          <div className="flex-shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && !provider.comingSoon && (
        <div className="border-t border-border px-[18px] pb-[18px] pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
            {/* LEFT — Config */}
            <div className="space-y-4">
              {/* Fields */}
              {provider.fields.map(f => (
                <div key={f.key}>
                  <Label className="text-xs text-muted-foreground">{f.label}</Label>
                  <Input
                    type={f.type === 'password' ? 'password' : 'text'}
                    placeholder={f.placeholder}
                    value={formData[f.key] || ''}
                    readOnly={f.type === 'readonly'}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className={`mt-1 ${f.type === 'readonly' ? 'bg-muted cursor-default' : ''}`}
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

              {/* Webhook */}
              {provider.webhookUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">Webhook Endpoint</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={provider.webhookUrl} readOnly className="bg-muted font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={copyWebhook} className="flex-shrink-0">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Last sync */}
              {lastSyncAt && (
                <p className="text-[11px] text-muted-foreground">
                  Zuletzt synchronisiert: {new Date(lastSyncAt).toLocaleString('de-DE')}
                </p>
              )}

              {/* Actions row */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  {provider.docUrl && (
                    <a
                      href={provider.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                    >
                      Dokumentation <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 text-primary"
                    onClick={() => onTest(provider.id)}
                    disabled={testing}
                  >
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
                      onClick={() => {
                        if (a.action === 'save') onSave(provider.id, formData);
                        else onAction(provider.id, a.action);
                      }}
                    >
                      {a.label}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 w-full mt-1"
                    onClick={() => onTest(provider.id)}
                    disabled={testing}
                  >
                    <RotateCw className="h-3 w-3 mr-1" /> Nochmal testen
                  </Button>
                </div>
              )}
            </div>

            {/* RIGHT — ARIA Guide */}
            {provider.ariaGuide && provider.ariaGuide.length > 0 && (
              <div className="rounded-[10px] border border-border bg-muted/40 p-4 h-fit space-y-3">
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
                      ariaContext?.sendMessage(`Hilf mir ${provider.name} einzurichten — wo finde ich die API Keys?`);
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
