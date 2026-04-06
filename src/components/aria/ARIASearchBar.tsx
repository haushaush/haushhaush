import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Mic, MicOff, ArrowUp } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { useProfile } from '@/hooks/useProfile';
import { useARIAData } from '@/hooks/useARIAData';
import { toast } from 'sonner';

const PLACEHOLDERS_FULL = [
  'Frag ARIA etwas...',
  'Was möchtest du wissen?',
  'Aufgabe erstellen, navigieren, analysieren...',
  'Sag mir was du brauchst...',
];

const ROUTE_PLACEHOLDERS: Record<string, string[]> = {
  '/kunden': ['Frag ARIA nach einem Kunden...', 'Ampelstatus prüfen...', 'Kundendaten abfragen...'],
  '/sales': ['KPIs abfragen, Calls loggen...', 'Sales Performance checken...', 'Abschlüsse diese Woche?'],
  '/finanzen': ['Rechnungen, MRR, Cashflow...', 'Offene Rechnungen prüfen...', 'ARR berechnen...'],
  '/hr': ['Team, Verträge, Akademie...', 'Urlaubsanträge prüfen...', 'Gehälter übersicht...'],
  '/projekte': ['Aufgaben, Projekte, Deadlines...', 'Überfällige Aufgaben?', 'Projektfortschritt prüfen...'],
};

function getRoutePlaceholders(path: string): string[] {
  for (const [route, placeholders] of Object.entries(ROUTE_PLACEHOLDERS)) {
    if (path.startsWith(route)) return placeholders;
  }
  return ['Frag ARIA etwas... (⌘J)', 'Wie kann ich helfen?', 'Aufgabe erstellen, navigieren...'];
}

function getGreeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Guten Morgen ${name}! Was steht heute an?`;
  if (h < 18) return `Hallo ${name}! Wie kann ich helfen?`;
  return `Guten Abend ${name}! Noch was zu tun?`;
}

function Waveform() {
  return (
    <div className="aria-waveform">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`bar bar-${i}`} />
      ))}
    </div>
  );
}

interface ARIASearchBarProps {
  onSend: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
  variant?: 'full' | 'slim';
  routePath?: string;
}

export function ARIASearchBar({ onSend, input, setInput, variant = 'full', routePath = '/' }: ARIASearchBarProps) {
  const { isOpen, openARIA, status, setStatus, isLoading } = useARIA();
  const { displayName } = useProfile();
  const ariaData = useARIAData();
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);

  const isFull = variant === 'full';
  const barHeight = isFull ? 52 : 48;
  const avatarSize = isFull ? 36 : 28;
  const inputHeight = isFull ? 52 : 32;

  // Cycle placeholders
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx(i => (i + 1) % (isFull ? PLACEHOLDERS_FULL.length : getRoutePlaceholders(routePath).length));
        setPlaceholderVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, [isFull, routePath]);

  // Proactive suggestion from data
  const proactiveSuggestion = ariaData && ariaData.overdueInvoicesCount > 0
    ? `💶 ${ariaData.overdueInvoicesCount} überfällige Rechnung${ariaData.overdueInvoicesCount > 1 ? 'en' : ''} — soll ich helfen?`
    : null;

  const currentPlaceholder = isFull
    ? (proactiveSuggestion || (placeholderIdx === 0 ? getGreeting(displayName) : PLACEHOLDERS_FULL[placeholderIdx]))
    : (proactiveSuggestion || getRoutePlaceholders(routePath)[placeholderIdx % getRoutePlaceholders(routePath).length]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    if (!isOpen) openARIA();
    onSend(text);
  };

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setStatus('idle');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Spracherkennung nicht unterstützt. Bitte Chrome verwenden.');
      return;
    }
    if (!isOpen) openARIA();
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
        onSend(transcript);
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
  }, [listening, isOpen, openARIA, onSend, setInput, setStatus]);

  const handleFocus = () => {
    if (!isOpen) openARIA();
  };

  return (
    <div
      className={`aria-search-bar ${isOpen ? 'aria-search-bar--active' : ''} ${listening ? 'aria-search-bar--listening' : ''}`}
      style={{ height: barHeight }}
    >
      {/* ARIA Avatar */}
      <div
        className={`aria-avatar ${listening ? 'aria-avatar--listening' : ''} ${status === 'processing' || status === 'executing' ? 'aria-avatar--processing' : ''}`}
        style={{ width: avatarSize, height: avatarSize }}
        onClick={handleFocus}
      >
        <Sparkles style={{ width: avatarSize * 0.5, height: avatarSize * 0.5 }} className="text-white" />
        {listening && (
          <>
            <span className="aria-avatar-ring aria-avatar-ring--1" />
            <span className="aria-avatar-ring aria-avatar-ring--2" />
          </>
        )}
        {(status === 'processing' || status === 'executing') && (
          <span className="aria-avatar-spinner" />
        )}
      </div>

      {/* Input area */}
      <div className="flex-1 min-w-0 relative" style={{ height: inputHeight }}>
        {listening ? (
          <div className="flex items-center gap-3 h-full">
            <Waveform />
            {input && <span className="text-sm text-foreground truncate">{input}</span>}
          </div>
        ) : status === 'processing' || status === 'executing' ? (
          <div className="flex items-center h-full">
            <span className="text-sm text-muted-foreground aria-dots">Denke nach</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            onFocus={handleFocus}
            placeholder={currentPlaceholder}
            className={`w-full h-full bg-transparent text-foreground outline-none aria-search-input ${!placeholderVisible ? 'placeholder-fade-out' : 'placeholder-fade-in'}`}
            style={{ fontSize: isFull ? 15 : 13 }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Mic */}
        <button
          onClick={toggleListening}
          className={`aria-mic-btn ${listening ? 'aria-mic-btn--active' : ''}`}
          style={{ width: isFull ? 40 : 28, height: isFull ? 40 : 28 }}
          aria-label={listening ? 'Aufnahme stoppen' : 'Spracheingabe'}
        >
          {listening ? <MicOff style={{ width: isFull ? 18 : 14, height: isFull ? 18 : 14 }} /> : <Mic style={{ width: isFull ? 18 : 14, height: isFull ? 18 : 14 }} />}
        </button>

        {/* ⌘J hint */}
        {!isFull && (
          <kbd className="hidden sm:inline-flex items-center text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">⌘J</kbd>
        )}
        {isFull && (
          <kbd className="hidden sm:inline-flex items-center text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        )}

        {/* Send */}
        {input.trim() && (
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="aria-send-btn"
            style={{ width: isFull ? 40 : 28, height: isFull ? 40 : 28 }}
          >
            <ArrowUp style={{ width: isFull ? 18 : 14, height: isFull ? 18 : 14 }} />
          </button>
        )}
      </div>
    </div>
  );
}
