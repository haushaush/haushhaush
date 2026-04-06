import { useState, useRef, useCallback } from 'react';
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
    <div className={`aria-jarvis-pill ${listening ? 'aria-jarvis-pill--listening' : ''} ${isProcessing ? 'aria-jarvis-pill--processing' : ''}`}>
      {/* Sparkles icon */}
      <Sparkles className="aria-jarvis-icon" />

      {/* Input / waveform / processing */}
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

      {/* Send button (only when typing) */}
      {input.trim() && (
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="aria-jarvis-send"
        >
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      )}

      {/* Mic button */}
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
