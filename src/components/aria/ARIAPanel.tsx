import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Volume2, VolumeX } from 'lucide-react';
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

function buildSystemPrompt(ariaData: ReturnType<typeof useARIAData>, displayName: string, pageName: string): string {
  if (!ariaData) return 'Du bist ARIA, der KI-Assistent von Agency Hub. Daten werden gerade geladen...';

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

═══ VERFÜGBARE AKTIONEN ═══
Du kannst Aktionen ausführen indem du JSON zurückgibst:
- navigate: {"action":"navigate","params":{"path":"/kunden"}}
- search_client: {"action":"search_client","params":{"name":"Kehlenbach"}}
- show_kpi: {"action":"show_kpi","params":{"section":"sales"}}
- create_task: {"action":"create_task","params":{"title":"...","due_date":"..."}}
- mark_task_done: {"action":"mark_task_done","params":{"task_id":"..."}}
- update_ampel: {"action":"update_ampel","params":{"client_id":"...","status":"Grün|Gelb|Rot"}}

VERHALTEN:
- Antworte immer auf Deutsch, kurz und direkt
- Du hast ECHTE Daten — nutze sie. Nie sagen "ich habe keinen Zugriff".
- Wenn der Nutzer nach einem Kunden fragt, suche in der Kundenliste (case-insensitive).
- Formatiere Antworten mit Markdown wenn sinnvoll.`;
}

export function ARIAPanel() {
  const { isOpen, closeARIA, messages, addMessage, updateLastAssistant, isLoading, setIsLoading, status, setStatus } = useARIA();
  const [input, setInput] = useState('');
  const [speakEnabled, setSpeakEnabled] = useState(() => localStorage.getItem('aria-speak') === 'true');
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

  const speak = useCallback((text: string) => {
    if (!speakEnabled) return;
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, ''));
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
      const history = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user' as const, content: msg }];
      const systemPrompt = buildSystemPrompt(ariaData, displayName, pageName);

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
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-[18px_18px_4px_18px]'
                    : 'bg-background text-foreground rounded-[18px_18px_18px_4px] border border-border'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_ul]:mb-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : m.content}
              </div>
            </div>
          ))}
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

      {/* The search bar itself is rendered in Dashboard/DashboardLayout — not here */}
    </>
  );
}

// Export for use in Dashboard and DashboardLayout
export { ARIASearchBar } from './ARIASearchBar';
