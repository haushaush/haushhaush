import { useRef, useState, useCallback, useEffect } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function useARIAVoice(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isListeningRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const fullStop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onstart = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }

    document.documentElement.style.setProperty('--aria-amplitude', '0');
    document.documentElement.classList.remove('aria-listening');

    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) {
      fullStop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Spracherkennung nicht unterstützt. Bitte Chrome oder Safari verwenden.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      try {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioCtxRef.current = audioCtx;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let currentAmp = 0;
        const tick = () => {
          if (!isListeningRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          currentAmp = currentAmp * 0.6 + Math.min(avg / 100, 1) * 0.4;
          document.documentElement.style.setProperty('--aria-amplitude', currentAmp.toFixed(3));
          animFrameRef.current = requestAnimationFrame(tick);
        };
        animFrameRef.current = requestAnimationFrame(tick);
      } catch {}

      const recognition = new SR();
      recognitionRef.current = recognition;
      recognition.lang = 'de-DE';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        document.documentElement.classList.add('aria-listening');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let final = '';
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
          else interim += event.results[i][0].transcript;
        }
        setInterimTranscript(interim);
        if (final) {
          fullStop();
          onTranscriptRef.current(final);
        }
      };

      recognition.onerror = () => {
        fullStop();
      };

      recognition.onend = () => {
        fullStop();
      };

      recognition.start();
    } catch (err) {
      console.error('Mic access denied:', err);
      fullStop();
    }
  }, [fullStop]);

  useEffect(() => {
    return () => { fullStop(); };
  }, [fullStop]);

  // External stop events
  useEffect(() => {
    const handler = () => fullStop();
    window.addEventListener('aria-stop-listening', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('aria-stop-listening', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [fullStop]);

  return { isListening, interimTranscript, startListening, stopListening: fullStop };
}
