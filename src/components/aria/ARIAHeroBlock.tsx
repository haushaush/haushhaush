import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, ArrowUp, Square } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { ARIAIcon } from './ARIAIcon';
import { toast } from 'sonner';

interface ARIAHeroBlockProps {
  onSend: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
}

export function ARIAHeroBlock({ onSend, input, setInput }: ARIAHeroBlockProps) {
  const { isOpen, openARIA, status, setStatus, isLoading, messages } = useARIA();
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

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
    return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} } };
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

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');

  return (
    <div
      className={`aria-hero-input-bar ${hasMessages ? 'aria-hero-input-bar--connected' : ''} ${listening ? 'aria-hero-input-bar--listening' : ''}`}
    >
      {listening && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-card border border-border rounded-md px-3 py-1 shadow-sm whitespace-nowrap z-10">
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

      {!listening && !isSpeaking && !input.trim() && (
        <span className="text-[10px] text-muted-foreground/45 border border-border/50 rounded-[5px] px-[7px] py-[2px] font-mono select-none">{isMac ? '⌘' : 'Ctrl+'}J</span>
      )}

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
  );
}
