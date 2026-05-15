import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface ErrorCard {
  id: string;
  message: string;
  code: string;
  stack?: string;
  source?: string;
  timestamp: Date;
}

interface ErrorContextType {
  errorCards: ErrorCard[];
  showErrorCard: (error: Omit<ErrorCard, 'id' | 'timestamp'>) => void;
  dismissErrorCard: (id: string) => void;
}

const ErrorContext = createContext<ErrorContextType>({} as ErrorContextType);

export const useErrorContext = () => useContext(ErrorContext);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errorCards, setErrorCards] = useState<ErrorCard[]>([]);

  const dismissErrorCard = useCallback((id: string) => {
    setErrorCards(prev => prev.filter(e => e.id !== id));
  }, []);

  const showErrorCard = useCallback((error: Omit<ErrorCard, 'id' | 'timestamp'>) => {
    const card: ErrorCard = {
      ...error,
      id: Math.random().toString(36).slice(2),
      timestamp: new Date(),
    };
    setErrorCards(prev => [card, ...prev].slice(0, 3));
    setTimeout(() => dismissErrorCard(card.id), 12000);
  }, [dismissErrorCard]);

  // Global error interceptors
  useEffect(() => {
    const isCrossOriginIframeError = (msg: string, filename?: string, lineno?: number, colno?: number) =>
      msg === 'Script error.' ||
      msg === 'Script error' ||
      msg.includes('cross-origin') ||
      msg.includes('SecurityError') ||
      (!filename && !lineno && !colno);

    const handleError = (event: ErrorEvent) => {
      if (isCrossOriginIframeError(event.message, event.filename, event.lineno, event.colno)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'IFRAME') return;
      showErrorCard({
        message: event.message,
        code: `ERR_${Date.now().toString(36).toUpperCase()}`,
        stack: event.error?.stack,
        source: event.filename,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || String(event.reason);
      if (isCrossOriginIframeError(message)) return;
      showErrorCard({
        message,
        code: `REJ_${Date.now().toString(36).toUpperCase()}`,
        stack: event.reason?.stack,
        source: 'Promise',
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [showErrorCard]);

  return (
    <ErrorContext.Provider value={{ errorCards, showErrorCard, dismissErrorCard }}>
      {children}
    </ErrorContext.Provider>
  );
}
