import { useMemo, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ExternalLink, Play, Copy, Download, X, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags?: any[];
  nodes?: any[];
  updatedAt?: string;
  createdAt?: string;
  description?: string;
  versionId?: string;
}

interface N8nExecution {
  id: string;
  workflowId: string;
  status?: string;
  startedAt?: string;
  stoppedAt?: string;
  mode?: string;
  finished?: boolean;
}

interface Props {
  workflow: N8nWorkflow | null;
  executions: N8nExecution[];
  instanceUrl: string;
  onClose: () => void;
  onToggle: (wf: N8nWorkflow) => void;
  onExecute: (wf: N8nWorkflow) => void;
  toggling: boolean;
}

function tagName(t: any): string { return typeof t === 'string' ? t : (t?.name || ''); }

function fmtDuration(start?: string, stop?: string) {
  if (!start || !stop) return '–';
  const ms = new Date(stop).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function statusBadge(status?: string) {
  if (status === 'success') return <Badge className="rounded bg-success/15 text-success border-success/30 hover:bg-success/15">Erfolgreich</Badge>;
  if (status === 'error') return <Badge className="rounded bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15">Fehlgeschlagen</Badge>;
  if (status === 'running') return <Badge className="rounded bg-primary/15 text-primary border-primary/30 animate-pulse">Läuft</Badge>;
  if (status === 'canceled' || status === 'crashed') return <Badge className="rounded bg-muted text-muted-foreground">Abgebrochen</Badge>;
  return <Badge variant="outline" className="rounded">{status || 'Unbekannt'}</Badge>;
}

export function N8nWorkflowDetailPanel({
  workflow, executions, instanceUrl, onClose, onToggle, onExecute, toggling,
}: Props) {
  const [onlyErrors, setOnlyErrors] = useState(false);

  const sorted = useMemo(
    () => executions.slice().sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()),
    [executions]
  );
  const filtered = onlyErrors ? sorted.filter((e) => e.status === 'error') : sorted;
  const last20 = sorted.slice(0, 20);
  const successRate = last20.length > 0
    ? Math.round((last20.filter((e) => e.status === 'success').length / last20.length) * 100)
    : 0;
  const last7d = sorted.filter((e) => e.startedAt && Date.now() - new Date(e.startedAt).getTime() < 7 * 24 * 60 * 60 * 1000);
  const avgDurationMs = (() => {
    const durs = last20
      .filter((e) => e.startedAt && e.stoppedAt)
      .map((e) => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt!).getTime());
    return durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  })();
  const lastFailed = sorted.find((e) => e.status === 'error');

  const webhookNodes = (workflow?.nodes || []).filter((n: any) => /webhook/i.test(n.type));

  const exportJson = () => {
    if (!workflow) return;
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${workflow.name.replace(/[^\w]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={!!workflow} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 overflow-y-auto">
        {workflow && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-foreground truncate">{workflow.name}</h2>
                <div className="flex items-center gap-2 mt-1.5">
                  {statusBadge(workflow.active ? 'success' : undefined)}
                  <Switch checked={workflow.active} disabled={toggling} onCheckedChange={() => onToggle(workflow)} />
                  <span className="text-xs text-muted-foreground">{workflow.active ? 'Aktiv' : 'Inaktiv'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onExecute(workflow)}>
                  <Play className="h-3.5 w-3.5 mr-1.5" />Ausführen
                </Button>
                {instanceUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`${instanceUrl.replace(/\/+$/, '')}/workflow/${workflow.id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />n8n
                    </a>
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Tabs defaultValue="overview" className="flex-1 flex flex-col">
              <TabsList className="mx-6 mt-4 w-fit">
                <TabsTrigger value="overview">Übersicht</TabsTrigger>
                <TabsTrigger value="executions">Ausführungen</TabsTrigger>
                <TabsTrigger value="settings">Einstellungen</TabsTrigger>
              </TabsList>

              {/* Übersicht */}
              <TabsContent value="overview" className="px-6 py-4 space-y-4">
                {workflow.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Beschreibung</p>
                    <p className="text-sm text-foreground">{workflow.description}</p>
                  </div>
                )}
                {workflow.tags && workflow.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {workflow.tags.map((t, i) => (
                        <Badge key={i} variant="secondary" className="rounded text-xs">{tagName(t)}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="rounded border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Runs 7T</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{last7d.length}</p>
                  </div>
                  <div className="rounded border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Erfolgsrate</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{successRate}%</p>
                  </div>
                  <div className="rounded border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Ø Dauer</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">
                      {avgDurationMs < 1000 ? `${avgDurationMs}ms` : `${(avgDurationMs / 1000).toFixed(1)}s`}
                    </p>
                  </div>
                  <div className="rounded border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Letzter Fehler</p>
                    <p className="text-xs font-medium text-foreground mt-1">
                      {lastFailed?.startedAt ? new Date(lastFailed.startedAt).toLocaleDateString('de-DE') : '–'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Letzte 20 Ausführungen</p>
                  <div className="flex items-end gap-1 h-10">
                    {last20.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Noch keine Ausführungen</p>
                    ) : last20.slice().reverse().map((e, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${e.status === 'success' ? 'bg-success' : e.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground/30'}`}
                        style={{ height: '100%' }}
                        title={`${e.status || 'unknown'} · ${e.startedAt ? new Date(e.startedAt).toLocaleString('de-DE') : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Ausführungen */}
              <TabsContent value="executions" className="px-6 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{filtered.length} Ausführungen</p>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
                    Nur Fehler anzeigen
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2">Status</th>
                        <th className="py-2">Gestartet</th>
                        <th className="py-2">Dauer</th>
                        <th className="py-2">Modus</th>
                        <th className="py-2 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Keine Ausführungen</td></tr>
                      ) : filtered.slice(0, 50).map((e) => (
                        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="py-2">{statusBadge(e.status)}</td>
                          <td className="py-2 text-muted-foreground">{e.startedAt ? new Date(e.startedAt).toLocaleString('de-DE') : '–'}</td>
                          <td className="py-2 text-muted-foreground">{fmtDuration(e.startedAt, e.stoppedAt)}</td>
                          <td className="py-2 text-muted-foreground">{e.mode || '–'}</td>
                          <td className="py-2 text-right">
                            {instanceUrl && (
                              <Button size="icon" variant="ghost" className="h-6 w-6" asChild>
                                <a
                                  href={`${instanceUrl.replace(/\/+$/, '')}/workflow/${workflow.id}/executions/${e.id}`}
                                  target="_blank" rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Einstellungen */}
              <TabsContent value="settings" className="px-6 py-4 space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border py-2">
                    <span className="text-muted-foreground">Workflow ID</span>
                    <span className="font-mono text-xs text-foreground">{workflow.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-border py-2">
                    <span className="text-muted-foreground">Erstellt</span>
                    <span className="text-foreground">{workflow.createdAt ? new Date(workflow.createdAt).toLocaleString('de-DE') : '–'}</span>
                  </div>
                  <div className="flex justify-between border-b border-border py-2">
                    <span className="text-muted-foreground">Geändert</span>
                    <span className="text-foreground">{workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString('de-DE') : '–'}</span>
                  </div>
                  {workflow.versionId && (
                    <div className="flex justify-between border-b border-border py-2">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-xs text-foreground">{workflow.versionId}</span>
                    </div>
                  )}
                </div>

                {webhookNodes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">Webhook URLs</p>
                    {webhookNodes.map((n: any, i: number) => {
                      const path = n.parameters?.path || n.webhookId || '';
                      const url = `${instanceUrl.replace(/\/+$/, '')}/webhook/${path}`;
                      return (
                        <div key={i} className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2">
                          <code className="text-[11px] flex-1 truncate text-foreground">{url}</code>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                            navigator.clipboard.writeText(url);
                            toast.success('Webhook URL kopiert');
                          }}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-destructive/30 pt-4">
                  <p className="text-xs font-semibold text-destructive uppercase mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />Danger Zone
                  </p>
                  <Button size="sm" variant="outline" onClick={exportJson}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />Workflow exportieren (JSON)
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
