import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { useARIA } from '@/contexts/ARIAContext';

export function ARIAGlow() {
  const { status } = useARIA();
  const isListening = status === 'listening';
  const isActive = isListening || status === 'processing' || status === 'executing';

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
      <div className="aria-ring aria-ring-1" />
      <div className="aria-ring aria-ring-2" />
      <div className="aria-ring aria-ring-3" />
      <div className="aria-ring aria-ring-4" />
    </div>,
    document.body
  );
}
