import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Play, RefreshCw, CheckCircle2, XCircle, Inbox } from 'lucide-react';
import { toast } from 'sonner';

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  conditions: any;
  action_type: string;
  action_config: any;
  created_at: string;
}

interface Execution {
  id: string;
  rule_id: string;
  account_id: string | null;
  message_uid: number | null;
  matched_keywords: string[] | null;
  status: string;
  error: string | null;
  slack_message_id: string | null;
  executed_at: string;
}

export default function EmailAutomationRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from('email_automation_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('email_automation_executions').select('*').order('executed_at', { ascending: false }).limit(20),
    ]);
    setRules((r as Rule[]) || []);
    setExecutions((e as Execution[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (rule: Rule) => {
    const { error } = await supabase
      .from('email_automation_rules')
      .update({ enabled: !rule.enabled })
      .eq('id', rule.id);
    if (error) { toast.error(error.message); return; }
    toast.success(rule.enabled ? 'Regel deaktiviert' : 'Regel aktiviert');
    load();
  };

  const runNow = async (ruleId?: string) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-email-automations', {
        body: ruleId ? { ruleId } : {},
      });
      if (error) throw error;
      toast.success(`Geprüft: ${data.matched ?? 0} Treffer, ${data.executed ?? 0} ausgeführt`);
      load();
    } catch (e: any) {
      toast.error(`Fehler: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/email-automatisierung"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Automatisierungs-Regeln</h1>
            <p className="text-sm text-muted-foreground">Regeln für eingehende E-Mails im geteilten Postfach</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => runNow()} disabled={running}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? 'animate-spin' : ''}`} />
          Jetzt prüfen
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Regeln</h2>
        {loading && <p className="text-sm text-muted-foreground">Lädt…</p>}
        {!loading && rules.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Noch keine Regeln definiert.
          </Card>
        )}
        {rules.map((rule) => {
          const cond = rule.conditions?.keyword_match;
          const actionConf = rule.action_config || {};
          return (
            <Card key={rule.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{rule.name}</span>
                    {rule.enabled
                      ? <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">Aktiv</Badge>
                      : <Badge variant="outline" className="text-muted-foreground">Inaktiv</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {cond && (
                      <div>
                        <span className="font-medium">Wenn:</span> Keyword{' '}
                        <code className="px-1 py-0.5 rounded bg-muted">{(cond.keywords || []).join(', ')}</code>{' '}
                        in {(cond.fields || []).join(' / ')}
                        {cond.case_sensitive ? ' (Groß-/Kleinschreibung)' : ''}
                      </div>
                    )}
                    {rule.action_type === 'slack_dm' && (
                      <div>
                        <span className="font-medium">Dann:</span> Slack-DM an{' '}
                        <code className="px-1 py-0.5 rounded bg-muted">{actionConf.target_user}</code>
                        {actionConf.include === 'full_email' ? ' (komplette Mail)' : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => runNow(rule.id)} disabled={running}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Test
                  </Button>
                  <Switch checked={rule.enabled} onCheckedChange={() => toggle(rule)} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Letzte Ausführungen
        </h2>
        {!loading && executions.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <Inbox className="h-5 w-5 mx-auto mb-2 opacity-50" />
            Noch keine Ausführungen.
          </Card>
        )}
        <div className="space-y-1">
          {executions.map((ex) => {
            const rule = rules.find((r) => r.id === ex.rule_id);
            const success = ex.status === 'success';
            return (
              <div
                key={ex.id}
                className="flex items-start gap-3 p-3 rounded-md border border-border bg-card text-sm"
              >
                {success
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{rule?.name || 'Unbekannte Regel'}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(ex.executed_at).toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    UID #{ex.message_uid} · Treffer:{' '}
                    {(ex.matched_keywords || []).map((k) => (
                      <code key={k} className="px-1 rounded bg-muted mr-1">{k}</code>
                    ))}
                  </div>
                  {ex.error && (
                    <div className="text-xs text-destructive mt-1 break-words">{ex.error}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
