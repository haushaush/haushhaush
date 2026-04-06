import { useRef, useEffect } from 'react';
import { Mic, MicOff, ArrowUp, Square } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { ARIAIcon } from './ARIAIcon';
import { useARIAVoice } from '@/hooks/useARIAVoice';

interface ARIAHeroBlockProps {
  onSend: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
}

export function ARIAHeroBlock({ onSend, input, setInput }: ARIAHeroBlockProps) {
  const { isOpen, openARIA, status, setStatus, isLoading, messages } = useARIA();
  const inputRef = useRef<HTMLInputElement>(null);

  const { isListening, interimTranscript, startListening, stopListening } = useARIAVoice(
    (transcript) => {
      setInput('');
      onSend(transcript);
    }
  );

  const isProcessing = status === 'processing' || status === 'executing';
  const hasMessages = isOpen && messages.length > 0;

  // Sync listening state to ARIA context status
  useEffect(() => {
    if (isListening) setStatus('listening');
    else if (status === 'listening') setStatus('idle');
  }, [isListening, status, setStatus]);

  const handleMicClick = () => {
    if (!isOpen) openARIA();
    if (isListening) stopListening();
    else startListening();
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    const savedY = window.scrollY;
    const savedX = window.scrollX;
    if (!isOpen) openARIA();
    onSend(text);
    setInput('');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, left: savedX, behavior: 'instant' as ScrollBehavior });
      });
    });
  };

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');

  return (
    <div
      className={`aria-hero-input-bar ${isListening ? 'aria-hero-input-bar--listening' : ''}`}
    >
      {isListening && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-card border border-border rounded-md px-3 py-1 shadow-sm whitespace-nowrap z-10">
          {interimTranscript || 'Ich höre zu...'}
        </div>
      )}
      <ARIAIcon size={28} animated={isProcessing} />
      <div className="flex-1 min-w-0">
        {isListening ? (
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
            onFocus={() => {
              const y = window.scrollY;
              requestAnimationFrame(() => window.scrollTo(0, y));
            }}
            placeholder="Wie kann ich helfen?"
            className="w-full bg-transparent border-none outline-none text-[15px] text-foreground placeholder:text-muted-foreground"
            style={{ minWidth: 0, scrollMargin: 0 }}
          />
        )}
      </div>

      {!isListening && !input.trim() && (
        <span className="text-[10px] text-muted-foreground/45 border border-border/50 rounded-[5px] px-[7px] py-[2px] font-mono select-none">{isMac ? '⌘' : 'Ctrl+'}J</span>
      )}

      {isListening ? (
        <button onClick={stopListening} className="aria-hero-btn aria-hero-btn--active"><MicOff className="h-[18px] w-[18px]" /></button>
      ) : input.trim() ? (
        <button onClick={handleSubmit} disabled={isLoading} className="aria-hero-btn"><ArrowUp className="h-[18px] w-[18px]" /></button>
      ) : (
        <button onClick={handleMicClick} className="aria-hero-btn"><Mic className="h-[18px] w-[18px]" /></button>
      )}
    </div>
  );
}
