import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export interface IntegrationProvider {
  id: string;
  name: string;
  category: string;
  icon: React.ReactNode;
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
  syncing?: boolean;
}

export function IntegrationCard({
  provider, connected, lastSyncAt, lastSyncStatus, lastSyncError,
  config = {}, onSave, onAction, syncing,
}: IntegrationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    provider.fields.forEach(f => { init[f.key] = config[f.key] || f.defaultValue || ''; });
    return init;
  });

  const statusIcon = () => {
    if (syncing) return <Loader2 className="h-4 w-4 animate-spin text-[var(--color-teal)]" />;
    if (lastSyncStatus === 'error') return <AlertCircle className="h-4 w-4 text-[var(--color-red)]" />;
    if (connected) return <CheckCircle className="h-4 w-4 text-[var(--color-green)]" />;
    return <XCircle className="h-4 w-4 text-[var(--text-muted)]" />;
  };

  const statusText = () => {
    if (syncing) return <span className="text-[var(--color-teal)]">Synchronisiert...</span>;
    if (lastSyncStatus === 'error') return <span className="text-[var(--color-red)]">Fehler</span>;
    if (connected) return <span className="text-[var(--color-green)]">Verbunden</span>;
    return <span className="text-[var(--text-muted)]">Nicht verbunden</span>;
  };

  const copyWebhook = () => {
    if (provider.webhookUrl) {
      navigator.clipboard.writeText(provider.webhookUrl);
      toast.success('Webhook URL kopiert');
    }
  };

  return (
    <Card className="overflow-hidden border-[var(--border)] bg-[var(--bg-surface)]">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => !provider.comingSoon && setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">
            {provider.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-[var(--text-primary)]">{provider.name}</span>
              <Badge variant="secondary" className="text-[10px] font-medium">{provider.category}</Badge>
              {provider.comingSoon && (
                <Badge className="bg-[var(--bg-app)] text-[var(--text-muted)] border-0 text-[10px]">Demnächst</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {statusIcon()}
              <span className="text-xs">{statusText()}</span>
            </div>
            {lastSyncError && lastSyncStatus === 'error' && (
              <p className="text-[11px] text-[var(--color-red)] mt-1">{lastSyncError}</p>
            )}
          </div>
          {!provider.comingSoon && (
            <div className="flex-shrink-0 text-[var(--text-muted)]">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          )}
        </div>
      </CardHeader>

      {expanded && !provider.comingSoon && (
        <CardContent className="pt-0 space-y-4 border-t border-[var(--border)]">
          <div className="pt-4 space-y-3">
            {provider.fields.map(f => (
              <div key={f.key}>
                <Label className="text-xs text-[var(--text-secondary)]">{f.label}</Label>
                <Input
                  type={f.type === 'password' ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={formData[f.key] || ''}
                  readOnly={f.type === 'readonly'}
                  onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className={`mt-1 ${f.type === 'readonly' ? 'bg-[var(--bg-app)] cursor-default' : ''}`}
                />
              </div>
            ))}

            {provider.toggles?.map(t => (
              <div key={t.key} className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-primary)]">{t.label}</span>
                <Switch
                  checked={!!formData[t.key]}
                  onCheckedChange={val => setFormData(prev => ({ ...prev, [t.key]: val }))}
                />
              </div>
            ))}

            {provider.webhookUrl && (
              <div>
                <Label className="text-xs text-[var(--text-secondary)]">Webhook Endpoint</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={provider.webhookUrl} readOnly className="bg-[var(--bg-app)] font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={copyWebhook} className="flex-shrink-0">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {lastSyncAt && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Zuletzt synchronisiert: {new Date(lastSyncAt).toLocaleString('de-DE')}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {provider.docUrl ? (
              <a
                href={provider.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--color-teal)] flex items-center gap-1 transition-colors"
              >
                Dokumentation <ExternalLink className="h-3 w-3" />
              </a>
            ) : <div />}
            <div className="flex gap-2">
              {provider.actions.map(a => (
                <Button
                  key={a.label}
                  variant={a.variant || 'default'}
                  size="sm"
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
        </CardContent>
      )}
    </Card>
  );
}
