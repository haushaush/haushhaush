import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, ArrowUp, Square, X, Volume2, VolumeX } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { ARIAIcon } from './ARIAIcon';
import { toast } from 'sonner';

interface ARIAHeroBlockProps {
  onSend: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
}

export function ARIAHeroBlock({ onSend, input, setInput }: ARIAHeroBlockProps) {
  const { isOpen, openARIA, closeARIA, status, setStatus, isLoading, messages } = useARIA();
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const isMutedRef = useRef(localStorage.getItem('aria-muted') === 'true');
  const [, forceRender] = useState(0);

  const isProcessing = status === 'processing' || status === 'executing';
  const hasMessages = isOpen && messages.length > 0;

  useEffect(() => {
    const interval = setInterval(() => setIsSpeaking(speechSynthesis.speaking), 200);
    return () => clearInterval(interval);
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
    setStatus('idle');
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
    };
  }, []);

  useEffect(() => {
    const handler = () => stopListening();
    window.addEventListener('aria-stop-listening', handler);
    return () => window.removeEventListener('aria-stop-listening', handler);
  }, []);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Spracherkennung nicht unterstützt.'); return; }
    if (!isOpen) openARIA();
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => { setListening(true); setStatus('listening'); };
    recognition.onend = () => { setListening(false); setInterimTranscript(''); setStatus('idle'); recognitionRef.current = null; };
    recognition.onerror = (e: any) => { setListening(false); setInterimTranscript(''); setStatus('idle'); recognitionRef.current = null; if (e.error === 'not-allowed') toast.error('Mikrofon-Zugriff verweigert.'); };
    recognition.onresult = (e: any) => {
      let interim = '', final = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInterimTranscript(interim);
      if (final) { setInterimTranscript(''); setInput(''); onSend(final); }
    };
    recognition.start();
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    if (!isOpen) openARIA();
    onSend(text);
    setInput('');
  };

  const toggleMute = () => {
    isMutedRef.current = !isMutedRef.current;
    localStorage.setItem('aria-muted', String(isMutedRef.current));
    if (isMutedRef.current) { speechSynthesis.cancel(); setIsSpeaking(false); }
    forceRender(x => x + 1);
  };

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');

  return (
    <div className="w-full" style={{ marginTop: 16 }}>
      {/* Chat area — only when open + messages */}
      {hasMessages && (
        <div className="aria-hero-chat">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #0A9396, #0BC2C6)' }}>
              <ARIAIcon size={14} white />
            </div>
            <span className="text-[13px] font-semibold text-foreground tracking-tight">ARIA</span>
            <span className="aria-status-dot aria-status-dot--idle" />
            <div className="flex-1" />
            <button onClick={toggleMute} className="p-1.5 rounded-md hover:bg-muted transition-colors" title={isMutedRef.current ? 'Ton an' : 'Ton aus'}>
              {isMutedRef.current ? <VolumeX className="h-3.5 w-3.5 text-destructive/70" /> : <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {(isSpeaking || isLoading) && (
              <button onClick={() => { speechSynthesis.cancel(); setIsSpeaking(false); }} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <Square className="h-3 w-3 text-destructive/80" />
              </button>
            )}
            <button onClick={() => { closeARIA(); speechSynthesis.cancel(); }} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {/* Messages — rendered by ARIAPanel via portal or we re-use the panel's message rendering */}
          <div className="aria-hero-messages" id="aria-hero-messages-container" />
        </div>
      )}

      {/* Input bar */}
      <div
        className={`aria-hero-input-bar ${hasMessages ? 'aria-hero-input-bar--connected' : ''} ${listening ? 'aria-hero-input-bar--listening' : ''}`}
      >
        {listening && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-card border border-border rounded-md px-3 py-1 shadow-sm whitespace-nowrap">
            {interimTranscript || 'Ich höre zu...'}
          </div>
        )}
        <ARIAIcon size={28} animated={isProcessing} />
        <div className="flex-1 min-w-0">
          {listening ? (
            <div className="aria-waveform">
              {[1,2,3,4,5].map(i => <div key={i} className={`bar bar-${i}`} />)}
            </div>
          ) : isProcessing ? (
            <span className="text-sm text-muted-foreground aria-dots">Denke nach</span>
          ) : (
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              onFocus={() => { if (!isOpen) openARIA(); }}
              placeholder="Wie kann ich helfen?"
              className="w-full bg-transparent border-none outline-none text-[15px] text-foreground placeholder:text-muted-foreground"
              style={{ minWidth: 0 }}
            />
          )}
        </div>

        {/* Shortcut hint */}
        {!listening && !isSpeaking && !input.trim() && (
          <span className="text-[10px] text-muted-foreground/45 border border-border/50 rounded-[5px] px-[7px] py-[2px] font-mono select-none">{isMac ? '⌘' : 'Ctrl+'}J</span>
        )}

        {/* Right button */}
        {listening ? (
          <button onClick={stopListening} className="aria-hero-btn aria-hero-btn--active"><MicOff className="h-[18px] w-[18px]" /></button>
        ) : isSpeaking ? (
          <button onClick={() => { speechSynthesis.cancel(); setIsSpeaking(false); }} className="aria-hero-btn aria-hero-btn--speaking"><Square className="h-[18px] w-[18px]" fill="currentColor" /></button>
        ) : input.trim() ? (
          <button onClick={handleSubmit} disabled={isLoading} className="aria-hero-btn"><ArrowUp className="h-[18px] w-[18px]" /></button>
        ) : (
          <button onClick={startListening} className="aria-hero-btn"><Mic className="h-[18px] w-[18px]" /></button>
        )}
      </div>
    </div>
  );
}
