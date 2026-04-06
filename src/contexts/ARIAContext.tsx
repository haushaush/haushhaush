import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface ARIAMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actionResult?: string;
}

interface ARIAContextType {
  isOpen: boolean;
  openARIA: () => void;
  closeARIA: () => void;
  toggleARIA: () => void;
  messages: ARIAMessage[];
  addMessage: (msg: Omit<ARIAMessage, 'id' | 'timestamp'>) => void;
  updateLastAssistant: (content: string) => void;
  clearMessages: () => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  status: 'idle' | 'listening' | 'processing' | 'executing';
  setStatus: (s: 'idle' | 'listening' | 'processing' | 'executing') => void;
}

const ARIAContext = createContext<ARIAContextType>({} as ARIAContextType);

export const useARIA = () => useContext(ARIAContext);

export function ARIAProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ARIAMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'executing'>('idle');

  const openARIA = useCallback(() => setIsOpen(true), []);
  const closeARIA = useCallback(() => setIsOpen(false), []);
  const toggleARIA = useCallback(() => setIsOpen(p => !p), []);

  const addMessage = useCallback((msg: Omit<ARIAMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => {
      const next = [...prev, { ...msg, id: crypto.randomUUID(), timestamp: new Date() }];
      return next.slice(-30); // max 30 messages
    });
  }, []);

  const updateLastAssistant = useCallback((content: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
      }
      return [...prev, { id: crypto.randomUUID(), role: 'assistant' as const, content, timestamp: new Date() }];
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  // Keyboard shortcut: Cmd+J / Ctrl+J → focus ARIA bar; Escape → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        openARIA();
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('.aria-search-input');
          if (el) el.focus();
        }, 100);
      }
      if (e.key === 'Escape' && isOpen) {
        closeARIA();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, openARIA, closeARIA]);

  return (
    <ARIAContext.Provider value={{
      isOpen, openARIA, closeARIA, toggleARIA,
      messages, addMessage, updateLastAssistant, clearMessages,
      isLoading, setIsLoading, status, setStatus,
    }}>
      {children}
    </ARIAContext.Provider>
  );
}
