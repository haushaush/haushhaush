import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Play, Save, GripVertical, Plus, X, Trash2, 
  Clock, Webhook, Database, MessageSquare, Mail, MousePointer,
  Search as SearchIcon, CheckCircle2, AlertTriangle, Loader2,
  Zap, Bell, FileText, Phone, Timer, Link2, GitBranch, Pause,
  RotateCw, Variable, Type, Calculator, Globe, ChevronRight,
  LayoutTemplate
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ─── Types ───

interface StepDef {
  id: string;
  type: string;
  label: string;
  icon: any;
  category: string;
  config: Record<string, any>;
  description?: string;
}

interface AutomationStep {
  id: string;
  type: string;
  label: string;
  config: Record<string, any>;
  order: number;
}

interface Automation {
  id?: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: any;
  steps: AutomationStep[];
  active: boolean;
  run_count?: number;
}

interface TestResult {
  stepId: string;
  status: 'success' | 'error' | 'running' | 'pending';
  output?: any;
  error?: string;
  durationMs?: number;
}

interface AutomationBuilderProps {
  automation?: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Step Catalog ───

const STEP_CATALOG: { category: string; items: Omit<StepDef, 'id' | 'config'>[] }[] = [
  {
    category: 'Auslöser',
    items: [
      { type: 'trigger_schedule', label: 'Zeitplan', icon: Clock, description: 'Zu bestimmten Zeiten ausführen' },
      { type: 'trigger_webhook', label: 'Webhook', icon: Webhook, description: 'Bei eingehendem HTTP-Request' },
      { type: 'trigger_supabase', label: 'Supabase Event', icon: Database, description: 'Bei Tabellenänderung' },
      { type: 'trigger_slack', label: 'Slack Nachricht', icon: MessageSquare, description: 'Bei Keyword in Channel' },
      { type: 'trigger_email', label: 'E-Mail empfangen', icon: Mail, description: 'Bei eingehender E-Mail' },
      { type: 'trigger_manual', label: 'Manuell', icon: MousePointer, description: 'Per Button-Klick starten' },
    ],
  },
  {
    category: 'Supabase',
    items: [
      { type: 'supabase_query', label: 'Daten abfragen', icon: SearchIcon, description: 'SELECT aus Tabelle' },
      { type: 'supabase_insert', label: 'Eintrag erstellen', icon: Plus, description: 'INSERT in Tabelle' },
      { type: 'supabase_update', label: 'Eintrag updaten', icon: FileText, description: 'UPDATE in Tabelle' },
      { type: 'supabase_delete', label: 'Eintrag löschen', icon: Trash2, description: 'DELETE aus Tabelle' },
    ],
  },
  {
    category: 'Benachrichtigungen',
    items: [
      { type: 'slack_message', label: 'Slack Nachricht', icon: MessageSquare, description: 'Nachricht an Channel' },
      { type: 'notification', label: 'Interne Benachrichtigung', icon: Bell, description: 'Im Portal anzeigen' },
      { type: 'email_send', label: 'E-Mail senden', icon: Mail, description: 'Via n8n versenden' },
    ],
  },
  {
    category: 'Portal-Aktionen',
    items: [
      { type: 'create_task', label: 'Aufgabe erstellen', icon: CheckCircle2, description: 'Neue Aufgabe anlegen' },
      { type: 'create_invoice', label: 'Rechnung erstellen', icon: FileText, description: 'Neue Rechnung anlegen' },
      { type: 'update_ampel', label: 'Ampelstatus ändern', icon: AlertTriangle, description: 'Kundenstatus setzen' },
      { type: 'log_call', label: 'Call loggen', icon: Phone, description: 'Anruf dokumentieren' },
      { type: 'timer_action', label: 'Timer starten/stoppen', icon: Timer, description: 'Zeiterfassung steuern' },
      { type: 'navigate', label: 'Navigieren', icon: Link2, description: 'Seite im Portal öffnen' },
    ],
  },
  {
    category: 'Logik',
    items: [
      { type: 'condition', label: 'Bedingung (If/Else)', icon: GitBranch, description: 'Verzweigung' },
      { type: 'delay', label: 'Warten (Delay)', icon: Pause, description: 'Pause zwischen Schritten' },
      { type: 'loop', label: 'Schleife (For Each)', icon: RotateCw, description: 'Über Liste iterieren' },
      { type: 'stop', label: 'Stopp', icon: X, description: 'Automation beenden' },
    ],
  },
  {
    category: 'Daten',
    items: [
      { type: 'set_variable', label: 'Variable setzen', icon: Variable, description: 'Wert speichern' },
      { type: 'format_text', label: 'Text formatieren', icon: Type, description: 'Template rendern' },
      { type: 'calculation', label: 'Berechnung', icon: Calculator, description: 'Mathematische Operationen' },
      { type: 'http_request', label: 'HTTP Request', icon: Globe, description: 'Externe API aufrufen' },
    ],
  },
];

const ALL_TABLES = [
  'tasks', 'clients', 'close_deals', 'projects', 'finance', 'invoices',
  'notifications', 'team', 'sales_performance', 'vorquali_kpi',
  'creative_projects', 'creative_assets', 'recurring_revenues',
  'ad_performance_intern', 'ad_performance_kunden', 'time_entries',
];

const TEMPLATES = [
  {
    name: '📊 Wöchentlicher KPI Report',
    description: 'Jeden Montag um 08:00 automatisch Sales-KPIs an Slack senden.',
    trigger_type: 'schedule',
    trigger_config: { frequency: 'weekly', day: 'monday', time: '08:00' },
    steps: [
      { id: 't1', type: 'supabase_query', label: 'Sales KPIs abrufen', config: { table: 'sales_performance', limit: 100 }, order: 0 },
      { id: 't2', type: 'slack_message', label: 'Report an #s-kpi', config: { channel: '#s-kpi', message: 'Wöchentlicher KPI Report: {{step0.count}} Einträge' }, order: 1 },
    ],
  },
  {
    name: '💶 Überfällige Rechnungen Alert',
    description: 'Täglich um 09:00 prüfen und bei überfälligen Rechnungen benachrichtigen.',
    trigger_type: 'schedule',
    trigger_config: { frequency: 'daily', time: '09:00' },
    steps: [
      { id: 't1', type: 'supabase_query', label: 'Überfällige Rechnungen', config: { table: 'invoices', filter: { field: 'status', operator: 'eq', value: 'Überfällig' } }, order: 0 },
      { id: 't2', type: 'condition', label: 'Rechnungen vorhanden?', config: { variable: '{{step0.count}}', operator: 'gt', value: '0' }, order: 1 },
      { id: 't3', type: 'notification', label: 'Alert senden', config: { title: 'Überfällige Rechnungen', message: '{{step0.count}} Rechnungen sind überfällig!' }, order: 2 },
    ],
  },
  {
    name: '🎉 Neuer Abschluss Onboarding',
    description: 'Bei neuem Deal automatisch Onboarding-Aufgaben erstellen.',
    trigger_type: 'event',
    trigger_config: { table: 'close_deals', event: 'INSERT' },
    steps: [
      { id: 't1', type: 'create_task', label: 'CRM Setup', config: { title: 'CRM Setup {{trigger.client_name}}' }, order: 0 },
      { id: 't2', type: 'create_task', label: 'Onboarding Call', config: { title: 'Onboarding Call buchen' }, order: 1 },
      { id: 't3', type: 'create_task', label: 'Meta Ads Setup', config: { title: 'Meta Ads Setup {{trigger.client_name}}' }, order: 2 },
      { id: 't4', type: 'slack_message', label: 'Team informieren', config: { channel: '#general', message: '🎉 Neuer Abschluss: {{trigger.client_name}}' }, order: 3 },
    ],
  },
  {
    name: '📞 Setter Tagesreport',
    description: 'Täglich um 18:00 die Sales-Performance zusammenfassen.',
    trigger_type: 'schedule',
    trigger_config: { frequency: 'daily', time: '18:00' },
    steps: [
      { id: 't1', type: 'supabase_query', label: 'Sales heute', config: { table: 'sales_performance', limit: 50 }, order: 0 },
      { id: 't2', type: 'slack_message', label: 'Report senden', config: { channel: '#s-kpi', message: 'Tagesreport: {{step0.count}} Einträge' }, order: 1 },
    ],
  },
  {
    name: '🔴 Ampel Rot Alert',
    description: 'Bei Ampelstatus Rot sofort Slack-Alert und Aufgabe erstellen.',
    trigger_type: 'event',
    trigger_config: { table: 'close_deals', event: 'UPDATE', condition: { field: 'ampelstatus', value: 'Rot' } },
    steps: [
      { id: 't1', type: 'slack_message', label: 'Alert senden', config: { channel: '#fulfillment', message: '🔴 {{trigger.client_name}} auf Rot gesetzt!' }, order: 0 },
      { id: 't2', type: 'create_task', label: 'Kunde kontaktieren', config: { title: '{{trigger.client_name}} — dringend kontaktieren' }, order: 1 },
    ],
  },
  {
    name: '💸 Rechnung fällig Alert',
    description: 'Täglich Rechnungen prüfen die in 7 Tagen fällig werden.',
    trigger_type: 'schedule',
    trigger_config: { frequency: 'daily', time: '08:00' },
    steps: [
      { id: 't1', type: 'supabase_query', label: 'Fällige Rechnungen', config: { table: 'invoices', filter: { field: 'status', operator: 'eq', value: 'Offen' } }, order: 0 },
      { id: 't2', type: 'notification', label: 'Erinnerung', config: { title: 'Rechnungen bald fällig', message: '{{step0.count}} Rechnungen werden in 7 Tagen fällig.' }, order: 1 },
    ],
  },
];

// ─── Helpers ───

const genId = () => Math.random().toString(36).slice(2, 10);

const getStepColor = (type: string): string => {
  if (type.startsWith('trigger_')) return 'hsl(var(--primary))';
  if (type.startsWith('supabase_')) return 'hsl(210 80% 55%)';
  if (type === 'slack_message' || type === 'notification' || type === 'email_send') return 'hsl(280 60% 55%)';
  if (type === 'condition' || type === 'delay' || type === 'loop' || type === 'stop') return 'hsl(40 80% 50%)';
  if (type === 'http_request' || type === 'set_variable' || type === 'format_text' || type === 'calculation') return 'hsl(170 60% 45%)';
  return 'hsl(var(--primary))';
};

const getStepIcon = (type: string) => {
  for (const cat of STEP_CATALOG) {
    const found = cat.items.find(i => i.type === type);
    if (found) return found.icon;
  }
  return Zap;
};

const getStepLabel = (type: string) => {
  for (const cat of STEP_CATALOG) {
    const found = cat.items.find(i => i.type === type);
    if (found) return found.label;
  }
  return type;
};

// ─── Main Component ───

export default function AutomationBuilder({ automation, onClose, onSaved }: AutomationBuilderProps) {
  const [name, setName] = useState(automation?.name || 'Neue Automation');
  const [description, setDescription] = useState(automation?.description || '');
  const [triggerType, setTriggerType] = useState(automation?.trigger_type || 'manual');
  const [triggerConfig, setTriggerConfig] = useState<any>(automation?.trigger_config || {});
  const [steps, setSteps] = useState<AutomationStep[]>(automation?.steps || []);
  const [active, setActive] = useState(automation?.active ?? true);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHasChanges(true); }, [name, description, triggerType, triggerConfig, steps, active]);

  // ─── Step Management ───

  const addStep = useCallback((type: string) => {
    const newStep: AutomationStep = {
      id: genId(),
      type,
      label: getStepLabel(type),
      config: {},
      order: steps.length,
    };
    setSteps(prev => [...prev, newStep]);
    setSelectedStep(newStep.id);
  }, [steps.length]);

  const removeStep = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i })));
    if (selectedStep === id) setSelectedStep(null);
  }, [selectedStep]);

  const moveStep = useCallback((fromIndex: number, toIndex: number) => {
    setSteps(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const updateStepConfig = useCallback((id: string, config: Record<string, any>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, config: { ...s.config, ...config } } : s));
  }, []);

  const updateStepLabel = useCallback((id: string, label: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, label } : s));
  }, []);

  // ─── Save ───

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name ist erforderlich'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        steps,
        active,
      };

      if (automation?.id) {
        await (supabase.from('aria_automations' as any) as any).update(payload).eq('id', automation.id);
      } else {
        await (supabase.from('aria_automations' as any) as any).insert(payload);
      }

      toast.success('Automation gespeichert ✓');
      setHasChanges(false);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(`Fehler: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Test Runner ───

  const runTest = async () => {
    if (steps.length === 0) { toast.error('Füge mindestens einen Schritt hinzu'); return; }
    setTesting(true);
    const results: TestResult[] = steps.map(s => ({ stepId: s.id, status: 'pending' as const }));
    setTestResults(results);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setTestResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r));

      const start = Date.now();
      try {
        let output: any = null;

        switch (step.type) {
          case 'supabase_query': {
            const table = step.config.table || 'tasks';
            const { data, error } = await (supabase.from(table as any) as any).select('*').limit(step.config.limit || 10);
            if (error) throw error;
            output = { count: data?.length || 0, sample: data?.slice(0, 2) };
            break;
          }
          case 'notification': {
            output = { preview: step.config.title || 'Test notification' };
            break;
          }
          case 'slack_message': {
            output = { preview: step.config.message || 'Test message' };
            break;
          }
          case 'condition': {
            output = { result: true, evaluated: `${step.config.variable} ${step.config.operator} ${step.config.value}` };
            break;
          }
          case 'delay': {
            await new Promise(r => setTimeout(r, Math.min((step.config.seconds || 1) * 1000, 2000)));
            output = { waited: `${step.config.seconds || 1}s` };
            break;
          }
          default:
            output = { simulated: true, type: step.type };
        }

        setTestResults(prev => prev.map((r, idx) => idx === i ? {
          ...r, status: 'success', output, durationMs: Date.now() - start
        } : r));
      } catch (err: any) {
        setTestResults(prev => prev.map((r, idx) => idx === i ? {
          ...r, status: 'error', error: err.message, durationMs: Date.now() - start
        } : r));
        break;
      }
    }
    setTesting(false);
  };

  // ─── Load Template ───

  const loadTemplate = (template: typeof TEMPLATES[0]) => {
    setName(template.name);
    setDescription(template.description);
    setTriggerType(template.trigger_type);
    setTriggerConfig(template.trigger_config);
    setSteps(template.steps);
    setShowTemplates(false);
    toast.success('Vorlage geladen — jetzt anpassen und speichern.');
  };

  // ─── Close with confirmation ───

  const handleClose = () => {
    if (hasChanges && steps.length > 0) {
      if (!confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
    onClose();
  };

  // ─── Filtered catalog ───

  const filteredCatalog = STEP_CATALOG.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !searchQuery ||
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  const currentStep = steps.find(s => s.id === selectedStep);

  return (
    <div className="fixed inset-0 z-[500] bg-background flex flex-col">
      {/* ─── Header Bar ─── */}
      <div className="h-14 border-b border-border bg-card flex items-center gap-3 px-4 shrink-0">
        <Button variant="ghost" size="sm" onClick={handleClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Button>
        <div className="w-px h-6 bg-border" />
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          className="max-w-[280px] h-8 font-semibold border-transparent hover:border-border focus:border-primary"
        />
        <Badge variant={active ? 'default' : 'secondary'} className="cursor-pointer select-none" onClick={() => setActive(!active)}>
          {active ? 'Aktiv' : 'Inaktiv'}
        </Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)} className="gap-1.5">
          <LayoutTemplate className="h-3.5 w-3.5" /> Vorlagen
        </Button>
        <Button variant="outline" size="sm" onClick={runTest} disabled={testing || steps.length === 0} className="gap-1.5">
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Test ausführen
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Speichern
        </Button>
      </div>

      {/* ─── 3-Panel Layout ─── */}
      <div className="flex-1 grid grid-cols-[280px_1fr_300px] min-h-0">
        {/* LEFT PANEL — Step Browser */}
        <div className="border-r border-border bg-card flex flex-col min-h-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Schritt suchen..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-3">
              {filteredCatalog.map(cat => (
                <div key={cat.category}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">{cat.category}</p>
                  <div className="space-y-0.5">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => {
                            if (item.type.startsWith('trigger_')) {
                              setTriggerType(item.type.replace('trigger_', ''));
                              setTriggerConfig({});
                            } else {
                              addStep(item.type);
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-accent/50 transition-colors group"
                        >
                          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${getStepColor(item.type)}15` }}>
                            <Icon className="h-3.5 w-3.5" style={{ color: getStepColor(item.type) }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                          </div>
                          <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER — Canvas */}
        <div
          ref={canvasRef}
          className="overflow-auto relative"
          style={{
            backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          <div className="flex flex-col items-center py-10 px-4 min-h-full">
            {/* START node */}
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-md">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-2">
                {triggerType === 'manual' ? 'Manuell starten' :
                 triggerType === 'schedule' ? `Zeitplan: ${triggerConfig.frequency || '–'}` :
                 triggerType === 'event' ? `Event: ${triggerConfig.table || '–'}` :
                 `Trigger: ${triggerType}`}
              </p>
              <button
                onClick={() => setSelectedStep('trigger')}
                className="text-[10px] text-primary hover:underline mt-0.5"
              >
                Konfigurieren
              </button>
            </div>

            {/* Steps */}
            {steps.map((step, index) => {
              const Icon = getStepIcon(step.type);
              const color = getStepColor(step.type);
              const testResult = testResults.find(r => r.stepId === step.id);
              const isSelected = selectedStep === step.id;

              return (
                <div key={step.id} className="flex flex-col items-center">
                  {/* Connector line */}
                  <div className="relative flex flex-col items-center">
                    <div className="w-0.5 h-8" style={{ background: color, opacity: 0.4 }} />
                    <button
                      onClick={() => {
                        const newStep: AutomationStep = {
                          id: genId(), type: 'notification', label: 'Neuer Schritt',
                          config: {}, order: index,
                        };
                        setSteps(prev => {
                          const next = [...prev];
                          next.splice(index, 0, newStep);
                          return next.map((s, i) => ({ ...s, order: i }));
                        });
                        setSelectedStep(newStep.id);
                      }}
                      className="w-6 h-6 rounded-full border-2 border-border bg-card flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <div className="w-0.5 h-8" style={{ background: color, opacity: 0.4 }} />
                  </div>

                  {/* Step card */}
                  <div
                    onClick={() => setSelectedStep(step.id)}
                    className={`w-[320px] rounded-xl border bg-card shadow-sm cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? 'ring-2 ring-primary border-primary' : 'border-border'
                    }`}
                  >
                    {/* Step header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
                      style={{ background: `${color}12` }}
                    >
                      <Icon className="h-4 w-4" style={{ color }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                        {getStepLabel(step.type)}
                      </span>
                      <span className="flex-1" />
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">Schritt {index + 1}</Badge>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Step body */}
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {step.config.table ? `Tabelle: ${step.config.table}` : ''}
                        {step.config.message ? step.config.message.slice(0, 60) : ''}
                        {step.config.title ? `"${step.config.title}"` : ''}
                        {!step.config.table && !step.config.message && !step.config.title && 'Klicke um zu konfigurieren'}
                      </p>
                    </div>
                    {/* Test result indicator */}
                    {testResult && (
                      <div className={`px-3 py-1.5 text-[11px] border-t flex items-center gap-1.5 rounded-b-xl ${
                        testResult.status === 'success' ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/20' :
                        testResult.status === 'error' ? 'bg-destructive/5 text-destructive border-destructive/20' :
                        testResult.status === 'running' ? 'bg-primary/5 text-primary border-primary/20' :
                        'bg-muted/50 text-muted-foreground border-border'
                      }`}>
                        {testResult.status === 'success' && <><CheckCircle2 className="h-3 w-3" /> Erfolgreich{testResult.durationMs ? ` (${testResult.durationMs}ms)` : ''}</>}
                        {testResult.status === 'error' && <><AlertTriangle className="h-3 w-3" /> {testResult.error?.slice(0, 50)}</>}
                        {testResult.status === 'running' && <><Loader2 className="h-3 w-3 animate-spin" /> Ausführung...</>}
                        {testResult.status === 'pending' && <>Ausstehend</>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add step / END */}
            <div className="flex flex-col items-center mt-2">
              {steps.length > 0 && (
                <div className="w-0.5 h-8 bg-border opacity-40" />
              )}
              {steps.length === 0 && (
                <div className="w-0.5 h-8 bg-border opacity-40 mt-2" />
              )}
              <button
                onClick={() => addStep('notification')}
                className="w-10 h-10 rounded-full border-2 border-dashed border-border bg-card flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors mb-4"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Ende</p>
            </div>

            {/* Empty state */}
            {steps.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center pointer-events-auto">
                  <p className="text-sm text-muted-foreground mb-3">Wähle Schritte aus dem linken Panel</p>
                  <div className="flex gap-2 justify-center">
                    {['supabase_query', 'slack_message', 'create_task'].map(type => {
                      const Icon = getStepIcon(type);
                      return (
                        <Button key={type} variant="outline" size="sm" onClick={() => addStep(type)} className="gap-1.5">
                          <Icon className="h-3.5 w-3.5" /> {getStepLabel(type)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL — Config */}
        <div className="border-l border-border bg-card flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4">
              {selectedStep === 'trigger' ? (
                <TriggerConfig
                  triggerType={triggerType}
                  triggerConfig={triggerConfig}
                  onTypeChange={setTriggerType}
                  onConfigChange={setTriggerConfig}
                />
              ) : currentStep ? (
                <StepConfig
                  step={currentStep}
                  stepIndex={steps.findIndex(s => s.id === currentStep.id)}
                  totalSteps={steps.length}
                  onConfigChange={(config) => updateStepConfig(currentStep.id, config)}
                  onLabelChange={(label) => updateStepLabel(currentStep.id, label)}
                  onDelete={() => removeStep(currentStep.id)}
                />
              ) : (
                <div className="text-center py-12">
                  <Zap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Wähle einen Schritt auf dem Canvas</p>
                  <p className="text-xs text-muted-foreground mt-1">oder füge einen neuen Schritt hinzu</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ─── Templates Drawer ─── */}
      {showTemplates && (
        <div className="fixed inset-0 z-[510] flex justify-end" onClick={() => setShowTemplates(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-[420px] bg-card border-l border-border h-full overflow-y-auto animate-in slide-in-from-right"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
              <h3 className="font-semibold text-foreground">Vorlagen</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-3">
              {TEMPLATES.map((tmpl, i) => (
                <div key={i} className="border border-border rounded-xl p-4 hover:bg-accent/30 transition-colors">
                  <h4 className="font-semibold text-sm text-foreground">{tmpl.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">{tmpl.trigger_type}</Badge>
                    <span>{tmpl.steps.length} Schritte</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {tmpl.steps.map((s, j) => {
                      const Icon = getStepIcon(s.type);
                      return (
                        <div key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Icon className="h-3 w-3" />
                          <span>{s.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Button size="sm" className="mt-3 w-full gap-1.5" onClick={() => loadTemplate(tmpl)}>
                    <ChevronRight className="h-3.5 w-3.5" /> Verwenden
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trigger Config Panel ───

function TriggerConfig({
  triggerType, triggerConfig, onTypeChange, onConfigChange,
}: {
  triggerType: string;
  triggerConfig: any;
  onTypeChange: (t: string) => void;
  onConfigChange: (c: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Trigger konfigurieren
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Wann soll die Automation starten?</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Typ</Label>
        <Select value={triggerType} onValueChange={onTypeChange}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manuell</SelectItem>
            <SelectItem value="schedule">Zeitplan</SelectItem>
            <SelectItem value="event">Supabase Event</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="slack">Slack Nachricht</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {triggerType === 'schedule' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Frequenz</Label>
            <Select value={triggerConfig.frequency || ''} onValueChange={v => onConfigChange({ ...triggerConfig, frequency: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Stündlich</SelectItem>
                <SelectItem value="daily">Täglich</SelectItem>
                <SelectItem value="weekly">Wöchentlich</SelectItem>
                <SelectItem value="custom">Custom (Cron)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Uhrzeit</Label>
            <Input type="time" value={triggerConfig.time || '08:00'} onChange={e => onConfigChange({ ...triggerConfig, time: e.target.value })} className="h-9" />
          </div>
          {triggerConfig.frequency === 'weekly' && (
            <div className="space-y-2">
              <Label className="text-xs">Tag</Label>
              <Select value={triggerConfig.day || ''} onValueChange={v => onConfigChange({ ...triggerConfig, day: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Tag wählen..." /></SelectTrigger>
                <SelectContent>
                  {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map(d => (
                    <SelectItem key={d} value={d.toLowerCase()}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {triggerConfig.frequency === 'custom' && (
            <div className="space-y-2">
              <Label className="text-xs">Cron Expression</Label>
              <Input value={triggerConfig.cron || ''} onChange={e => onConfigChange({ ...triggerConfig, cron: e.target.value })} placeholder="0 8 * * 1" className="h-9 font-mono text-xs" />
            </div>
          )}
        </>
      )}

      {triggerType === 'event' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Tabelle</Label>
            <Select value={triggerConfig.table || ''} onValueChange={v => onConfigChange({ ...triggerConfig, table: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Tabelle wählen..." /></SelectTrigger>
              <SelectContent>
                {ALL_TABLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Event</Label>
            <Select value={triggerConfig.event || ''} onValueChange={v => onConfigChange({ ...triggerConfig, event: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Event..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INSERT">INSERT (neuer Eintrag)</SelectItem>
                <SelectItem value="UPDATE">UPDATE (Änderung)</SelectItem>
                <SelectItem value="DELETE">DELETE (Löschung)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step Config Panel ───

function StepConfig({
  step, stepIndex, totalSteps, onConfigChange, onLabelChange, onDelete,
}: {
  step: AutomationStep;
  stepIndex: number;
  totalSteps: number;
  onConfigChange: (config: Record<string, any>) => void;
  onLabelChange: (label: string) => void;
  onDelete: () => void;
}) {
  const Icon = getStepIcon(step.type);
  const color = getStepColor(step.type);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{getStepLabel(step.type)}</p>
            <p className="text-[10px] text-muted-foreground">Schritt {stepIndex + 1} von {totalSteps}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Bezeichnung</Label>
        <Input value={step.label} onChange={e => onLabelChange(e.target.value)} className="h-9 text-sm" />
      </div>

      {/* Dynamic config based on step type */}
      {(step.type === 'supabase_query' || step.type === 'supabase_insert' || step.type === 'supabase_update' || step.type === 'supabase_delete') && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Tabelle</Label>
            <Select value={step.config.table || ''} onValueChange={v => onConfigChange({ table: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Tabelle wählen..." /></SelectTrigger>
              <SelectContent>
                {ALL_TABLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {step.type === 'supabase_query' && (
            <div className="space-y-2">
              <Label className="text-xs">Limit</Label>
              <Input type="number" value={step.config.limit || 100} onChange={e => onConfigChange({ limit: parseInt(e.target.value) || 100 })} className="h-9" />
            </div>
          )}
          {(step.type === 'supabase_query' || step.type === 'supabase_update' || step.type === 'supabase_delete') && (
            <div className="space-y-2">
              <Label className="text-xs">Filter (optional)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                <Input placeholder="Feld" value={step.config.filter?.field || ''} onChange={e => onConfigChange({ filter: { ...step.config.filter, field: e.target.value } })} className="h-8 text-xs" />
                <Select value={step.config.filter?.operator || 'eq'} onValueChange={v => onConfigChange({ filter: { ...step.config.filter, operator: v } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eq">= gleich</SelectItem>
                    <SelectItem value="neq">≠ ungleich</SelectItem>
                    <SelectItem value="gt">&gt; größer</SelectItem>
                    <SelectItem value="lt">&lt; kleiner</SelectItem>
                    <SelectItem value="like">enthält</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Wert" value={step.config.filter?.value || ''} onChange={e => onConfigChange({ filter: { ...step.config.filter, value: e.target.value } })} className="h-8 text-xs" />
              </div>
            </div>
          )}
          {step.type === 'supabase_insert' && (
            <div className="space-y-2">
              <Label className="text-xs">Daten (JSON)</Label>
              <Textarea
                value={step.config.data ? JSON.stringify(step.config.data, null, 2) : ''}
                onChange={e => { try { onConfigChange({ data: JSON.parse(e.target.value) }); } catch {} }}
                placeholder='{"title": "{{trigger.name}}"}'
                className="min-h-[100px] font-mono text-xs"
              />
            </div>
          )}
        </>
      )}

      {step.type === 'slack_message' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Channel</Label>
            <Input value={step.config.channel || ''} onChange={e => onConfigChange({ channel: e.target.value })} placeholder="#general" className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nachricht</Label>
            <Textarea value={step.config.message || ''} onChange={e => onConfigChange({ message: e.target.value })} placeholder="Nachricht mit {{variablen}}..." className="min-h-[100px] text-sm" />
            <p className="text-[10px] text-muted-foreground">Nutze {'{{variable}}'} für dynamische Werte</p>
          </div>
        </>
      )}

      {step.type === 'notification' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Titel</Label>
            <Input value={step.config.title || ''} onChange={e => onConfigChange({ title: e.target.value })} placeholder="Benachrichtigungstitel" className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nachricht</Label>
            <Textarea value={step.config.message || ''} onChange={e => onConfigChange({ message: e.target.value })} placeholder="Details..." className="min-h-[80px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Channel</Label>
            <Select value={step.config.channel || 'intern'} onValueChange={v => onConfigChange({ channel: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intern">Intern</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="email">E-Mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {step.type === 'create_task' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Aufgabentitel</Label>
            <Input value={step.config.title || ''} onChange={e => onConfigChange({ title: e.target.value })} placeholder="Aufgabe {{trigger.client_name}}" className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <Select value={step.config.status || 'Offen'} onValueChange={v => onConfigChange({ status: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Offen">Offen</SelectItem>
                <SelectItem value="In Bearbeitung">In Bearbeitung</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {step.type === 'condition' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Variable</Label>
            <Input value={step.config.variable || ''} onChange={e => onConfigChange({ variable: e.target.value })} placeholder="{{step0.count}}" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Operator</Label>
            <Select value={step.config.operator || 'eq'} onValueChange={v => onConfigChange({ operator: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="eq">ist gleich</SelectItem>
                <SelectItem value="neq">ist ungleich</SelectItem>
                <SelectItem value="gt">größer als</SelectItem>
                <SelectItem value="lt">kleiner als</SelectItem>
                <SelectItem value="contains">enthält</SelectItem>
                <SelectItem value="empty">ist leer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Wert</Label>
            <Input value={step.config.value || ''} onChange={e => onConfigChange({ value: e.target.value })} placeholder="Vergleichswert" className="h-9 text-sm" />
          </div>
        </>
      )}

      {step.type === 'delay' && (
        <div className="space-y-2">
          <Label className="text-xs">Wartezeit</Label>
          <div className="flex gap-2">
            <Input type="number" value={step.config.seconds || 5} onChange={e => onConfigChange({ seconds: parseInt(e.target.value) || 5 })} className="h-9 flex-1" />
            <Select value={step.config.unit || 'seconds'} onValueChange={v => onConfigChange({ unit: v })}>
              <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">Sekunden</SelectItem>
                <SelectItem value="minutes">Minuten</SelectItem>
                <SelectItem value="hours">Stunden</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {step.type === 'http_request' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Methode</Label>
            <Select value={step.config.method || 'GET'} onValueChange={v => onConfigChange({ method: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['GET', 'POST', 'PUT', 'DELETE'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">URL</Label>
            <Input value={step.config.url || ''} onChange={e => onConfigChange({ url: e.target.value })} placeholder="https://api.example.com/..." className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Body (JSON)</Label>
            <Textarea value={step.config.body || ''} onChange={e => onConfigChange({ body: e.target.value })} placeholder="{}" className="min-h-[80px] font-mono text-xs" />
          </div>
        </>
      )}

      {step.type === 'update_ampel' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Kundenname oder ID</Label>
            <Input value={step.config.client || ''} onChange={e => onConfigChange({ client: e.target.value })} placeholder="{{trigger.client_name}}" className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <Select value={step.config.status || 'Grün'} onValueChange={v => onConfigChange({ status: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Grün">🟢 Grün</SelectItem>
                <SelectItem value="Gelb">🟡 Gelb</SelectItem>
                <SelectItem value="Rot">🔴 Rot</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {step.type === 'set_variable' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Variablenname</Label>
            <Input value={step.config.name || ''} onChange={e => onConfigChange({ name: e.target.value })} placeholder="myVar" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Wert</Label>
            <Input value={step.config.value || ''} onChange={e => onConfigChange({ value: e.target.value })} placeholder="{{step0.results[0].name}}" className="h-9 text-sm font-mono" />
          </div>
        </>
      )}

      {step.type === 'format_text' && (
        <div className="space-y-2">
          <Label className="text-xs">Template</Label>
          <Textarea value={step.config.template || ''} onChange={e => onConfigChange({ template: e.target.value })} placeholder="Hallo {{name}}, dein Status: {{status}}" className="min-h-[100px] text-sm" />
        </div>
      )}

      {step.type === 'calculation' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Ausdruck</Label>
            <Input value={step.config.expression || ''} onChange={e => onConfigChange({ expression: e.target.value })} placeholder="{{step0.count}} * 100" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Ergebnis-Variable</Label>
            <Input value={step.config.output || ''} onChange={e => onConfigChange({ output: e.target.value })} placeholder="result" className="h-9 text-sm font-mono" />
          </div>
        </>
      )}

      {step.type === 'email_send' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">An (E-Mail)</Label>
            <Input value={step.config.to || ''} onChange={e => onConfigChange({ to: e.target.value })} placeholder="email@example.com" className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Betreff</Label>
            <Input value={step.config.subject || ''} onChange={e => onConfigChange({ subject: e.target.value })} placeholder="Betreff..." className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Inhalt</Label>
            <Textarea value={step.config.body || ''} onChange={e => onConfigChange({ body: e.target.value })} className="min-h-[100px] text-sm" />
          </div>
        </>
      )}

      {step.type === 'navigate' && (
        <div className="space-y-2">
          <Label className="text-xs">Pfad</Label>
          <Input value={step.config.path || ''} onChange={e => onConfigChange({ path: e.target.value })} placeholder="/kunden" className="h-9 text-sm font-mono" />
        </div>
      )}

      {step.type === 'log_call' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Setter</Label>
            <Input value={step.config.setter || ''} onChange={e => onConfigChange({ setter: e.target.value })} placeholder="Name oder ID" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Calls</Label>
              <Input type="number" value={step.config.calls || 0} onChange={e => onConfigChange({ calls: parseInt(e.target.value) || 0 })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Termine</Label>
              <Input type="number" value={step.config.appointments || 0} onChange={e => onConfigChange({ appointments: parseInt(e.target.value) || 0 })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Closes</Label>
              <Input type="number" value={step.config.closes || 0} onChange={e => onConfigChange({ closes: parseInt(e.target.value) || 0 })} className="h-8 text-xs" />
            </div>
          </div>
        </>
      )}

      {step.type === 'loop' && (
        <div className="space-y-2">
          <Label className="text-xs">Über Variable iterieren</Label>
          <Input value={step.config.source || ''} onChange={e => onConfigChange({ source: e.target.value })} placeholder="{{step0.results}}" className="h-9 text-sm font-mono" />
          <p className="text-[10px] text-muted-foreground">Aktuelles Element: {'{{item}}'}</p>
        </div>
      )}

      {step.type === 'create_invoice' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Kunde</Label>
            <Input value={step.config.client_name || ''} onChange={e => onConfigChange({ client_name: e.target.value })} placeholder="{{trigger.client_name}}" className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Betrag (Netto)</Label>
            <Input type="number" value={step.config.netto || ''} onChange={e => onConfigChange({ netto: parseFloat(e.target.value) || 0 })} placeholder="1000" className="h-9 text-sm" />
          </div>
        </>
      )}

      {step.type === 'timer_action' && (
        <div className="space-y-2">
          <Label className="text-xs">Aktion</Label>
          <Select value={step.config.action || 'start'} onValueChange={v => onConfigChange({ action: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Timer starten</SelectItem>
              <SelectItem value="stop">Timer stoppen</SelectItem>
            </SelectContent>
          </Select>
          {step.config.action !== 'stop' && (
            <div className="space-y-2 mt-2">
              <Label className="text-xs">Aufgabe</Label>
              <Input value={step.config.taskLabel || ''} onChange={e => onConfigChange({ taskLabel: e.target.value })} placeholder="Aufgabenname" className="h-9 text-sm" />
            </div>
          )}
        </div>
      )}

      {step.type === 'stop' && (
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
          Stoppt die Automation an dieser Stelle. Keine weitere Schritte werden ausgeführt.
        </div>
      )}
    </div>
  );
}
