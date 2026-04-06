import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Mic, MicOff, ArrowUp, Volume2, VolumeX } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useARIAData } from '@/hooks/useARIAData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

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

const SUGGESTIONS = [
  '📊 Sales KPIs diese Woche?',
  '⚠️ Zeig mir offene Aufgaben',
  '💶 Navigiere zu Finanzen',
  '🔍 Suche Kunde Kehlenbach',
];

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
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(() => localStorage.getItem('aria-speak') === 'true');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { displayName } = useProfile();
  const ariaData = useARIAData();

  const pageName = PAGE_NAMES[location.pathname] || location.pathname;
  const dataLoaded = ariaData !== null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

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

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
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

      // Check for action JSON in response
      const actionMatch = assistantText.match(/\{"action"\s*:\s*"([^"]+)"\s*,\s*"params"\s*:\s*(\{[^}]+\})\}/);
      if (actionMatch) {
        try {
          const actionName = actionMatch[1];
          const actionParams = JSON.parse(actionMatch[2]);
          const result = await executeAction(actionName, actionParams);
          const cleanText = assistantText.replace(actionMatch[0], '').trim();
          updateLastAssistant((cleanText ? cleanText + '\n\n' : '') + result);
          assistantText = cleanText + '\n\n' + result;
        } catch { /* ignore parse errors */ }
      }

      speak(assistantText);
    } catch (e: any) {
      toast.error('ARIA Fehler: ' + e.message);
    } finally {
      setIsLoading(false);
      setStatus('idle');
    }
  }, [input, isLoading, messages, addMessage, updateLastAssistant, setIsLoading, setStatus, executeAction, speak, ariaData, displayName, pageName]);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setStatus('idle');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Spracherkennung wird nicht unterstützt. Bitte Chrome verwenden.');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => { setListening(true); setStatus('listening'); };
    recognition.onend = () => { setListening(false); setStatus('idle'); };
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      if (e.results[0].isFinal) {
        setInput('');
        handleSend(transcript);
      } else {
        setInput(transcript);
      }
    };
    recognition.onerror = (e: any) => {
      setListening(false);
      setStatus('idle');
      if (e.error !== 'no-speech') toast.error(`Sprachfehler: ${e.error}`);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [listening, handleSend, setStatus]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[99998] flex flex-col overflow-hidden"
      style={{
        bottom: 92, right: 24, width: 420, maxWidth: '95vw', maxHeight: '70vh',
        background: 'hsl(var(--card))',
        border: '1px solid hsla(174, 90%, 31%, 0.3)',
        borderRadius: 20,
        boxShadow: '0 24px 80px hsla(0, 0%, 0%, 0.25), 0 0 0 1px hsla(174, 90%, 31%, 0.1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: 'linear-gradient(135deg, hsl(174 90% 31%), hsl(180 80% 45%))' }}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center bg-white/20 ${isLoading ? 'animate-pulse' : ''}`}>
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-base">ARIA</div>
          <div className="text-white/80 text-[11px]">{STATUS_TEXT[status]}</div>
        </div>
        <button onClick={toggleListening} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${listening ? 'bg-red-500/80 animate-pulse' : 'bg-white/20 hover:bg-white/30'}`}>
          {listening ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-white" />}
        </button>
        <button onClick={() => setSpeakEnabled(p => !p)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors">
          {speakEnabled ? <Volume2 className="h-4 w-4 text-white" /> : <VolumeX className="h-4 w-4 text-white" />}
        </button>
        <button onClick={closeARIA} className="text-white/60 hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Context chip */}
      <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border flex items-center gap-2" style={{ background: 'hsla(174, 90%, 31%, 0.05)' }}>
        <span>📍 {pageName} · {displayName} · {new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
        {dataLoaded && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Live-Daten geladen" />}
        {!dataLoaded && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" title="Daten laden..." />}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center mb-4">Hallo {displayName}! Wie kann ich dir helfen?</p>
            {!dataLoaded && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Lade aktuelle Daten...
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => handleSend(s)} disabled={!dataLoaded} className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
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

      {/* Input */}
      <div className="border-t border-border p-3 flex gap-2 bg-background" style={{ borderRadius: '0 0 20px 20px' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={dataLoaded ? 'Frag ARIA etwas...' : 'Daten werden geladen...'}
          disabled={!dataLoaded}
          className="flex-1 h-10 rounded-full border border-input bg-background px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading || !dataLoaded}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
          style={{ background: 'hsl(var(--primary))' }}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
