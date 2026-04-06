import { useState, useEffect } from 'react';
import { Sparkles, Play, Clock, CheckCircle2, XCircle, Zap, RefreshCw, Brain, Trash2, Pencil, X, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import Wissensbank from '@/components/aria/Wissensbank';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: any;
  steps: any[];
  active: boolean;
  created_by: string | null;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
}

interface AutomationLog {
  id: string;
  automation_id: string;
  triggered_by: string | null;
  status: string;
  steps_executed: any[];
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface Memory {
  id: string;
  memory_type: string;
  key: string;
  value: string;
  confidence: number;
  times_confirmed: number;
  times_contradicted: number;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manuell',
  schedule: 'Geplant',
  event: 'Event-basiert',
};

const MEMORY_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  user_preference: { label: 'Präferenz', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  correction: { label: 'Korrektur', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  fact: { label: 'Fakt', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  workflow: { label: 'Workflow', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  feedback: { label: 'Feedback', className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20' },
};

export default function Aria() {
  const { isAdminOrManager } = useAuth();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [interactionCount, setInteractionCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchData = async () => {
    const [{ data: autos }, { data: logData }, { data: memData }, { count: intCount }, { count: corrCount }] = await Promise.all([
      supabase.from('aria_automations' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('aria_automation_logs' as any).select('*').order('created_at', { ascending: false }).limit(50),
      (supabase.from('aria_memory' as any) as any).select('*').order('last_reinforced_at', { ascending: false }),
      (supabase.from('aria_interactions' as any) as any).select('*', { count: 'exact', head: true }),
      (supabase.from('aria_memory' as any) as any).select('*', { count: 'exact', head: true }).eq('memory_type', 'correction'),
    ]);
    setAutomations((autos as unknown as Automation[]) || []);
    setLogs((logData as unknown as AutomationLog[]) || []);
    setMemories((memData as unknown as Memory[]) || []);
    setInteractionCount(intCount || 0);
    setCorrectionCount(corrCount || 0);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const toggleActive = async (id: string, active: boolean) => {
    await (supabase.from('aria_automations' as any) as any).update({ active }).eq('id', id);
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, active } : a));
    toast.success(active ? 'Automation aktiviert' : 'Automation deaktiviert');
  };

  const runAutomation = async (auto: Automation) => {
    if (!isAdminOrManager) { toast.error('Keine Berechtigung'); return; }
    setRunning(auto.id);
    const startTime = Date.now();

    try {
      const results: any[] = [];
      for (const step of auto.steps) {
        switch (step.type) {
          case 'supabase_query': {
            const query = supabase.from(step.table).select('*');
            if (step.filter) { (query as any).eq(step.filter.field, step.filter.value); }
            const { data } = await (query as any).limit(step.limit || 100);
            results.push({ type: step.type, table: step.table, count: data?.length || 0, status: 'success' });
            break;
          }
          case 'create_notification': {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
              await supabase.from('notifications').insert({
                user_id: session.user.id, title: step.title,
                body: step.message || step.body, channel: step.channel || 'intern',
              });
            }
            results.push({ type: step.type, title: step.title, status: 'success' });
            break;
          }
          default:
            results.push({ type: step.type, status: 'skipped', note: 'Nicht implementiert' });
        }
      }

      const duration = Date.now() - startTime;
      await (supabase.from('aria_automation_logs' as any) as any).insert({
        automation_id: auto.id, triggered_by: 'manual', status: 'success',
        steps_executed: results, duration_ms: duration,
      });
      await (supabase.from('aria_automations' as any) as any).update({
        last_run_at: new Date().toISOString(), run_count: auto.run_count + 1,
      }).eq('id', auto.id);

      toast.success(`"${auto.name}" erfolgreich ausgeführt (${duration}ms)`);
      fetchData();
    } catch (e: any) {
      const duration = Date.now() - startTime;
      await (supabase.from('aria_automation_logs' as any) as any).insert({
        automation_id: auto.id, triggered_by: 'manual', status: 'error',
        error_message: e.message, duration_ms: duration,
      });
      toast.error(`Fehler: ${e.message}`);
      fetchData();
    } finally {
      setRunning(null);
    }
  };

  const deleteMemory = async (id: string) => {
    await (supabase.from('aria_memory' as any) as any).delete().eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
    toast.success('Erinnerung gelöscht');
  };

  const updateMemory = async (id: string) => {
    await (supabase.from('aria_memory' as any) as any).update({ value: editValue }).eq('id', id);
    setMemories(prev => prev.map(m => m.id === id ? { ...m, value: editValue } : m));
    setEditingMemory(null);
    toast.success('Erinnerung aktualisiert');
  };

  const resetAllMemories = async () => {
    if (!confirm('Alle ARIA Erinnerungen löschen? ARIA startet dann von vorne.')) return;
    await (supabase.from('aria_memory' as any) as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setMemories([]);
    toast.success('Alle Erinnerungen gelöscht');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-primary animate-pulse text-lg font-semibold">Laden...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">ARIA</h1>
            <p className="text-sm text-muted-foreground">Automationen & Gedächtnis</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="automations">
        <TabsList>
          <TabsTrigger value="automations" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Automationen
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" /> Gedächtnis
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Wissensbank
          </TabsTrigger>
        </TabsList>

        {/* Automations Tab */}
        <TabsContent value="automations" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              {automations.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Zap className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground">Noch keine Automationen vorhanden.</p>
                  </CardContent>
                </Card>
              ) : (
                automations.map(auto => {
                  const isRunning = running === auto.id;
                  const isSelected = selectedId === auto.id;
                  const autoLogs = logs.filter(l => l.automation_id === auto.id).slice(0, 3);

                  return (
                    <Card
                      key={auto.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${isSelected ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedId(isSelected ? null : auto.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground">{auto.name}</h3>
                              <Badge variant="secondary">{TRIGGER_LABELS[auto.trigger_type] || auto.trigger_type}</Badge>
                              {!auto.active && <Badge variant="outline" className="text-muted-foreground">Inaktiv</Badge>}
                            </div>
                            {auto.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{auto.description}</p>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> {auto.steps.length} Schritte</span>
                              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> {auto.run_count}× ausgeführt</span>
                              {auto.last_run_at && (
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {format(new Date(auto.last_run_at), 'dd.MM. HH:mm', { locale: de })}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                            {isAdminOrManager && <Switch checked={auto.active} onCheckedChange={v => toggleActive(auto.id, v)} />}
                            <Button
                              size="sm" variant={isRunning ? 'secondary' : 'default'}
                              disabled={isRunning || !auto.active || !isAdminOrManager}
                              onClick={() => runAutomation(auto)} className="gap-1"
                            >
                              {isRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                              {isRunning ? 'Läuft...' : 'Ausführen'}
                            </Button>
                          </div>
                        </div>

                        {isSelected && autoLogs.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-border space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Letzte Ausführungen</p>
                            {autoLogs.map(log => (
                              <div key={log.id} className="flex items-center gap-2 text-xs">
                                {log.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                <span className="text-muted-foreground">{format(new Date(log.created_at), 'dd.MM. HH:mm', { locale: de })}</span>
                                <span className="text-muted-foreground">·</span>
                                <span>{log.duration_ms}ms</span>
                                {log.error_message && <span className="text-destructive truncate">{log.error_message}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Schritte</p>
                            <div className="space-y-1.5">
                              {auto.steps.map((step: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-3 py-2">
                                  <span className="w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                                  <span className="font-medium">{step.type}</span>
                                  {step.table && <span className="text-muted-foreground">→ {step.table}</span>}
                                  {step.title && <span className="text-muted-foreground">"{step.title}"</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Statistiken</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gesamt</span><span className="font-semibold">{automations.length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Aktiv</span><span className="font-semibold text-primary">{automations.filter(a => a.active).length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ausführungen heute</span><span className="font-semibold">{logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Fehler (letzte 50)</span><span className="font-semibold text-destructive">{logs.filter(l => l.status === 'error').length}</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> ARIA Tipp</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Drücke <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘J</kbd> und sage z.B.:</p>
                  <div className="mt-3 space-y-2">
                    {['"Erstelle Automation: Wenn Rechnung überfällig, Aufgabe erstellen"', '"Führe Wochenreport aus"'].map(tip => (
                      <p key={tip} className="text-xs text-primary italic">{tip}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory" className="mt-4">
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span><strong className="text-foreground">{memories.length}</strong> Erinnerungen</span>
                <span>·</span>
                <span><strong className="text-foreground">{interactionCount}</strong> Interaktionen</span>
                <span>·</span>
                <span><strong className="text-foreground">{correctionCount}</strong> Korrekturen</span>
              </div>
              {memories.length > 0 && (
                <Button variant="destructive" size="sm" onClick={resetAllMemories} className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Alles zurücksetzen
                </Button>
              )}
            </div>

            {memories.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Brain className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground">ARIA hat noch keine Erinnerungen.</p>
                  <p className="text-sm text-muted-foreground mt-1">Interagiere mit ARIA — sie lernt automatisch aus jeder Konversation.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {memories.map(mem => {
                  const typeInfo = MEMORY_TYPE_LABELS[mem.memory_type] || { label: mem.memory_type, className: 'bg-muted text-muted-foreground' };
                  const isEditing = editingMemory === mem.id;

                  return (
                    <Card key={mem.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={typeInfo.className}>{typeInfo.label}</Badge>
                              <span className="text-xs text-muted-foreground">{format(new Date(mem.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{mem.key}</p>
                            {isEditing ? (
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  type="text" value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                  onKeyDown={e => e.key === 'Enter' && updateMemory(mem.id)}
                                />
                                <Button size="sm" onClick={() => updateMemory(mem.id)}>Speichern</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingMemory(null)}><X className="h-3.5 w-3.5" /></Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground mt-0.5">{mem.value}</p>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingMemory(mem.id); setEditValue(mem.value); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteMemory(mem.id)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
        {/* Knowledge Tab */}
        <TabsContent value="knowledge" className="mt-4">
          <Wissensbank />
        </TabsContent>
      </Tabs>
    </div>
  );
}
