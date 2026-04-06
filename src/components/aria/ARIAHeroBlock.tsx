import { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, ArrowUp, Square, VolumeX } from 'lucide-react';
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
  const [isSpeaking, setIsSpeaking] = useState(false);

  const { isListening, interimTranscript, startListening, stopListening } = useARIAVoice(
    (transcript) => {
      setInput('');
      onSend(transcript);
    }
  );

  const isProcessing = status === 'processing' || status === 'executing';

  // Track speechSynthesis speaking state
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpeaking(speechSynthesis.speaking);
    }, 200);
    return () => clearInterval(interval);
  }, []);

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

  const handleStopProcessing = () => {
    window.dispatchEvent(new CustomEvent('aria-abort'));
  };

  const handleStopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Dynamic right button
  const getRightButton = () => {
    // PRIORITY 1: API request running → STOP button
    if (isProcessing) return {
      icon: <Square className="h-[18px] w-[18px]" fill="white" />,
      className: 'aria-hero-btn aria-hero-btn--speaking',
      onClick: handleStopProcessing,
      title: 'Antwort stoppen',
    };
    // PRIORITY 2: ARIA speaking → MUTE/STOP speech
    if (isSpeaking) return {
      icon: <VolumeX className="h-[18px] w-[18px]" />,
      className: 'aria-hero-btn aria-hero-btn--speaking',
      onClick: handleStopSpeaking,
      title: 'Vorlesen stoppen',
    };
    // PRIORITY 3: Mic active → STOP listening (red)
    if (isListening) return {
      icon: <MicOff className="h-[18px] w-[18px]" />,
      className: 'aria-hero-btn aria-hero-btn--active',
      onClick: stopListening,
      title: 'Aufnahme stoppen',
    };
    // PRIORITY 4: Text typed → SEND button
    if (input.trim().length > 0) return {
      icon: <ArrowUp className="h-[18px] w-[18px]" />,
      className: 'aria-hero-btn',
      onClick: handleSubmit,
      title: 'Senden',
    };
    // DEFAULT: Mic button
    return {
      icon: <Mic className="h-[18px] w-[18px]" />,
      className: 'aria-hero-btn',
      onClick: handleMicClick,
      title: 'Sprachbefehl starten',
    };
  };

  const btn = getRightButton();
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

      {!isListening && !input.trim() && !isProcessing && !isSpeaking && (
        <span className="text-[10px] text-muted-foreground/45 border border-border/50 rounded-[5px] px-[7px] py-[2px] font-mono select-none">{isMac ? '⌘' : 'Ctrl+'}J</span>
      )}

      <button onClick={btn.onClick} title={btn.title} className={btn.className}>
        {btn.icon}
      </button>
    </div>
  );
}
