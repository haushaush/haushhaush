import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Volume2, VolumeX, FileText, Plus, Navigation, Check, Phone, Euro, User, AlertCircle, ExternalLink, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useARIAData } from '@/hooks/useARIAData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { ARIASearchBar } from './ARIASearchBar';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aria-chat`;

const PAGE_NAMES: Record<string, string> = {
  '/': 'Dashboard', '/kunden': 'Kunden', '/projekte': 'Projekte',
  '/sales': 'Sales', '/finanzen': 'Finanzen', '/hr': 'Team & HR',
  '/nachrichten': 'Nachrichten', '/einstellungen': 'Einstellungen',
};

const STATUS_TEXT = {
  idle: 'Wie kann ich helfen?',
  listening: 'Ich höre zu...',
  processing: 'Denke nach...',
  executing: 'Wird ausgeführt...',
};

const fmt = (n: number) => n.toLocaleString('de-DE');

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'file-text': FileText, plus: Plus, navigation: Navigation, check: Check,
  phone: Phone, euro: Euro, user: User, alert: AlertCircle, external: ExternalLink,
};

interface ActionButton {
  label: string;
  action: string;
  params: Record<string, any>;
  icon?: string;
  variant?: 'primary' | 'secondary';
}

function parseResponse(text: string): { cleanText: string; actions: ActionButton[]; learns: Array<{ type: string; key: string; value: string }> } {
  let cleanText = text;
  let actions: ActionButton[] = [];
  let learns: Array<{ type: string; key: string; value: string }> = [];

  // Parse [ACTIONS]...[/ACTIONS]
  const actionsMatch = cleanText.match(/\[ACTIONS\]\s*([\s\S]*?)\s*\[\/ACTIONS\]/);
  if (actionsMatch) {
    try {
      actions = JSON.parse(actionsMatch[1]);
    } catch { /* ignore parse errors */ }
    cleanText = cleanText.replace(actionsMatch[0], '').trim();
  }

  // Parse [LEARN]...[/LEARN] (multiple possible)
  const learnRegex = /\[LEARN\]\s*(\{[\s\S]*?\})\s*\[\/LEARN\]/g;
  let learnMatch;
  while ((learnMatch = learnRegex.exec(cleanText)) !== null) {
    try {
      learns.push(JSON.parse(learnMatch[1]));
    } catch { /* ignore */ }
  }
  cleanText = cleanText.replace(/\[LEARN\]\s*\{[\s\S]*?\}\s*\[\/LEARN\]/g, '').trim();

  return { cleanText, actions, learns };
}

async function fetchMemories(): Promise<Array<{ memory_type: string; key: string; value: string; confidence: number }>> {
  const { data } = await (supabase.from('aria_memory' as any) as any)
    .select('memory_type, key, value, confidence')
    .order('last_reinforced_at', { ascending: false })
    .limit(20);
  return (data as any[]) || [];
}

async function saveLearn(learn: { type: string; key: string; value: string }, userId?: string) {
  await (supabase.from('aria_memory' as any) as any).insert({
    memory_type: learn.type,
    key: learn.key,
    value: learn.value,
    created_by: userId || null,
  });
}

async function saveInteraction(userId: string, userMessage: string, ariaResponse: string, actionsExecuted: any[], feedback?: number, feedbackNote?: string) {
  await (supabase.from('aria_interactions' as any) as any).insert({
    user_id: userId,
    user_message: userMessage,
    aria_response: ariaResponse,
    actions_executed: actionsExecuted,
    feedback: feedback ?? null,
    feedback_note: feedbackNote || null,
  });
}

function buildSystemPrompt(ariaData: ReturnType<typeof useARIAData>, displayName: string, pageName: string, memories: Array<{ memory_type: string; key: string; value: string }>): string {
  if (!ariaData) return 'Du bist ARIA, der KI-Assistent von Agency Hub. Daten werden gerade geladen...';

  const memoryBlock = memories.length > 0
    ? `\n═══ ARIA GEDÄCHTNIS (aus früheren Interaktionen) ═══\n${memories.map(m => `[${m.memory_type}] ${m.key}: ${m.value}`).join('\n')}\nNutze diese gespeicherten Informationen um bessere Antworten zu geben.\n`
    : '';

  return `Du bist ARIA, der KI-Assistent von Agency Hub — dem internen Dashboard von Viral Connect GmbH & Haush Haush Digital UG.

Aktueller Nutzer: ${displayName}
Aktuelle Seite: ${pageName}
Uhrzeit: ${new Date().toLocaleString('de-DE')}

═══ LIVE DATEN (gerade aus der Datenbank) ═══

KUNDEN:
- Aktive Kunden: ${ariaData.activeDealsCount}
- Kunden mit Ampel ROT: ${ariaData.redAmpelCount} (${ariaData.redAmpelClients || 'keine'})
- Kundenliste: ${JSON.stringify(ariaData.allClients)}

FINANZEN:
- MRR: €${fmt(ariaData.mrr)}
- ARR: €${fmt(ariaData.mrr * 12)}
- Offene Rechnungen: ${ariaData.openInvoicesCount} Stück = €${fmt(ariaData.openInvoicesTotal)}
- Überfällige Rechnungen: ${ariaData.overdueInvoicesCount} Stück = €${fmt(ariaData.overdueInvoicesTotal)}
- Rechnungsliste: ${JSON.stringify(ariaData.invoicesList)}

AUFGABEN:
- Offene Aufgaben: ${ariaData.openTasksCount}
- Überfällige Aufgaben: ${ariaData.overdueTasksCount}
- Aufgabenliste: ${JSON.stringify(ariaData.allTasks)}

SALES (diese Woche):
- Calls: ${ariaData.thisWeekCalls}
- Abschlüsse: ${ariaData.thisWeekCloses}
- Revenue: €${fmt(ariaData.thisWeekRevenue)}
${memoryBlock}
═══ VERFÜGBARE AKTIONEN ═══
Du kannst Aktionen ausführen indem du JSON zurückgibst:
- navigate: {"action":"navigate","params":{"path":"/kunden"}}
- search_client: {"action":"search_client","params":{"name":"Kehlenbach"}}
- show_kpi: {"action":"show_kpi","params":{"section":"sales"}}
- create_task: {"action":"create_task","params":{"title":"...","due_date":"..."}}
- mark_task_done: {"action":"mark_task_done","params":{"task_id":"..."}}
- update_ampel: {"action":"update_ampel","params":{"client_id":"...","status":"Grün|Gelb|Rot"}}

═══ ACTION BUTTONS ═══
Nach jeder Antwort, wenn relevant, füge am Ende deiner Antwort einen JSON-Block hinzu:
[ACTIONS]
[
  {"label": "Kunden öffnen", "action": "navigate", "params": {"path": "/kunden"}, "icon": "user", "variant": "primary"},
  {"label": "Aufgabe erstellen", "action": "create_task", "params": {"title": "..."}, "icon": "plus", "variant": "secondary"}
]
[/ACTIONS]
Maximal 3 Buttons. Nur wenn sie wirklich relevant sind.

═══ SELBST-LERNEN ═══
Wenn du etwas Neues über den Nutzer oder das System lernst, antworte mit:
[LEARN] {"type": "user_preference|fact|workflow", "key": "kurzer_schlüssel", "value": "was du gelernt hast"} [/LEARN]
Beispiele: Nutzerpräferenzen, häufige Anfragen, Korrekturen.

VERHALTEN:
- Antworte immer auf Deutsch, kurz und direkt
- Du hast ECHTE Daten — nutze sie. Nie sagen "ich habe keinen Zugriff".
- Wenn der Nutzer nach einem Kunden fragt, suche in der Kundenliste (case-insensitive).
- Formatiere Antworten mit Markdown wenn sinnvoll.
- Füge immer relevante Action Buttons hinzu.
- Bei Kundenfragen: Direktlink zum Kunden vorschlagen
- Bei Rechnungsfragen: Link zur Rechnung + "Erinnerung senden" Button
- Bei Aufgabenfragen: Link zu Aufgaben + "Als erledigt markieren" Button`;
}

// Per-message state for actions and feedback
interface MessageMeta {
  actions: ActionButton[];
  executedActions: Set<number>;
  feedback?: number;
  showCorrectionInput?: boolean;
  userMessage?: string; // the user message that triggered this response
}

export function ARIAPanel() {
  const { isOpen, closeARIA, messages, addMessage, updateLastAssistant, isLoading, setIsLoading, status, setStatus } = useARIA();
  const [input, setInput] = useState('');
  const [speakEnabled, setSpeakEnabled] = useState(() => localStorage.getItem('aria-speak') === 'true');
  const [messageMeta, setMessageMeta] = useState<Record<string, MessageMeta>>({});
  const [correctionTexts, setCorrectionTexts] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { displayName } = useProfile();
  const ariaData = useARIAData();

  const pageName = PAGE_NAMES[location.pathname] || location.pathname;
  const isOverview = location.pathname === '/';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('aria-speak', String(speakEnabled));
  }, [speakEnabled]);

  const executeAction = useCallback(async (action: string, params: any): Promise<string> => {
    setStatus('executing');
    try {
      switch (action) {
        case 'navigate':
          navigate(params.path);
          return `✓ Navigiert zu ${params.path}`;
        case 'search_client': {
          if (ariaData) {
            const found = ariaData.allClients.filter(c =>
              c.name.toLowerCase().includes((params.name || '').toLowerCase())
            );
            if (found.length > 0) {
              return `Gefunden:\n${found.map(c => `• **${c.name}** — ${c.art || '–'} · ${c.ampel || '–'} · €${fmt(c.wert || 0)}`).join('\n')}`;
            }
          }
          const { data } = await supabase
            .from('close_deals')
            .select('id, client_name, art, wert_eur, ampelstatus')
            .ilike('client_name', `%${params.name}%`)
            .limit(5);
          if (!data?.length) return `Keine Kunden gefunden für "${params.name}"`;
          return `Gefunden:\n${data.map(c => `• **${c.client_name}** — ${c.art || '–'} · ${c.ampelstatus || '–'} · €${fmt(c.wert_eur || 0)}`).join('\n')}`;
        }
        case 'show_kpi':
          navigate(params.section === 'sales' ? '/sales/kpis' : params.section === 'finanzen' ? '/finanzen' : '/');
          return `✓ KPI Dashboard geöffnet`;
        case 'create_task': {
          await supabase.from('tasks').insert({ title: params.title, client_id: params.client_id || null, due_date: params.due_date || null, status: 'Offen' });
          return `✓ Aufgabe "${params.title}" erstellt`;
        }
        case 'mark_task_done':
          await supabase.from('tasks').update({ status: 'Abgeschlossen' }).eq('id', params.task_id);
          return `✓ Aufgabe erledigt`;
        case 'update_ampel':
          await supabase.from('close_deals').update({ ampelstatus: params.status }).eq('id', params.client_id);
          return `✓ Ampelstatus auf ${params.status} gesetzt`;
        default:
          return `Unbekannte Aktion: ${action}`;
      }
    } catch (e: any) {
      return `❌ Fehler: ${e.message}`;
    } finally {
      setStatus('idle');
    }
  }, [navigate, setStatus, ariaData]);

  const handleActionButton = useCallback(async (messageId: string, actionIndex: number, btn: ActionButton) => {
    const result = await executeAction(btn.action, btn.params);
    setMessageMeta(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        executedActions: new Set([...(prev[messageId]?.executedActions || []), actionIndex]),
      },
    }));
    toast.success(result);
  }, [executeAction]);

  const handleFeedback = useCallback(async (messageId: string, feedback: number, message: any) => {
    setMessageMeta(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        feedback,
        showCorrectionInput: feedback === -1,
      },
    }));

    if (feedback === 1) {
      const meta = messageMeta[messageId];
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id && meta?.userMessage) {
        await saveInteraction(session.user.id, meta.userMessage, message.content, [], 1);
      }
    }
  }, [messageMeta]);

  const handleCorrectionSubmit = useCallback(async (messageId: string, message: any) => {
    const correctionText = correctionTexts[messageId];
    if (!correctionText?.trim()) return;

    const meta = messageMeta[messageId];
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await saveInteraction(session.user.id, meta?.userMessage || '', message.content, [], -1, correctionText);
      await (supabase.from('aria_memory' as any) as any).insert({
        memory_type: 'correction',
        key: (meta?.userMessage || '').slice(0, 80),
        value: correctionText,
        created_by: session.user.id,
      });
    }

    setMessageMeta(prev => ({
      ...prev,
      [messageId]: { ...prev[messageId], showCorrectionInput: false },
    }));
    setCorrectionTexts(prev => ({ ...prev, [messageId]: '' }));
    addMessage({ role: 'assistant', content: 'Danke für das Feedback — ich merke mir das. 🙏' });
  }, [correctionTexts, messageMeta, addMessage]);

  const speak = useCallback((text: string) => {
    if (!speakEnabled) return;
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`\[\]]/g, ''));
    utterance.lang = 'de-DE';
    utterance.rate = 1.1;
    const voices = speechSynthesis.getVoices();
    const de = voices.find(v => v.lang.startsWith('de'));
    if (de) utterance.voice = de;
    speechSynthesis.speak(utterance);
  }, [speakEnabled]);

  const handleSend = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    setInput('');
    addMessage({ role: 'user', content: msg });
    setIsLoading(true);
    setStatus('processing');

    let assistantText = '';

    try {
      const memories = await fetchMemories();
      const history = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user' as const, content: msg }];
      const systemPrompt = buildSystemPrompt(ariaData, displayName, pageName, memories);

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history, systemPrompt }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Fehler' }));
        toast.error(err.error || `Fehler ${resp.status}`);
        setIsLoading(false);
        setStatus('idle');
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantText += content;
              updateLastAssistant(assistantText);
            }
          } catch { /* partial */ }
        }
      }

      // Parse inline action JSON (legacy)
      const actionMatch = assistantText.match(/\{"action"\s*:\s*"([^"]+)"\s*,\s*"params"\s*:\s*(\{[^}]+\})\}/);
      if (actionMatch) {
        try {
          const actionName = actionMatch[1];
          const actionParams = JSON.parse(actionMatch[2]);
          const result = await executeAction(actionName, actionParams);
          const cleanText = assistantText.replace(actionMatch[0], '').trim();
          updateLastAssistant((cleanText ? cleanText + '\n\n' : '') + result);
          assistantText = cleanText + '\n\n' + result;
        } catch { /* ignore */ }
      }

      // Parse [ACTIONS] and [LEARN] blocks
      const { cleanText, actions, learns } = parseResponse(assistantText);
      if (cleanText !== assistantText) {
        updateLastAssistant(cleanText);
        assistantText = cleanText;
      }

      // Save learned items
      const { data: { session } } = await supabase.auth.getSession();
      for (const learn of learns) {
        await saveLearn(learn, session?.user?.id);
      }

      // Store message meta (actions + link to user message)
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      // Find the assistant message id — it's the last message after streaming
      setTimeout(() => {
        // Get the latest messages from the context
        const assistantMsgId = document.querySelector('[data-aria-msg]:last-of-type')?.getAttribute('data-aria-msg');
        if (assistantMsgId && actions.length > 0) {
          setMessageMeta(prev => ({
            ...prev,
            [assistantMsgId]: { actions, executedActions: new Set(), userMessage: msg },
          }));
        }
      }, 100);

      // Save interaction
      if (session?.user?.id) {
        await saveInteraction(session.user.id, msg, cleanText, actions.map(a => ({ action: a.action, params: a.params })));
      }

      speak(assistantText);
    } catch (e: any) {
      toast.error('ARIA Fehler: ' + e.message);
    } finally {
      setIsLoading(false);
      setStatus('idle');
    }
  }, [isLoading, messages, addMessage, updateLastAssistant, setIsLoading, setStatus, executeAction, speak, ariaData, displayName, pageName]);

  // Listen for aria-send events from the search bar
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail;
      if (text) handleSend(text);
    };
    window.addEventListener('aria-send', handler);
    return () => window.removeEventListener('aria-send', handler);
  }, [handleSend]);

  // Cmd+J focuses aria bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('.aria-search-input');
        if (el) el.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Store meta for messages with actions (when messages update)
  useEffect(() => {
    messages.forEach(m => {
      if (m.role === 'assistant' && !messageMeta[m.id]) {
        const { actions } = parseResponse(m.content);
        if (actions.length > 0) {
          setMessageMeta(prev => ({
            ...prev,
            [m.id]: { actions, executedActions: new Set() },
          }));
        }
      }
    });
  }, [messages]);

  if (!isOpen || messages.length === 0) return null;

  return (
    <>
      {/* Panel that slides up */}
      <div className={`aria-chat-panel ${isOverview ? 'aria-chat-panel--overview' : 'aria-chat-panel--bar'}`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 aria-panel-header">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/20 shrink-0 ${isLoading ? 'animate-pulse' : ''}`}>
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm">ARIA</div>
            <div className="text-white/70 text-[11px]">{STATUS_TEXT[status]}</div>
          </div>
          <button onClick={() => setSpeakEnabled(p => !p)} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors">
            {speakEnabled ? <Volume2 className="h-3.5 w-3.5 text-white" /> : <VolumeX className="h-3.5 w-3.5 text-white" />}
          </button>
          <button onClick={closeARIA} className="text-white/60 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.map(m => {
            const { cleanText, actions: parsedActions } = m.role === 'assistant' ? parseResponse(m.content) : { cleanText: m.content, actions: [] };
            const meta = messageMeta[m.id];
            const actions = meta?.actions || parsedActions;

            return (
              <div key={m.id} data-aria-msg={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  <div
                    className={`px-3.5 py-2.5 text-sm ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-[18px_18px_4px_18px]'
                        : 'bg-background text-foreground rounded-[18px_18px_18px_4px] border border-border'
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_ul]:mb-1">
                        <ReactMarkdown>{cleanText}</ReactMarkdown>
                      </div>
                    ) : m.content}
                  </div>

                  {/* Action buttons */}
                  {m.role === 'assistant' && actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                      {actions.map((btn, i) => {
                        const executed = meta?.executedActions?.has(i);
                        const IconComp = ICON_MAP[btn.icon || ''] || Sparkles;
                        return (
                          <button
                            key={i}
                            disabled={executed}
                            onClick={() => handleActionButton(m.id, i, btn)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 ${
                              executed
                                ? 'bg-primary/10 text-primary cursor-default'
                                : btn.variant === 'primary'
                                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                  : 'bg-background border border-border text-foreground hover:border-primary/40'
                            }`}
                          >
                            {executed ? <Check className="h-3 w-3" /> : <IconComp className="h-3 w-3" />}
                            {btn.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Feedback buttons */}
                  {m.role === 'assistant' && !isLoading && (
                    <div className="flex items-center gap-1 mt-1.5 ml-1 group">
                      {meta?.feedback === 1 ? (
                        <span className="text-primary"><Check className="h-3 w-3" /></span>
                      ) : meta?.feedback === -1 ? (
                        <span className="text-xs text-muted-foreground">Feedback gesendet</span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFeedback(m.id, 1, m)}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1 rounded hover:bg-primary/10"
                            title="Gute Antwort"
                          >
                            <ThumbsUp className="h-3 w-3 text-muted-foreground hover:text-primary" />
                          </button>
                          <button
                            onClick={() => handleFeedback(m.id, -1, m)}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                            title="Schlechte Antwort"
                          >
                            <ThumbsDown className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Correction input */}
                  {meta?.showCorrectionInput && (
                    <div className="flex items-center gap-2 mt-2 ml-1">
                      <input
                        type="text"
                        value={correctionTexts[m.id] || ''}
                        onChange={e => setCorrectionTexts(prev => ({ ...prev, [m.id]: e.target.value }))}
                        placeholder="Was hätte ARIA besser machen sollen?"
                        className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={e => e.key === 'Enter' && handleCorrectionSubmit(m.id, m)}
                      />
                      <button
                        onClick={() => handleCorrectionSubmit(m.id, m)}
                        className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-background border border-border rounded-[18px_18px_18px_4px] px-4 py-3 flex gap-1">
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </>
  );
}

export { ARIASearchBar } from './ARIASearchBar';
