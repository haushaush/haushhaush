import { useRef, useEffect } from 'react';
import { Mic, MicOff, ArrowUp, Square } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { ARIAIcon } from './ARIAIcon';
import { useARIAVoice } from '@/hooks/useARIAVoice';

interface ARIASearchBarProps {
  onSend: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
}

export function ARIASearchBar({ onSend, input, setInput }: ARIASearchBarProps) {
  const { isOpen, openARIA, status, setStatus, isLoading } = useARIA();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSpeaking, setIsSpeaking] = [false, (_: boolean) => {}]; // placeholder

  const { isListening, interimTranscript, startListening, stopListening } = useARIAVoice(
    (transcript) => {
      setInput('');
      onSend(transcript);
    }
  );

  const isProcessing = status === 'processing' || status === 'executing';

  // Sync listening state to ARIA context status
  useEffect(() => {
    if (isListening) setStatus('listening');
    else if (status === 'listening') setStatus('idle');
  }, [isListening, status, setStatus]);

  // Poll speechSynthesis.speaking
  const speakingRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      speakingRef.current = speechSynthesis.speaking;
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleMicClick = () => {
    if (!isOpen) openARIA();
    if (isListening) stopListening();
    else startListening();
  };

  // Listen for Cmd+J start-listening
  useEffect(() => {
    const handler = () => { if (!isListening) { if (!isOpen) openARIA(); startListening(); } };
    window.addEventListener('aria-start-listening', handler);
    return () => window.removeEventListener('aria-start-listening', handler);
  }, [isListening, isOpen, openARIA, startListening]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    if (!isOpen) openARIA();
    onSend(text);
  };

  const handleFocus = (e: React.FocusEvent) => {
    e.preventDefault();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    requestAnimationFrame(() => { window.scrollTo(scrollX, scrollY); });
    if (!isOpen) openARIA();
  };

  const renderRightButton = () => {
    if (isListening) {
      return (
        <button onClick={stopListening} className="aria-jarvis-mic aria-jarvis-mic--active" aria-label="Aufnahme stoppen">
          <MicOff className="h-[16px] w-[16px]" />
        </button>
      );
    }
    if (speakingRef.current) {
      return (
        <button onClick={() => speechSynthesis.cancel()} className="aria-jarvis-mic aria-jarvis-mic--speaking" aria-label="Antwort stoppen">
          <Square className="h-[16px] w-[16px]" fill="white" />
        </button>
      );
    }
    if (input.trim().length > 0) {
      return (
        <button onClick={handleSubmit} disabled={isLoading} className="aria-jarvis-mic" aria-label="Senden">
          <ArrowUp className="h-[16px] w-[16px]" />
        </button>
      );
    }
    return (
      <button onClick={handleMicClick} className="aria-jarvis-mic" aria-label="Sprachbefehl">
        <Mic className="h-[16px] w-[16px]" />
      </button>
    );
  };

  const ShortcutHint = () => {
    if (isListening || speakingRef.current || input.trim().length > 0) return null;
    const isMac = navigator.platform?.toUpperCase().includes('MAC');
    return <span className="aria-shortcut-hint">{isMac ? '⌘' : 'Ctrl+'}J</span>;
  };

  return (
    <div className={`aria-jarvis-pill ${isListening ? 'aria-jarvis-pill--listening' : ''} ${isProcessing ? 'aria-jarvis-pill--processing' : ''} ${isOpen ? 'aria-jarvis-pill--open' : ''}`} style={{ position: 'relative' }}>
      {isListening && (
        <div className="aria-voice-transcript">
          {interimTranscript || 'Ich höre zu...'}
        </div>
      )}
      <ARIAIcon size={25} animated={isProcessing} />

      <div className="flex-1 min-w-0 flex items-center h-full">
        {isListening ? (
          <div className="flex items-center gap-3 h-full">
            <div className="aria-waveform">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`bar bar-${i}`} />
              ))}
            </div>
          </div>
        ) : isProcessing ? (
          <span className="text-sm text-white/40 aria-dots">Denke nach</span>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            onFocus={handleFocus}
            placeholder="Wie kann ich helfen?"
            className="aria-jarvis-input"
          />
        )}
      </div>

      <ShortcutHint />
      {renderRightButton()}
    </div>
  );
}
