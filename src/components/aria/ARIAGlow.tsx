import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { useARIA } from '@/contexts/ARIAContext';

export function ARIAGlow() {
  const { isOpen, status } = useARIA();

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('aria-listening', 'aria-processing');
    if (isOpen) {
      if (status === 'listening') html.classList.add('aria-listening');
      else if (status === 'processing' || status === 'executing') html.classList.add('aria-processing');
    }
    return () => {
      html.classList.remove('aria-listening', 'aria-processing');
    };
  }, [isOpen, status]);

  if (!isOpen) return null;

  return createPortal(
    <div id="aria-screen-glow" />,
    document.body
  );
}
