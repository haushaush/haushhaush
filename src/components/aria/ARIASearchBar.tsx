import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Mic, MicOff, ArrowUp } from 'lucide-react';
import { useARIA } from '@/contexts/ARIAContext';
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

  const isProcessing = status === 'processing' || status === 'executing';

  // Cleanup on unmount — always stop mic
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      setListening(false);
      document.documentElement.classList.remove('aria-listening');
    };
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setStatus('idle');
  }, [setStatus]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Spracherkennung nicht unterstützt. Bitte Chrome verwenden.');
      return;
    }
    if (!isOpen) openARIA();

    // Create fresh instance every time
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
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
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

  return (
    <div className={`aria-jarvis-pill ${listening ? 'aria-jarvis-pill--listening' : ''} ${isProcessing ? 'aria-jarvis-pill--processing' : ''}`}>
      <Sparkles className="aria-jarvis-icon" />

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

      {input.trim() && (
        <button onClick={handleSubmit} disabled={isLoading} className="aria-jarvis-send">
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      )}

      <button
        onClick={toggleListening}
        className={`aria-jarvis-mic ${listening ? 'aria-jarvis-mic--active' : ''}`}
        aria-label={listening ? 'Aufnahme stoppen' : 'Spracheingabe'}
      >
        {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>
    </div>
  );
}
