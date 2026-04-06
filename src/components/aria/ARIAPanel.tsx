import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Mic, MicOff, ArrowUp, Volume2, VolumeX } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
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

  const pageName = PAGE_NAMES[location.pathname] || location.pathname;

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
          const { data } = await supabase
            .from('close_deals')
            .select('id, client_name, art, wert_eur, ampelstatus')
            .ilike('client_name', `%${params.name}%`)
            .limit(5);
          if (!data?.length) return `Keine Kunden gefunden für "${params.name}"`;
          return `Gefunden:\n${data.map(c => `• **${c.client_name}** — ${c.art || '–'} · ${c.ampelstatus || '–'} · €${(c.wert_eur || 0).toLocaleString('de-DE')}`).join('\n')}`;
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
  }, [navigate, setStatus]);

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

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
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
  }, [input, isLoading, messages, addMessage, updateLastAssistant, setIsLoading, setStatus, executeAction, speak]);

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
      <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border" style={{ background: 'hsla(174, 90%, 31%, 0.05)' }}>
        📍 {pageName} · {displayName} · {new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center mb-4">Hallo {displayName}! Wie kann ich dir helfen?</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => handleSend(s)} className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
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
          placeholder="Frag ARIA etwas..."
          className="flex-1 h-10 rounded-full border border-input bg-background px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
          style={{ background: 'hsl(var(--primary))' }}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
