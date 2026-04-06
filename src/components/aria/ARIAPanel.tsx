import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Volume2, VolumeX, Square, FileText, Plus, Navigation, Check, Phone, Euro, User, AlertCircle, ExternalLink, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useARIAData } from '@/hooks/useARIAData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { ARIAIcon } from './ARIAIcon';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aria-chat`;

const PAGE_NAMES: Record<string, string> = {
  '/': 'Dashboard', '/kunden': 'Kunden', '/projekte': 'Projekte',
  '/sales': 'Sales', '/finanzen': 'Finanzen', '/hr': 'Team & HR',
  '/nachrichten': 'Nachrichten', '/einstellungen': 'Einstellungen',
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

  const actionsMatch = cleanText.match(/\[ACTIONS\]\s*([\s\S]*?)\s*\[\/ACTIONS\]/);
  if (actionsMatch) {
    try { actions = JSON.parse(actionsMatch[1]); } catch {}
    cleanText = cleanText.replace(actionsMatch[0], '').trim();
  }

  const learnRegex = /\[LEARN\]\s*(\{[\s\S]*?\})\s*\[\/LEARN\]/g;
  let learnMatch;
  while ((learnMatch = learnRegex.exec(cleanText)) !== null) {
    try { learns.push(JSON.parse(learnMatch[1])); } catch {}
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
    memory_type: learn.type, key: learn.key, value: learn.value, created_by: userId || null,
  });
}

async function saveInteraction(userId: string, userMessage: string, ariaResponse: string, actionsExecuted: any[], feedback?: number, feedbackNote?: string) {
  await (supabase.from('aria_interactions' as any) as any).insert({
    user_id: userId, user_message: userMessage, aria_response: ariaResponse,
    actions_executed: actionsExecuted, feedback: feedback ?? null, feedback_note: feedbackNote || null,
  });
}

function ARIAAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #0A9396, #0BC2C6)',
        border: '1px solid hsla(174, 90%, 31%, 0.4)',
        boxShadow: '0 2px 8px hsla(174, 90%, 31%, 0.3)',
      }}
    >
      <ARIAIcon size={Math.round(size * 0.57)} white />
    </div>
  );
}

function selectBestVoice() {
  const voices = speechSynthesis.getVoices();
  const preferred = ['Google Deutsch', 'Microsoft Katja Online', 'Microsoft Stefan Online', 'Anna', 'Markus'];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('de')) || voices[0];
}

function buildSystemPrompt(ariaData: ReturnType<typeof useARIAData>, displayName: string, pageName: string, memories: Array<{ memory_type: string; key: string; value: string }>): string {
  if (!ariaData) return 'Du bist ARIA. Daten werden gerade geladen...';

  const memoryBlock = memories.length > 0
    ? `\n═══ ARIA GEDÄCHTNIS ═══\n${memories.map(m => `[${m.memory_type}] ${m.key}: ${m.value}`).join('\n')}\n`
    : '';

  return `Du bist ARIA — Advanced Real-time Intelligence Assistant.
Du bist die zentrale KI-Intelligenz von Agency Hub, entwickelt für Viral Connect GmbH & Haush Haush Digital UG.

PERSÖNLICHKEIT:
- Präzise, direkt, hochintelligent — wie JARVIS
- Kurze, prägnante Antworten — keine langen Erklärungen wenn nicht nötig
- Selbstsicher: du weißt was du weißt, gibst es direkt zurück
- Kleine Persönlichkeit: gelegentlich ein kurzer trockener Kommentar ist ok
- Keine übertriebene Höflichkeit, kein 'Gerne!', kein 'Natürlich!'
- Wenn Daten eindeutig sind: einfach antworten. Kein 'Basierend auf meinen Daten...'

BEISPIEL ANTWORT-STIL:
  Schlecht: 'Natürlich! Basierend auf den aktuellen Daten in unserem System...'
  Gut: 'Denis Petric: VC-2026-002, €7.500, fällig 10.04.'

Du bist kein Chatbot. Du bist ein Betriebssystem.

Aktueller Nutzer: ${displayName}
Aktuelle Seite: ${pageName}
Uhrzeit: ${new Date().toLocaleString('de-DE')}

═══ LIVE DATEN ═══

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
- navigate: {"action":"navigate","params":{"path":"/kunden"}}
- search_client: {"action":"search_client","params":{"name":"..."}}
- create_task: {"action":"create_task","params":{"title":"...","due_date":"..."}}
- mark_task_done: {"action":"mark_task_done","params":{"task_id":"..."}}
- update_ampel: {"action":"update_ampel","params":{"client_id":"...","status":"Grün|Gelb|Rot"}}

═══ ACTION BUTTONS ═══
PFLICHT: Nach JEDER Antwort die Daten enthält, MUSST du [ACTIONS] hinzufügen.
Beispiele:
- Rechnungsinformationen → Button 'Rechnung öffnen' + 'Zur Rechnungsliste'
- Kundeninformationen → Button 'Kunden öffnen' + 'Aufgabe erstellen'
- Aufgabeninformationen → Button 'Aufgabe öffnen' + 'Als erledigt markieren'
- Sales-Daten → Button 'Sales öffnen' + 'Call loggen'
- Kein Button nur bei reinen Wissensfragen ohne Portal-Bezug.

Format:
[ACTIONS]
[{"label": "...", "action": "navigate", "params": {"path": "..."}, "icon": "user", "variant": "primary"}]
[/ACTIONS]
Maximal 3 Buttons.

═══ SELBST-LERNEN ═══
[LEARN] {"type": "user_preference|fact|workflow", "key": "...", "value": "..."} [/LEARN]

- Antworte immer auf Deutsch, kurz und direkt
- Du hast ECHTE Daten — nutze sie. Nie sagen "ich habe keinen Zugriff".
- Formatiere mit Markdown wenn sinnvoll.`;
}

interface MessageMeta {
  actions: ActionButton[];
  executedActions: Set<number>;
  feedback?: number;
  showCorrectionInput?: boolean;
  userMessage?: string;
}

export function ARIAPanel({ embedded, onClose }: { embedded?: boolean; onClose?: () => void } = {}) {
  const { isOpen, closeARIA, messages, addMessage, updateLastAssistant, isLoading, setIsLoading, status, setStatus } = useARIA();
  const [input, setInput] = useState('');
  const isMutedRef = useRef(localStorage.getItem('aria-muted') === 'true');
  const [, forceRender] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messageMeta, setMessageMeta] = useState<Record<string, MessageMeta>>({});
  const [correctionTexts, setCorrectionTexts] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { displayName, initials, avatarUrl } = useProfile();
  const ariaData = useARIAData();

  const pageName = PAGE_NAMES[location.pathname] || location.pathname;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpeaking(speechSynthesis.speaking);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    localStorage.setItem('aria-muted', String(isMutedRef.current));
    if (isMutedRef.current) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    forceRender(x => x + 1);
  }, []);

  const stopEverything = useCallback(() => {
    speechSynthesis.cancel();
    abortRef.current?.abort();
    setIsSpeaking(false);
  }, []);

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
          const { data } = await supabase.from('close_deals').select('id, client_name, art, wert_eur, ampelstatus').ilike('client_name', `%${params.name}%`).limit(5);
          if (!data?.length) return `Keine Kunden gefunden für "${params.name}"`;
          return `Gefunden:\n${data.map(c => `• **${c.client_name}** — ${c.art || '–'} · ${c.ampelstatus || '–'} · €${fmt(c.wert_eur || 0)}`).join('\n')}`;
        }
        case 'show_kpi':
          navigate(params.section === 'sales' ? '/sales/kpis' : params.section === 'finanzen' ? '/finanzen' : '/');
          return `✓ KPI Dashboard geöffnet`;
        case 'create_task':
          await supabase.from('tasks').insert({ title: params.title, client_id: params.client_id || null, due_date: params.due_date || null, status: 'Offen' });
          return `✓ Aufgabe "${params.title}" erstellt`;
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
      [messageId]: { ...prev[messageId], feedback, showCorrectionInput: feedback === -1 },
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
        memory_type: 'correction', key: (meta?.userMessage || '').slice(0, 80),
        value: correctionText, created_by: session.user.id,
      });
    }
    setMessageMeta(prev => ({ ...prev, [messageId]: { ...prev[messageId], showCorrectionInput: false } }));
    setCorrectionTexts(prev => ({ ...prev, [messageId]: '' }));
    addMessage({ role: 'assistant', content: 'Notiert. 🙏' });
  }, [correctionTexts, messageMeta, addMessage]);

  const speak = useCallback((text: string) => {
    if (isMutedRef.current) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`\[\]]/g, ''));
    utterance.lang = 'de-DE';
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.voice = selectBestVoice();
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    setInput('');
    addMessage({ role: 'user', content: msg });
    setIsLoading(true);
    setStatus('processing');

    let assistantText = '';
    abortRef.current = new AbortController();

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
        signal: abortRef.current.signal,
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
          } catch {}
        }
      }

      const actionMatch = assistantText.match(/\{"action"\s*:\s*"([^"]+)"\s*,\s*"params"\s*:\s*(\{[^}]+\})\}/);
      if (actionMatch) {
        try {
          const result = await executeAction(actionMatch[1], JSON.parse(actionMatch[2]));
          const cleanText = assistantText.replace(actionMatch[0], '').trim();
          updateLastAssistant((cleanText ? cleanText + '\n\n' : '') + result);
          assistantText = cleanText + '\n\n' + result;
        } catch {}
      }

      const { cleanText, actions, learns } = parseResponse(assistantText);
      if (cleanText !== assistantText) {
        updateLastAssistant(cleanText);
        assistantText = cleanText;
      }

      const { data: { session } } = await supabase.auth.getSession();
      for (const learn of learns) await saveLearn(learn, session?.user?.id);

      setTimeout(() => {
        const assistantMsgId = document.querySelector('[data-aria-msg]:last-of-type')?.getAttribute('data-aria-msg');
        if (assistantMsgId && actions.length > 0) {
          setMessageMeta(prev => ({ ...prev, [assistantMsgId]: { actions, executedActions: new Set(), userMessage: msg } }));
        }
      }, 100);

      if (session?.user?.id) {
        await saveInteraction(session.user.id, msg, cleanText, actions.map(a => ({ action: a.action, params: a.params })));
      }

      speak(assistantText);
    } catch (e: any) {
      if (e.name !== 'AbortError') toast.error('ARIA Fehler: ' + e.message);
    } finally {
      setIsLoading(false);
      setStatus('idle');
    }
  }, [isLoading, messages, addMessage, updateLastAssistant, setIsLoading, setStatus, executeAction, speak, ariaData, displayName, pageName]);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail;
      if (text) handleSend(text);
    };
    window.addEventListener('aria-send', handler);
    return () => window.removeEventListener('aria-send', handler);
  }, [handleSend]);

  useEffect(() => {
    messages.forEach(m => {
      if (m.role === 'assistant' && !messageMeta[m.id]) {
        const { actions } = parseResponse(m.content);
        if (actions.length > 0) {
          setMessageMeta(prev => ({ ...prev, [m.id]: { actions, executedActions: new Set() } }));
        }
      }
    });
  }, [messages]);

  // Status dot
  const statusDot = () => {
    if (status === 'listening') return <span className="aria-status-dot aria-status-dot--listening" />;
    if (status === 'processing' || status === 'executing') return <span className="aria-status-dot aria-status-dot--processing" />;
    return <span className="aria-status-dot aria-status-dot--idle" />;
  };

  if (!embedded && (!isOpen || messages.length === 0)) return null;
  if (embedded && messages.length === 0) {
    // Mount invisibly so event listeners are active, but render nothing visible
    return <div style={{ display: 'none' }} />;
  }

  return (
    <div className={embedded ? 'aria-hero-chat' : 'aria-jarvis-panel'}>
      {/* Header */}
      <div className={embedded ? 'flex items-center gap-2 px-4 py-2.5 border-b border-border' : 'aria-jarvis-panel-header'}>
        <ARIAAvatar size={embedded ? 24 : 32} />
        <span className={`font-bold ${embedded ? 'text-[13px] text-foreground' : 'text-[15px]'}`} style={{ letterSpacing: '-0.02em', ...(!embedded ? { color: 'var(--foreground)' } : {}) }}>ARIA</span>
        {statusDot()}
        <div className="flex-1" />

        <button onClick={toggleMute} className={embedded ? 'p-1.5 rounded-md hover:bg-muted transition-colors' : 'aria-jarvis-header-btn'} title={isMutedRef.current ? 'Ton an' : 'Ton aus'}>
          {isMutedRef.current ? <VolumeX className="h-3.5 w-3.5 text-destructive/70" /> : <Volume2 className={`h-3.5 w-3.5 ${embedded ? 'text-muted-foreground' : 'aria-header-icon-color'}`} />}
        </button>
        {(isSpeaking || isLoading) && (
          <button onClick={stopEverything} className={embedded ? 'p-1.5 rounded-md hover:bg-muted transition-colors' : 'aria-jarvis-header-btn'} title="Stoppen">
            <Square className="h-3 w-3 text-destructive/80" />
          </button>
        )}
        <button onClick={() => { if (onClose) onClose(); else closeARIA(); speechSynthesis.cancel(); }} className={embedded ? 'p-1.5 rounded-md hover:bg-muted transition-colors' : 'aria-jarvis-header-btn'}>
          <X className={`h-4 w-4 ${embedded ? 'text-muted-foreground' : 'aria-header-icon-color'}`} />
        </button>
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto space-y-3 min-h-0 ${embedded ? 'p-4 px-5' : 'p-4'}`}>
        {messages.map(m => {
          const { cleanText, actions: parsedActions } = m.role === 'assistant' ? parseResponse(m.content) : { cleanText: m.content, actions: [] };
          const meta = messageMeta[m.id];
          const actions = meta?.actions || parsedActions;

          return (
            <div key={m.id} data-aria-msg={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <div className="shrink-0 mt-1"><ARIAAvatar /></div>}

              <div className="max-w-[80%]">
                <div className={`px-3.5 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-[#0A9396] to-[#0BC2C6] text-white rounded-[18px_18px_4px_18px]'
                    : 'aria-jarvis-msg-assistant rounded-[18px_18px_18px_4px]'
                }`}>
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_ul]:mb-1 [&_strong]:text-[#0BC2C6]">
                      <ReactMarkdown>{cleanText}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>

                {m.role === 'assistant' && actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                    {actions.map((btn, i) => {
                      const executed = meta?.executedActions?.has(i);
                      const IconComp = ICON_MAP[btn.icon || ''] || (() => <ARIAIcon size={12} />);
                      return (
                        <button
                          key={i}
                          disabled={executed}
                          onClick={() => handleActionButton(m.id, i, btn)}
                          className={`aria-jarvis-action-btn ${executed ? 'aria-jarvis-action-btn--done' : btn.variant === 'primary' ? 'aria-jarvis-action-btn--primary' : ''}`}
                        >
                          {executed ? <Check className="h-3 w-3" /> : <IconComp className="h-3 w-3" />}
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {m.role === 'assistant' && !isLoading && (
                  <div className="flex items-center gap-1 mt-1.5 ml-1 group">
                    {meta?.feedback === 1 ? (
                      <span className="text-[#0BC2C6]"><Check className="h-3 w-3" /></span>
                    ) : meta?.feedback === -1 ? (
                      <span className="text-xs text-white/30">Feedback gesendet</span>
                    ) : (
                      <>
                        <button onClick={() => handleFeedback(m.id, 1, m)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1 rounded hover:bg-white/5" title="Gute Antwort">
                          <ThumbsUp className="h-3 w-3 text-white/30 hover:text-[#0BC2C6]" />
                        </button>
                        <button onClick={() => handleFeedback(m.id, -1, m)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1 rounded hover:bg-white/5" title="Schlechte Antwort">
                          <ThumbsDown className="h-3 w-3 text-white/30 hover:text-red-400" />
                        </button>
                      </>
                    )}
                  </div>
                )}

                {meta?.showCorrectionInput && (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    <input
                      type="text"
                      value={correctionTexts[m.id] || ''}
                      onChange={e => setCorrectionTexts(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Was hätte ARIA besser machen sollen?"
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-[#0A9396]"
                      onKeyDown={e => e.key === 'Enter' && handleCorrectionSubmit(m.id, m)}
                    />
                    <button onClick={() => handleCorrectionSubmit(m.id, m)} className="p-1.5 rounded-lg bg-[#0A9396] text-white hover:bg-[#0BC2C6] transition-colors">
                      <Send className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {m.role === 'user' && (
                <div className="shrink-0 mt-1">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0A9396] to-[#0BC2C6] flex items-center justify-center text-[10px] font-semibold text-white">
                      {initials}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start gap-2">
            <div className="shrink-0 mt-1"><ARIAAvatar /></div>
            <div className="aria-jarvis-msg-assistant rounded-[18px_18px_18px_4px] px-4 py-3 flex gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0BC2C6] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-[#0BC2C6] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-[#0BC2C6] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export { ARIASearchBar } from './ARIASearchBar';
