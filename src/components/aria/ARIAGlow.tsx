import { createPortal } from 'react-dom';
import { useEffect, useRef, useCallback } from 'react';
import { useARIA } from '@/contexts/ARIAContext';

export function ARIAGlow() {
  const { status } = useARIA();
  const isListening = status === 'listening';
  const isActive = isListening || status === 'processing' || status === 'executing';
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Voice amplitude tracking
  const startAmplitudeTracking = useCallback(async () => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = audioContext;
      analyserRef.current = analyser;
      streamRef.current = stream;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(avg / 128, 1.0);
        document.documentElement.style.setProperty('--aria-amplitude', String(normalized));
        animFrameRef.current = requestAnimationFrame(update);
      };
      animFrameRef.current = requestAnimationFrame(update);
    } catch {
      // Mic access denied — glow still works without amplitude
    }
  }, []);

  const stopAmplitudeTracking = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    analyserRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    document.documentElement.style.setProperty('--aria-amplitude', '0');
  }, []);

  useEffect(() => {
    if (isListening) {
      startAmplitudeTracking();
    } else {
      stopAmplitudeTracking();
    }
    return () => stopAmplitudeTracking();
  }, [isListening, startAmplitudeTracking, stopAmplitudeTracking]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('aria-listening', 'aria-processing');
    if (status === 'listening') html.classList.add('aria-listening');
    else if (status === 'processing' || status === 'executing') html.classList.add('aria-processing');
    return () => {
      html.classList.remove('aria-listening', 'aria-processing');
    };
  }, [status]);

  return createPortal(
    <div
      id="aria-glow-system"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 99999,
        opacity: isActive ? 1 : 0,
        visibility: isActive ? 'visible' : 'hidden',
        transition: 'opacity 400ms ease, visibility 400ms ease',
      }}
    >
      <div className="aria-energy-line aria-line-1" />
      <div className="aria-energy-line aria-line-2" />
      <div className="aria-energy-line aria-line-3" />
      <div className="aria-energy-line aria-line-4" />
    </div>,
    document.body
  );
}
