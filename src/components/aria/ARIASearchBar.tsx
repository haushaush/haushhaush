import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, ArrowUp, Square } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
import { ARIAIcon } from './ARIAIcon';
import { toast } from 'sonner';

interface ARIASearchBarProps {
  onSend: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
}

export function ARIASearchBar({ onSend, input, setInput }: ARIASearchBarProps) {
  const { isOpen, openARIA, status, setStatus, isLoading } = useARIA();
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isProcessing = status === 'processing' || status === 'executing';

  // Poll speechSynthesis.speaking
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpeaking(speechSynthesis.speaking);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
    setStatus('idle');
    document.documentElement.classList.remove('aria-listening');
  }, [setStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      document.documentElement.classList.remove('aria-listening');
    };
  }, []);

  // Listen for external stop requests
  useEffect(() => {
    const handler = () => stopListening();
    window.addEventListener('aria-stop-listening', handler);
    return () => window.removeEventListener('aria-stop-listening', handler);
  }, [stopListening]);


  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Spracherkennung nicht unterstützt. Bitte Chrome verwenden.');
      return;
    }
    if (!isOpen) openARIA();

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setStatus('listening');
    };
    recognition.onend = () => {
      setListening(false);
      setStatus('idle');
      recognitionRef.current = null;
      document.documentElement.classList.remove('aria-listening');
    };
    recognition.onerror = (e: any) => {
      setListening(false);
      setStatus('idle');
      recognitionRef.current = null;
      if (e.error === 'not-allowed') {
        toast.error('Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.');
      } else if (e.error !== 'no-speech') {
        toast.error(`Sprachfehler: ${e.error}`);
      }
    };
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      if (e.results[0].isFinal) {
        setInput('');
        onSend(transcript);
      } else {
        setInput(transcript);
      }
    };

    recognition.start();
  }, [isOpen, openARIA, onSend, setInput, setStatus]);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, stopListening, startListening]);

  // Stop mic on beforeunload
  useEffect(() => {
    const handler = () => stopListening();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [stopListening]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    if (!isOpen) openARIA();
    onSend(text);
  };

  const handleFocus = () => {
    if (!isOpen) openARIA();
  };

  // Dynamic right button logic
  const renderRightButton = () => {
    if (listening) {
      return (
        <button onClick={stopListening} className="aria-jarvis-mic aria-jarvis-mic--active" aria-label="Aufnahme stoppen" title="Aufnahme stoppen">
          <MicOff className="h-[22px] w-[22px]" />
        </button>
      );
    }
    if (isSpeaking) {
      return (
        <button onClick={() => { speechSynthesis.cancel(); setIsSpeaking(false); }} className="aria-jarvis-mic aria-jarvis-mic--speaking" aria-label="Antwort stoppen" title="Antwort stoppen">
          <Square className="h-5 w-5" fill="white" />
        </button>
      );
    }
    if (input.trim().length > 0) {
      return (
        <button onClick={handleSubmit} disabled={isLoading} className="aria-jarvis-mic" aria-label="Senden" title="Senden">
          <ArrowUp className="h-[22px] w-[22px]" />
        </button>
      );
    }
    return (
      <button onClick={startListening} className="aria-jarvis-mic" aria-label="Sprachbefehl" title="Sprachbefehl">
        <Mic className="h-[22px] w-[22px]" />
      </button>
    );
  };

  // Shortcut hint component
  const ShortcutHint = () => {
    if (listening || isSpeaking || input.trim().length > 0) return null;
    const isMac = navigator.platform?.toUpperCase().includes('MAC');
    return (
      <span className="aria-shortcut-hint">{isMac ? '⌘' : 'Ctrl+'}J</span>
    );
  };

  return (
    <div className={`aria-jarvis-pill ${listening ? 'aria-jarvis-pill--listening' : ''} ${isProcessing ? 'aria-jarvis-pill--processing' : ''} ${isOpen ? 'aria-jarvis-pill--open' : ''}`}>
      <ARIAIcon size={20} animated={isProcessing} />

      <div className="flex-1 min-w-0 flex items-center h-full">
        {listening ? (
          <div className="flex items-center gap-3 h-full">
            <div className="aria-waveform">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`bar bar-${i}`} />
              ))}
            </div>
            {input && <span className="text-sm text-white/80 truncate">{input}</span>}
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
