import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Hash, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function SlackWebhookConfig() {
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

export default SlackWebhookConfig;
